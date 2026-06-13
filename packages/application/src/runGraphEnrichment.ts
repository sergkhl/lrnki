import type {
  Concept,
  ConceptCluster,
  DerivedGraphLayer,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  PrerequisiteJudgment
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
  // Tier-2 blocking threshold — pairs are only judged within a cluster (ADR-0012).
  clusterCosineThreshold: number;
  // Weak-edge cut floor applied before cycle removal.
  minEdgeConfidence: number;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  enrichmentConfigHash: "slice-enrichment-v1",
  clusterCosineThreshold: 0.55,
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

  // Step 2 — gate candidate pairs: same Declared Domain AND same cluster. This is
  // the strict candidate gating that bounds the N^2 judgment cost (method stack §3).
  const pairs = gatedPairs(concepts, clusters);

  // Step 3 — bounded LLM prerequisite judgment per gated pair (neural proposes).
  const judgments: PrerequisiteJudgment[] = [];
  for (const [a, b] of pairs) {
    judgments.push(
      await input.prerequisiteJudge.judge({
        declaredDomain: a.declaredDomain,
        a: { conceptId: a.conceptId, canonicalLabel: a.canonicalLabel },
        b: { conceptId: b.conceptId, canonicalLabel: b.canonicalLabel },
        // TODO(work-slice): assemble the evidence packet from a/b's cited source
        // blocks so the judge reasons over text, not just labels (InstructKG packets).
        evidencePacket: []
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

// Contextual text used for embedding: canonical label + aliases + any defined-as
// literal definitions published for the concept. Never relies on the bare label.
function conceptContextText(concept: Concept, snapshot: GraphSnapshot): string {
  const definitions = snapshot.claims
    .filter((claim) => claim.subjectConceptId === concept.conceptId && claim.object.kind === "literal")
    .map((claim) => (claim.object.kind === "literal" ? claim.object.value : ""))
    .filter((value) => value.length > 0);
  return [concept.canonicalLabel, ...concept.aliases, ...definitions].join(". ");
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

// Unordered candidate pairs gated to same Declared Domain AND same cluster. The
// judge decides direction, so order within a pair is irrelevant (sorted for replay).
function gatedPairs(concepts: Concept[], clusters: ConceptCluster[]): [Concept, Concept][] {
  const byId = new Map(concepts.map((concept) => [concept.conceptId, concept] as const));
  const pairs: [Concept, Concept][] = [];
  for (const cluster of clusters) {
    const members = [...cluster.conceptIds].sort((a, b) => a.localeCompare(b)).map((id) => byId.get(id) as Concept);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (members[i].declaredDomain === members[j].declaredDomain) pairs.push([members[i], members[j]]);
      }
    }
  }
  return pairs;
}
