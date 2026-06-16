import type {
  Concept,
  DerivedGraphLayer,
  EnrichmentRunTrace,
  InferredPrerequisiteEdge,
  PrerequisiteConceptContext,
  PrerequisiteJudgment,
  PrerequisiteJudgmentTrace,
  PublishedConceptEvidenceProfile
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  PrerequisiteJudgmentPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.7.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // Weak-edge cut floor applied before cycle removal.
  minEdgeConfidence: number;
  // Bounded concurrency for the per-pair judge calls (ADR-0019 reset). Results are
  // collected in deterministic pair order regardless of completion order.
  judgeConcurrency: number;
  // Bound on mention passages passed per Concept into a pair judgment (R11). The
  // published CEP is already mention-bounded at extraction; this is a further
  // deterministic cap so a pair prompt cannot grow unbounded.
  maxMentionsPerConceptInPair: number;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  enrichmentConfigHash: "cep-pair-enrichment-v1",
  minEdgeConfidence: 0.5,
  judgeConcurrency: 4,
  maxMentionsPerConceptInPair: 6
};

// Graph Enrichment — the third operation (ADR-0019 reset). EVERY unordered
// same-domain Concept pair is judged from both Concepts' published CEPs; there is
// no embedding clustering or candidate-group gate. The LLM proposes (a bounded
// judge rules on each pair); the symbolic helpers dispose (weak-edge cut -> cycle
// removal -> transitive reduction); difficulty is mocked behind DifficultyPort.
// Produces an immutable Derived Graph Layer; each append-only run has its own
// enrichmentId and never touches the asserted core. Pair calls use bounded
// concurrency, preserve deterministic pair/result order, and fail the run WITHOUT
// persistence if any pair exhausts the forced-tool retry budget. Replayable from
// (version + config + captured judgments).
export async function runGraphEnrichment(input: {
  enrichmentId: string;
  graphVersionId: string;
  graphStore: GraphVersionStorePort;
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
  const labelByConcept = new Map(concepts.map((concept) => [concept.conceptId, concept.canonicalLabel] as const));
  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const contextOf = (concept: Concept): PrerequisiteConceptContext =>
    buildContext(concept, profileByConcept.get(concept.conceptId), labelByConcept, config.maxMentionsPerConceptInPair);

  // Step 1 — every unordered same-domain pair (ADR-0019 reset). The small core
  // makes exhaustive judgment the simplest correct behavior; cross-domain pairs are
  // never proposed (ADR-0015 Declared-Domain gate). Deterministic order for replay.
  const pairs = sameDomainPairs(concepts);

  // Step 2 — bounded LLM prerequisite judgment per pair (neural proposes). Each side
  // carries its full CEP (definitions, bounded mentions, labeled typed assertions);
  // an explicit-prerequisite-hint is labeled evidence the judge MAY weigh, never a
  // deterministic edge (R11, KTD). A pair with no CEP evidence is impossible in a
  // valid published snapshot and fails closed if an invalid snapshot is injected.
  type PairOutcome = { judgment?: PrerequisiteJudgment; trace?: PrerequisiteJudgmentTrace; insufficient?: EnrichmentRunTrace["dispositions"][number] };
  const outcomes = await mapWithConcurrency(pairs, config.judgeConcurrency, async ([a, b]): Promise<PairOutcome> => {
    const contextA = contextOf(a);
    const contextB = contextOf(b);
    const hasEvidence = (context: PrerequisiteConceptContext) => context.definitions.length > 0 || context.mentions.length > 0;
    if (!hasEvidence(contextA) || !hasEvidence(contextB)) {
      return { insufficient: { prerequisiteConceptId: a.conceptId, dependentConceptId: b.conceptId, disposition: "insufficient_evidence" } };
    }
    const judgeInput = { declaredDomain: a.declaredDomain, a: contextA, b: contextB };
    const judgment = await input.prerequisiteJudge.judge(judgeInput);
    return { judgment, trace: { ...judgeInput, judgment } };
  });

  // Collect in deterministic pair order regardless of completion order.
  const judgments: PrerequisiteJudgment[] = [];
  const judgmentTraces: PrerequisiteJudgmentTrace[] = [];
  const insufficientEvidence: EnrichmentRunTrace["dispositions"][number][] = [];
  for (const outcome of outcomes) {
    if (outcome.insufficient) insufficientEvidence.push(outcome.insufficient);
    if (outcome.judgment) judgments.push(outcome.judgment);
    if (outcome.trace) judgmentTraces.push(outcome.trace);
  }

  // Step 3 — map judgments to raw edges. "none" is dropped; "uncertain" is flagged
  // and retained for inspection but kept OUT of the traversable DAG.
  const rawEdges: InferredPrerequisiteEdge[] = judgments
    .filter((judgment) => judgment.outcome !== "none")
    .map((judgment) => ({
      prerequisiteConceptId: judgment.prerequisiteConceptId,
      dependentConceptId: judgment.dependentConceptId,
      predicate: "inferred-prerequisite-of",
      confidence: judgment.confidence,
      uncertain: judgment.outcome === "uncertain",
      provenance: { judgmentRationale: judgment.rationale }
    }));

  // Step 4 — symbolic disposal over CERTAIN edges only (symbolic constrains).
  const uncertainEdges = rawEdges.filter((edge) => edge.uncertain);
  const { kept: strongEdges, cut: weakEdges } = cutWeakEdges(
    rawEdges.filter((edge) => !edge.uncertain),
    config.minEdgeConfidence
  );
  const { edges: acyclicEdges, removed: cycleRemovedEdges } = removeCycles(strongEdges);
  const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(acyclicEdges);
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 5 — baseline difficulty over the reduced DAG (mock behind the port).
  const difficulties = await input.difficulty.score({ concepts, prerequisiteEdges: reducedEdges });

  const layer: DerivedGraphLayer = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    judgeModel: input.prerequisiteJudge.model,
    derivedNodes: concepts.map((concept) => ({
      nodeKind: "anchor",
      derivedNodeId: `${input.enrichmentId}:anchor:${concept.conceptId}`,
      conceptId: concept.conceptId,
      groundingOrigin: "document_anchored",
      role: "anchor",
      layer: "asserted",
      canonicalLabel: concept.canonicalLabel,
      normalizedLabel: concept.normalizedLabel,
      declaredDomain: concept.declaredDomain,
      aliases: concept.aliases
    })),
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

// --- Deterministic, model-free helpers -----------------------------------------

// Every unordered same-domain pair (ADR-0019 reset). Concepts are grouped by
// Declared Domain (ADR-0015) so a cross-domain pair is never proposed; both the
// domain order and the within-domain member order are sorted by stable id so the
// pair sequence — and therefore the persisted trace — is replay-deterministic. The
// judge decides direction, so within-pair order is irrelevant.
function sameDomainPairs(concepts: Concept[]): [Concept, Concept][] {
  const byDomain = new Map<string, Concept[]>();
  for (const concept of concepts) {
    const existing = byDomain.get(concept.declaredDomain);
    if (existing) existing.push(concept);
    else byDomain.set(concept.declaredDomain, [concept]);
  }
  const pairs: [Concept, Concept][] = [];
  for (const [, members] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...members].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }
  return pairs;
}

// Reduce a Concept's published CEP to exactly what the prerequisite judge needs
// (R11): verbatim definition + bounded mention quotes and LABELED typed
// assertions. A `defines` assertion surfaces its literal; an
// explicit-prerequisite-hint surfaces the canonical label of the Concept it points
// at (falling back to the raw id if that Concept is somehow absent) so the judge
// reads "needs <label>" rather than an opaque id. Mentions are capped a second
// time here (the published CEP is already extraction-bounded) so a pair prompt
// cannot grow unbounded. The bare label is never the evidence — an empty CEP
// yields empty definitions/mentions and is treated as insufficient upstream.
function buildContext(
  concept: Concept,
  profile: PublishedConceptEvidenceProfile | undefined,
  labelByConcept: Map<string, string>,
  maxMentions: number
): PrerequisiteConceptContext {
  return {
    conceptId: concept.conceptId,
    canonicalLabel: concept.canonicalLabel,
    aliases: concept.aliases,
    definitions: (profile?.definitions ?? []).map((passage) => passage.evidenceQuote),
    mentions: (profile?.mentions ?? []).slice(0, maxMentions).map((passage) => passage.evidenceQuote),
    assertions: (profile?.assertions ?? []).map((assertion) =>
      assertion.type === "defines"
        ? { type: assertion.type, detail: assertion.literalValue }
        : { type: assertion.type, detail: labelByConcept.get(assertion.objectConceptId) ?? assertion.objectConceptId }
    )
  };
}

// Map over items with bounded concurrency, preserving INPUT order in the result
// regardless of completion order (deterministic trace for replay). Any rejection
// propagates: a pair whose judge exhausts its forced-tool retry budget throws, so
// the enrichment run fails before persistence and leaves no partial layer.
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
