import type {
  Concept,
  DerivedGraphLayer,
  EnrichmentRunTrace,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  PrerequisiteCandidateGroup,
  PrerequisiteJudgment,
  PrerequisiteJudgmentTrace,
  SourceBlock
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EmbeddingPort,
  EnrichmentRunStorePort,
  PrerequisiteJudgmentPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.6.0";

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
// Derived Graph Layer; each append-only run has its own enrichmentId and never
// touches the asserted core. Replayable from (version + config + captured
// judgments).
export async function runGraphEnrichment(input: {
  enrichmentId: string;
  graphVersionId: string;
  graphStore: GraphVersionStorePort;
  embedding: EmbeddingPort;
  prerequisiteJudge: PrerequisiteJudgmentPort;
  difficulty: DifficultyPort;
  enrichmentStore: EnrichmentRunStorePort;
  config?: GraphEnrichmentConfig;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const snapshot = await input.graphStore.getPublishedSnapshot(input.graphVersionId);
  if (!snapshot) {
    throw new Error(`runGraphEnrichment: published version ${input.graphVersionId} not found.`);
  }
  const concepts = snapshot.concepts;

  // Step 1 — contextual text per concept (definition + evidence), NEVER the bare
  // label (ADR-0012 tier 2). Embedding then clusters; clustering only gates pairs.
  const texts = concepts.map((concept) => conceptContextText(concept, snapshot));
  const vectors = await input.embedding.embed({ texts });
  const candidateGroups = groupByCosine(concepts, vectors, config.clusterCosineThreshold, input.embedding.model);

  // Step 2 — gate candidate pairs. The Declared-Domain gate is primary; the
  // embedding cluster only further restricts domains above the exhaustive size
  // budget (ADR-0012 additive-for-recall: it never removes a small domain's pairs).
  const pairs = gatedPairs(concepts, candidateGroups, config.exhaustiveDomainMaxConcepts);

  // Step 3 — bounded LLM prerequisite judgment per gated pair (neural proposes).
  // Each pair gets an InstructKG-style evidence packet: the concepts' definition
  // literals plus the verbatim source quotes from every published claim that
  // touches either concept, so the judge reasons over real source text — not bare
  // labels (ADR-0019 method stack §3). Definitions are surfaced separately so the
  // judge can anchor on each concept's meaning.
  const definitionOf = definitionsByConcept(snapshot);
  const evidenceOf = evidenceBlocksByConcept(snapshot);
  const judgments: PrerequisiteJudgment[] = [];
  const judgmentTraces: PrerequisiteJudgmentTrace[] = [];
  const insufficientEvidence: EnrichmentRunTrace["dispositions"][number][] = [];
  for (const [a, b] of pairs) {
    const evidenceA = evidenceOf.get(a.conceptId) ?? [];
    const evidenceB = evidenceOf.get(b.conceptId) ?? [];
    const definitionA = definitionOf.get(a.conceptId);
    const definitionB = definitionOf.get(b.conceptId);
    if ((!definitionA && evidenceA.length === 0) || (!definitionB && evidenceB.length === 0)) {
      insufficientEvidence.push({
        prerequisiteConceptId: a.conceptId,
        dependentConceptId: b.conceptId,
        disposition: "insufficient_evidence" as const
      });
      continue;
    }
    const judgeInput = {
      declaredDomain: a.declaredDomain,
      a: { conceptId: a.conceptId, canonicalLabel: a.canonicalLabel, definition: definitionA },
      b: { conceptId: b.conceptId, canonicalLabel: b.canonicalLabel, definition: definitionB },
      evidencePacket: dedupeBlocks([...evidenceA, ...evidenceB])
    };
    const judgment = await input.prerequisiteJudge.judge(judgeInput);
    judgments.push(judgment);
    judgmentTraces.push({ ...judgeInput, judgment });
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
      candidateGroupId: candidateGroupIdFor(judgment.prerequisiteConceptId, candidateGroups),
      provenance: { judgmentRationale: judgment.rationale }
    }));

  // Step 5 — symbolic disposal over CERTAIN edges only (symbolic constrains).
  const uncertainEdges = rawEdges.filter((edge) => edge.uncertain);
  const { kept: strongEdges, cut: weakEdges } = cutWeakEdges(
    rawEdges.filter((edge) => !edge.uncertain),
    config.minEdgeConfidence
  );
  const { edges: acyclicEdges, removed: cycleRemovedEdges } = removeCycles(strongEdges);
  const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(acyclicEdges);
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 6 — baseline difficulty over the reduced DAG (mock behind the port).
  const difficulties = await input.difficulty.score({ concepts, prerequisiteEdges: reducedEdges });

  const layer: DerivedGraphLayer = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    embeddingModel: input.embedding.model,
    judgeModel: input.prerequisiteJudge.model,
    prerequisiteCandidateGroups: candidateGroups,
    prerequisiteEdges,
    difficulties
  };

  const trace: EnrichmentRunTrace = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    judgments: judgmentTraces,
    dispositions: [
      ...insufficientEvidence,
      ...uncertainEdges.map((edge) => disposition(edge, "uncertain")),
      ...weakEdges.map((edge) => disposition(edge, "weak_cut")),
      ...cycleRemovedEdges.map((edge) => disposition(edge, "cycle_removed")),
      ...transitiveEdges.map((edge) => disposition(edge, "transitive_reduction")),
      ...reducedEdges.map((edge) => disposition(edge, "kept"))
    ]
  };
  await input.enrichmentStore.persist({
    layer,
    artifact: {
      artifactId: `${input.enrichmentId}:enrichment-run`,
      artifactType: "enrichment_run.v2",
      schemaVersion: "2",
      graphVersionId: input.graphVersionId,
      producer: PRODUCER,
      producerVersion: PRODUCER_VERSION,
      configHash: config.enrichmentConfigHash,
      createdAt: new Date().toISOString(),
      payload: trace
    }
  });
  return layer;
}

function disposition(
  edge: InferredPrerequisiteEdge,
  value: EnrichmentRunTrace["dispositions"][number]["disposition"]
): EnrichmentRunTrace["dispositions"][number] {
  return {
    prerequisiteConceptId: edge.prerequisiteConceptId,
    dependentConceptId: edge.dependentConceptId,
    disposition: value
  };
}

// --- Deterministic, model-free helpers (tunable, not yet unit-tested) ---------

// Contextual text per concept (ADR-0012 tier 2): canonical label + aliases + the
// concept's CEP definition and mention passages (ADR-0007 reset). Prefers
// source-grounded evidence text over the bare label; the label degrades to a
// fallback only when a Concept's CEP is unexpectedly empty.
function conceptContextText(concept: Concept, snapshot: GraphSnapshot): string {
  const profile = profileOf(snapshot, concept.conceptId);
  const quotes = [
    ...(profile?.definitions ?? []).map((passage) => passage.evidenceQuote),
    ...(profile?.mentions ?? []).map((passage) => passage.evidenceQuote)
  ].filter((quote) => quote.length > 0);
  return [concept.canonicalLabel, ...concept.aliases, ...quotes].join(". ");
}

// The concept's meaning anchor: prefer a guarded `defines` literal, else the first
// CEP definition passage. Surfaced to the judge separately from the wider packet.
function definitionsByConcept(snapshot: GraphSnapshot): Map<string, string> {
  const byConcept = new Map<string, string>();
  for (const profile of snapshot.evidenceProfiles) {
    const defines = profile.assertions.find((assertion) => assertion.type === "defines");
    const anchor = defines && defines.type === "defines" ? defines.literalValue : profile.definitions[0]?.evidenceQuote;
    if (anchor) byConcept.set(profile.conceptId, anchor);
  }
  return byConcept;
}

// Every verbatim CEP passage for a concept, reconstructed as a SourceBlock so the
// judge sees real source text with its heading path and locator (ADR-0007 reset).
function evidenceBlocksByConcept(snapshot: GraphSnapshot): Map<string, SourceBlock[]> {
  const byConcept = new Map<string, SourceBlock[]>();
  for (const profile of snapshot.evidenceProfiles) {
    const blocks: SourceBlock[] = [...profile.definitions, ...profile.mentions].map((passage) => ({
      blockId: passage.sourceBlockId,
      blockType: "paragraph",
      text: passage.evidenceQuote,
      headingPath: passage.headingPath,
      locator: passage.locator
    }));
    if (blocks.length) byConcept.set(profile.conceptId, blocks);
  }
  return byConcept;
}

function profileOf(snapshot: GraphSnapshot, conceptId: string) {
  return snapshot.evidenceProfiles.find((profile) => profile.conceptId === conceptId);
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
function groupByCosine(
  concepts: Concept[],
  vectors: number[][],
  threshold: number,
  embeddingModel: string
): PrerequisiteCandidateGroup[] {
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
  return groups.map((conceptIds, index) => ({ groupId: `g${index}`, conceptIds, embeddingModel }));
}

function candidateGroupIdFor(conceptId: string, groups: PrerequisiteCandidateGroup[]): string | undefined {
  return groups.find((group) => group.conceptIds.includes(conceptId))?.groupId;
}

// Unordered candidate pairs. The Declared-Domain gate (ADR-0015) is mandatory:
// cross-domain prerequisites are never proposed. Within a domain, every pair is
// judged up to `exhaustiveDomainMaxConcepts`; only larger domains fall back to the
// embedding-cluster gate to bound cost. The judge decides direction, so order
// within a pair is irrelevant (concepts sorted by id for replay determinism).
function gatedPairs(
  concepts: Concept[],
  groups: PrerequisiteCandidateGroup[],
  exhaustiveDomainMaxConcepts: number
): [Concept, Concept][] {
  const groupOf = new Map<string, string>();
  for (const group of groups) for (const id of group.conceptIds) groupOf.set(id, group.groupId);

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
        if (exhaustive || groupOf.get(sorted[i].conceptId) === groupOf.get(sorted[j].conceptId)) {
          pairs.push([sorted[i], sorted[j]]);
        }
      }
    }
  }
  return pairs;
}
