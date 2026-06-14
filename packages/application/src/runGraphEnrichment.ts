import type {
  Concept,
  ConceptCluster,
  DerivedGraphLayer,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  PrerequisiteJudgment,
  SourceBlock
} from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  DerivedGraphLayerStorePort,
  DifficultyPort,
  EmbeddingPort,
  PrerequisiteJudgmentPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.5.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // Tier-2 contextual-embedding cluster threshold (ADR-0012). Recorded as
  // provenance and used to gate pairs ONLY for domains larger than
  // `exhaustiveDomainMaxConcepts`. It never removes a same-domain pair below that
  // size — embeddings are additive-for-recall, never a precision-reducing veto.
  clusterCosineThreshold: number;
  // The Declared-Domain gate (ADR-0015) is the mandatory primary bound. At or
  // below this many concepts per domain, every same-domain pair is judged
  // (C(14,2)=91 calls worst case — cheap). Above it, the embedding cluster gate
  // additionally restricts pairs to bound the N^2 judgment cost (method stack §3).
  exhaustiveDomainMaxConcepts: number;
  // Weak-edge cut floor applied before cycle removal.
  minEdgeConfidence: number;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  enrichmentConfigHash: "slice-enrichment-v1",
  clusterCosineThreshold: 0.55,
  exhaustiveDomainMaxConcepts: 14,
  minEdgeConfidence: 0.5
};

// Graph Enrichment — the third operation (ADR-0019). The LLM proposes (contextual
// embeddings cluster concepts to gate pairs; a bounded judge rules on each gated
// pair); the symbolic helpers dispose (weak-edge cut -> cycle removal -> transitive
// reduction); difficulty is mocked behind DifficultyPort. Produces an immutable
// Derived Graph Layer keyed to (graphVersionId + config) and never touches the
// asserted core. Replayable from (version + config + captured judgments).
//
// SKELETON: the deterministic assembly + persistence are complete; the embedding,
// clustering, and judge calls go through real ports, and the evidence-packet
// assembly (marked TODO) is the remaining InstructKG wiring for the work slice.
export async function runGraphEnrichment(input: {
  enrichmentId: string;
  graphVersionId: string;
  graphStore: GraphVersionStorePort;
  embedding: EmbeddingPort;
  prerequisiteJudge: PrerequisiteJudgmentPort;
  difficulty: DifficultyPort;
  layerStore: DerivedGraphLayerStorePort;
  artifacts: ArtifactRepositoryPort;
  config?: GraphEnrichmentConfig;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const snapshot = await input.graphStore.getPublishedSnapshot();
  if (!snapshot || snapshot.graphVersionId !== input.graphVersionId) {
    throw new Error(`runGraphEnrichment: published version ${input.graphVersionId} not found.`);
  }
  const concepts = snapshot.concepts;

  // Step 1 — contextual text per concept (definition + evidence), NEVER the bare
  // label (ADR-0012 tier 2). Embedding then clusters; clustering only gates pairs.
  const texts = concepts.map((concept) => conceptContextText(concept, snapshot));
  const vectors = await input.embedding.embed({ texts });
  const clusters = clusterByCosine(concepts, vectors, config.clusterCosineThreshold, input.embedding.model);

  // Step 2 — gate candidate pairs. The Declared-Domain gate is primary; the
  // embedding cluster only further restricts domains above the exhaustive size
  // budget (ADR-0012 additive-for-recall: it never removes a small domain's pairs).
  const pairs = gatedPairs(concepts, clusters, config.exhaustiveDomainMaxConcepts);

  // Step 3 — bounded LLM prerequisite judgment per gated pair (neural proposes).
  // Each pair gets an InstructKG-style evidence packet: the concepts' definition
  // literals plus the verbatim source quotes from every published claim that
  // touches either concept, so the judge reasons over real source text — not bare
  // labels (ADR-0019 method stack §3). Definitions are surfaced separately so the
  // judge can anchor on each concept's meaning.
  const definitionOf = definitionsByConcept(snapshot);
  const evidenceOf = evidenceBlocksByConcept(snapshot);
  const judgments: PrerequisiteJudgment[] = [];
  for (const [a, b] of pairs) {
    judgments.push(
      await input.prerequisiteJudge.judge({
        declaredDomain: a.declaredDomain,
        a: { conceptId: a.conceptId, canonicalLabel: a.canonicalLabel, definition: definitionOf.get(a.conceptId) },
        b: { conceptId: b.conceptId, canonicalLabel: b.canonicalLabel, definition: definitionOf.get(b.conceptId) },
        evidencePacket: dedupeBlocks([...(evidenceOf.get(a.conceptId) ?? []), ...(evidenceOf.get(b.conceptId) ?? [])])
      })
    );
  }

  // Step 4 — map judgments to raw edges. "none" is dropped; "uncertain" is flagged
  // and retained for inspection but kept OUT of the traversable DAG.
  const rawEdges: InferredPrerequisiteEdge[] = judgments
    .filter((judgment) => judgment.outcome !== "none")
    .map((judgment) => ({
      prerequisiteConceptId: judgment.prerequisiteConceptId,
      dependentConceptId: judgment.dependentConceptId,
      predicate: "inferred-prerequisite-of",
      confidence: judgment.confidence,
      uncertain: judgment.outcome === "uncertain",
      clusterId: clusterIdFor(judgment.prerequisiteConceptId, clusters),
      provenance: { judgmentRationale: judgment.rationale }
    }));

  // Step 5 — symbolic disposal over CERTAIN edges only (symbolic constrains).
  const uncertainEdges = rawEdges.filter((edge) => edge.uncertain);
  const { kept: strongEdges } = cutWeakEdges(
    rawEdges.filter((edge) => !edge.uncertain),
    config.minEdgeConfidence
  );
  const { edges: acyclicEdges } = removeCycles(strongEdges);
  const { edges: reducedEdges } = transitiveReduction(acyclicEdges);
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 6 — baseline difficulty over the reduced DAG (mock behind the port).
  const difficulties = await input.difficulty.score({ concepts, prerequisiteEdges: reducedEdges });

  const layer: DerivedGraphLayer = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    embeddingModel: input.embedding.model,
    judgeModel: input.prerequisiteJudge.model,
    clusters,
    prerequisiteEdges,
    difficulties
  };

  await input.layerStore.persist(layer);
  await input.artifacts.append({
    artifactId: `${input.enrichmentId}:derived-layer`,
    artifactType: "graph_enrichment.v1",
    schemaVersion: "1",
    graphVersionId: input.graphVersionId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: config.enrichmentConfigHash,
    createdAt: new Date().toISOString(),
    payload: layer
  });
  return layer;
}

// --- Deterministic, model-free helpers (tunable, not yet unit-tested) ---------

// Contextual text used for embedding (ADR-0012 tier 2): canonical label + aliases
// + any defined-as literal definitions + the verbatim evidence quotes from claims
// touching the concept. Prefers definition/evidence text over the bare label; the
// label degrades to a fallback only when the published graph has no claims for the
// concept (sparse-domain limitation, recorded as a slice caveat).
function conceptContextText(concept: Concept, snapshot: GraphSnapshot): string {
  const definitions = snapshot.claims
    .filter((claim) => claim.subjectConceptId === concept.conceptId && claim.object.kind === "literal")
    .map((claim) => (claim.object.kind === "literal" ? claim.object.value : ""))
    .filter((value) => value.length > 0);
  const evidence = snapshot.claims
    .filter((claim) =>
      claim.subjectConceptId === concept.conceptId ||
      (claim.object.kind === "concept" && claim.object.conceptId === concept.conceptId)
    )
    .flatMap((claim) => claim.evidence.map((reference) => reference.evidenceQuote))
    .filter((quote) => quote.length > 0);
  return [concept.canonicalLabel, ...concept.aliases, ...definitions, ...evidence].join(". ");
}

// First `defined-as` literal published for each concept — the concept's meaning
// anchor, surfaced to the judge separately from the broader evidence packet.
function definitionsByConcept(snapshot: GraphSnapshot): Map<string, string> {
  const byConcept = new Map<string, string>();
  for (const claim of snapshot.claims) {
    if (claim.object.kind !== "literal") continue;
    if (byConcept.has(claim.subjectConceptId)) continue;
    byConcept.set(claim.subjectConceptId, claim.object.value);
  }
  return byConcept;
}

// Every verbatim claim-evidence quote that names a concept (as subject or object),
// reconstructed as a minimal SourceBlock so the judge sees real source text. We
// only have the published quote + its block id here, which is exactly the verbatim
// span — sufficient grounding without re-reading the full source document.
function evidenceBlocksByConcept(snapshot: GraphSnapshot): Map<string, SourceBlock[]> {
  const byConcept = new Map<string, SourceBlock[]>();
  const add = (conceptId: string, block: SourceBlock) => {
    const existing = byConcept.get(conceptId);
    if (existing) existing.push(block);
    else byConcept.set(conceptId, [block]);
  };
  for (const claim of snapshot.claims) {
    for (const evidence of claim.evidence) {
      const block: SourceBlock = {
        blockId: evidence.sourceBlockId,
        blockType: "paragraph",
        text: evidence.evidenceQuote,
        headingPath: [],
        locator: {}
      };
      add(claim.subjectConceptId, block);
      if (claim.object.kind === "concept") add(claim.object.conceptId, block);
    }
  }
  return byConcept;
}

// Deduplicate evidence blocks by (blockId, text) so a claim touching both paired
// concepts contributes its quote once.
function dedupeBlocks(blocks: SourceBlock[]): SourceBlock[] {
  const seen = new Set<string>();
  const result: SourceBlock[] = [];
  for (const block of blocks) {
    const key = `${block.blockId}::${block.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(block);
  }
  return result;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Greedy single-link clustering by cosine threshold — deterministic given a stable
// concept order. Propose-only (ADR-0012): clusters gate pairs, never create edges.
function clusterByCosine(
  concepts: Concept[],
  vectors: number[][],
  threshold: number,
  embeddingModel: string
): ConceptCluster[] {
  const clusterIndex = new Map<string, number>();
  const groups: string[][] = [];
  for (let i = 0; i < concepts.length; i++) {
    let assigned = -1;
    for (let g = 0; g < groups.length && assigned < 0; g++) {
      const exemplar = concepts.findIndex((c) => c.conceptId === groups[g][0]);
      if (exemplar >= 0 && cosine(vectors[i], vectors[exemplar]) >= threshold) assigned = g;
    }
    if (assigned < 0) {
      assigned = groups.length;
      groups.push([]);
    }
    groups[assigned].push(concepts[i].conceptId);
    clusterIndex.set(concepts[i].conceptId, assigned);
  }
  return groups.map((conceptIds, index) => ({ clusterId: `c${index}`, conceptIds, embeddingModel }));
}

function clusterIdFor(conceptId: string, clusters: ConceptCluster[]): string | undefined {
  return clusters.find((cluster) => cluster.conceptIds.includes(conceptId))?.clusterId;
}

// Unordered candidate pairs. The Declared-Domain gate (ADR-0015) is mandatory:
// cross-domain prerequisites are never proposed. Within a domain, every pair is
// judged up to `exhaustiveDomainMaxConcepts`; only larger domains fall back to the
// embedding-cluster gate to bound cost. The judge decides direction, so order
// within a pair is irrelevant (concepts sorted by id for replay determinism).
function gatedPairs(
  concepts: Concept[],
  clusters: ConceptCluster[],
  exhaustiveDomainMaxConcepts: number
): [Concept, Concept][] {
  const clusterOf = new Map<string, string>();
  for (const cluster of clusters) for (const id of cluster.conceptIds) clusterOf.set(id, cluster.clusterId);

  const byDomain = new Map<string, Concept[]>();
  for (const concept of concepts) {
    const existing = byDomain.get(concept.declaredDomain);
    if (existing) existing.push(concept);
    else byDomain.set(concept.declaredDomain, [concept]);
  }

  const pairs: [Concept, Concept][] = [];
  for (const [, members] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...members].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
    const exhaustive = sorted.length <= exhaustiveDomainMaxConcepts;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Large domains: additionally require the same embedding cluster (cost bound).
        if (exhaustive || clusterOf.get(sorted[i].conceptId) === clusterOf.get(sorted[j].conceptId)) {
          pairs.push([sorted[i], sorted[j]]);
        }
      }
    }
  }
  return pairs;
}
