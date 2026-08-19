import type {
  DefinitionPassageDisposition,
  DerivedGraphLayer,
  DerivedGraphNode,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GroundingAdmissionDisposition,
  GroundingVerbatimDisposition,
  InferredPrerequisiteEdge,
  MintingDisposition,
  NodeEvidenceExclusion,
  NodeMergeRecord,
  PrerequisiteConceptContext,
  PublishedConceptEvidenceProfile,
  RescueDisposition,
  SyntheticProbeDisposition
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { DifficultyPort, EnrichmentRunStorePort, PrerequisiteOrderingPort } from "@lrnki/ports";
import { NON_LLM_STAGES, type StageBracket } from "./runProgressReporter";
import { deriveConsensusOrdering } from "./deriveConsensusOrdering";
import { transitiveReduction } from "./prerequisiteDag";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

// Derived Graph Layer completion — the ONE deep back half shared by Graph Enrichment and
// Synthetic Topic Generation (plan 2026-07-11-001, ADR-0001/ADR-0019). Both producers keep
// their distinct front halves (rescue/mint/dedup vs. synthesize/probe/ground) and hand
// prepared nodes plus producer-specific evidence facts across this seam; the module owns
// judgment-context construction, evidence-free exclusions, K-sampled consensus ordering,
// symbolic transitive reduction, intrinsic difficulty, common trace dispositions,
// layer/artifact assembly, structural fail-closed validation, and the single atomic
// persistence call. Internal to @lrnki/application — not exported from the package
// boundary (R7): an in-process seam with one implementation needs no public port.

// The shared completion configuration fields (KTD3). Both producer configs compose this
// flat shape; the fields keep their existing names so neither operation's config-hash
// serialization changes (AE6).
export type DerivedGraphCompletionConfig = {
  // Part of the derived-layer identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // K — the number of independent ordering DRAWS per Declared Domain. MoE inference is
  // non-deterministic (ADR-0028), so one draw is one sample from a distribution; the
  // boundary draws K times on the SAME input and tallies a per-pair directional vote.
  // Calibrated in the whole-set-ordering rule-14 pass, never assumed.
  orderingSampleCount: number;
  // The minority-vote fraction at which a pair's prerequisite DIRECTION is judged
  // genuinely contested and routed to `uncertain`. A pair is contested when
  // `min(forward, reverse) / K >= directionContestMinorityFraction` — a FRACTION of K
  // (not a binary "any reverse") so a single stray flip at large K does not route a
  // robust pair to `uncertain`.
  directionContestMinorityFraction: number;
  // Weak-edge cut floor applied to the consensus certain candidates. Because consensus
  // confidence is `max(f,r)/K` (an agreement fraction), this floor doubles as the
  // PRESENCE QUORUM: an edge present in too few draws scores below it and becomes
  // `weak_cut`.
  minEdgeConfidence: number;
  // Token-budget guard for the ONE whole-set ordering call per domain. A deterministic
  // character-count proxy for the assembled prompt; if a single domain's rendered node
  // set + evidence exceeds this, the run FAILS CLOSED without persisting a partial layer
  // (no chunking, no DAG merging).
  maxDomainPromptChars: number;
  // Bound on mention passages passed per node into the ordering prompt. The published
  // CEP is already mention-bounded at extraction; this is a further deterministic cap so
  // the prompt cannot grow unbounded per concept.
  maxMentionsPerConceptInPair: number;
};

// The one default authority for the shared fields (KTD3). `enrichmentConfigHash` is the
// per-producer identity seed, so it stays producer-owned and is deliberately absent here.
// CALIBRATED in the whole-set-ordering rule-14 pass against real K=8 gpt-oss-120b draws
// over the Rust + economics fixtures (tmp/2026-06-24-k-sample-ordering-rule14/): K=8 is
// the probe-validated draw count; the contest fraction 0.1 catches a genuine 7:1
// directional flip at K=8 (min/K = 0.125 ≥ 0.1 → `uncertain`) while scaling with K — a
// single stray reverse at K≥16 (≤0.0625) stays committed. `minEdgeConfidence` gates an
// AGREEMENT fraction (max(f,r)/K), so 0.5 means "present in at least half the draws".
// `maxDomainPromptChars` is ~100k tokens at a coarse 4-chars/token proxy — comfortably
// inside the ordering candidates' context windows.
export const DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG: Omit<DerivedGraphCompletionConfig, "enrichmentConfigHash"> = {
  orderingSampleCount: 8,
  directionContestMinorityFraction: 0.1,
  minEdgeConfidence: 0.5,
  maxDomainPromptChars: 400000,
  maxMentionsPerConceptInPair: 6
};

// The source-grounded contribution (KTD4): Graph Enrichment's producer-specific evidence
// and trace facts. Published evidence profiles ground the anchor judgment contexts;
// absorbed grounding (keyed by canonical node) unions dedup-absorbed evidence into the
// canonical node's contexts; the disposition arrays are recorded verbatim on the trace.
export type SourceGroundedContribution = {
  kind: "source_grounded";
  // Non-null by construction — a source-grounded layer is keyed to a published version.
  graphVersionId: string;
  evidenceProfiles: PublishedConceptEvidenceProfile[];
  absorbedGroundingByCanonical: ReadonlyMap<string, string[]>;
  groundingDispositions: GroundingVerbatimDisposition[];
  rescueDispositions: RescueDisposition[];
  rescuedDefinitionDispositions: DefinitionPassageDisposition[];
  mintingDispositions: MintingDisposition[];
  groundingAdmissionDispositions: GroundingAdmissionDisposition[];
  nodeMerges: NodeMergeRecord[];
  // Graph Enrichment's K-sampling ordering summary hook, invoked inside the ordering
  // branch after consensus/reduction. Difficulty runs independently in parallel; the
  // worker formats the structured line — no console I/O here.
  onOrderingSummary?: (summary: { k: number; committed: number; contested: number; weakCut: number; cycleRouted: number }) => void;
};

// The synthetic contribution (KTD4): Synthetic Topic Generation's source-less facts. No
// published version exists (`graphVersionId` null), no source-only dispositions exist,
// and the Knowledge-Boundary Probe outcomes are recorded on the trace.
export type SyntheticContribution = {
  kind: "synthetic";
  graphVersionId: null;
  groundingDispositions: GroundingVerbatimDisposition[];
  syntheticProbeDispositions: SyntheticProbeDisposition[];
  // Front-half counts the combined summary hook reports alongside the completed layer's
  // counts; produced by the synthesize/probe stages the producer keeps.
  frontHalfCounts: { concepts: number; core: number; boundary: number };
  // Synthetic Topic Generation's combined summary hook, invoked at its existing
  // position: after difficulty, before persistence.
  onSummary?: (summary: { concepts: number; core: number; boundary: number; nodes: number; committedEdges: number; uncertainEdges: number }) => void;
};

export type DerivedGraphContribution = SourceGroundedContribution | SyntheticContribution;

export type DerivedGraphCompletionRequest = {
  enrichmentId: string;
  // The completed derived node set — every node that survives the producer's front half.
  nodes: DerivedGraphNode[];
  config: DerivedGraphCompletionConfig;
  // The producer-owned stage bracket (KTD6): completion brackets its stages onto the
  // SAME operation timeline the producer's front half already reports to, so the
  // existing per-stage wall-clock and cost joins are unchanged.
  stage: StageBracket;
  contribution: DerivedGraphContribution;
};

export type DerivedGraphLayerCompletion = {
  complete(request: DerivedGraphCompletionRequest): Promise<DerivedGraphLayer>;
};

// Factory binding the three existing ports (KTD5). The store is narrowed to `persist` —
// the sole side effect completion owns.
export function createDerivedGraphLayerCompletion(ports: {
  prerequisiteOrdering: PrerequisiteOrderingPort;
  difficulty: DifficultyPort;
  enrichmentStore: Pick<EnrichmentRunStorePort, "persist">;
}): DerivedGraphLayerCompletion {
  return {
    async complete(request) {
      const { config, contribution, nodes } = request;
      // Request-structure validation runs BEFORE any neural work (KTD7): a provably
      // malformed request must cost nothing and persist nothing.
      const surviving = validateRequest(request);

      const profileByConcept = new Map(
        contribution.kind === "source_grounded"
          ? contribution.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const)
          : []
      );
      const absorbedGroundingByCanonical =
        contribution.kind === "source_grounded" ? contribution.absorbedGroundingByCanonical : undefined;

      // Judgment contexts (KTD2). Anchors use their published CEP; enrichment nodes use
      // their grounding; a canonical node also carries its absorbed nodes' evidence. The
      // bare label is never the evidence — an evidence-free node is EXCLUDED from the
      // ordering input and recorded ONCE, not once per pair.
      const pairingNodes = nodes.map((node) => ({
        derivedNodeId: node.derivedNodeId,
        declaredDomain: node.declaredDomain,
        groundingOrigin: node.groundingOrigin,
        context: derivedNodeJudgmentContext(node, profileByConcept, config.maxMentionsPerConceptInPair, absorbedGroundingByCanonical?.get(node.derivedNodeId))
      }));
      const difficultyNodes: DifficultyNodeContext[] = pairingNodes.map((node) => ({
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.context.canonicalLabel,
        aliases: node.context.aliases,
        declaredDomain: node.declaredDomain,
        groundingOrigin: node.groundingOrigin,
        definitions: node.context.definitions,
        mentions: node.context.mentions
      }));
      const nodeExclusions: NodeEvidenceExclusion[] = [];
      const byDomain = new Map<string, PrerequisiteConceptContext[]>();
      for (const node of pairingNodes) {
        if (!hasEvidence(node.context)) {
          nodeExclusions.push({ derivedNodeId: node.derivedNodeId, declaredDomain: node.declaredDomain, reason: "insufficient_evidence" });
          continue;
        }
        const existing = byDomain.get(node.declaredDomain);
        if (existing) existing.push(node.context);
        else byDomain.set(node.declaredDomain, [node.context]);
      }

      const K = Math.max(1, Math.trunc(config.orderingSampleCount));
      const [ordering, difficulties] = await Promise.all([
        (async () => {
          const {
            orderings: orderingTraces,
            certainEdges,
            uncertainEdges,
            weakEdges
          } = await request.stage(STAGE_TAGS.prerequisiteOrdering, () =>
            deriveConsensusOrdering({
              domains: [...byDomain.entries()].map(([declaredDomain, members]) => ({ declaredDomain, nodes: members })),
              prerequisiteOrdering: ports.prerequisiteOrdering,
              orderingSampleCount: config.orderingSampleCount,
              directionContestMinorityFraction: config.directionContestMinorityFraction,
              minEdgeConfidence: config.minEdgeConfidence,
              maxDomainPromptChars: config.maxDomainPromptChars
            })
          );

          // Symbolic reduction over the acyclic CERTAIN edges. Pure and fast, but
          // bracketed so its share of the run is visible in the timing split. The
          // ordering branch keeps consensus → reduction → endpoint validation intact
          // while intrinsic difficulty runs independently beside it.
          const { reducedEdges, transitiveEdges } = await request.stage(NON_LLM_STAGES.symbolicDisposal, async () => {
            const { edges, removed } = transitiveReduction(certainEdges);
            return { reducedEdges: edges, transitiveEdges: removed };
          });
          const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];
          for (const edge of prerequisiteEdges) {
            for (const endpoint of [edge.prerequisiteDerivedNodeId, edge.dependentDerivedNodeId]) {
              if (!surviving.has(endpoint)) {
                throw new Error(`completeDerivedGraphLayer: prerequisite edge endpoint "${endpoint}" is not a surviving derived node; failing closed without persistence (R8).`);
              }
            }
          }

          if (contribution.kind === "source_grounded") {
            contribution.onOrderingSummary?.({
              k: K,
              committed: reducedEdges.length,
              contested: orderingTraces.reduce((sum, trace) => sum + trace.pairVotes.filter((vote) => vote.classification === "direction_contested").length, 0),
              weakCut: weakEdges.length,
              cycleRouted: orderingTraces.reduce((sum, trace) => sum + trace.cycleRoutedEdges.length, 0)
            });
          }

          return { orderingTraces, uncertainEdges, weakEdges, reducedEdges, transitiveEdges, prerequisiteEdges };
        })(),
        // Comparative banded intrinsic difficulty from node evidence contexts only
        // (ADR-0024). It scores every derived node, including evidence-excluded ones,
        // and deliberately takes no prerequisite DAG input.
        request.stage(STAGE_TAGS.intrinsicDifficulty, () =>
          ports.difficulty.score({ nodes: difficultyNodes })
        )
      ]);
      const { orderingTraces, uncertainEdges, weakEdges, reducedEdges, transitiveEdges, prerequisiteEdges } = ordering;
      // Exact difficulty coverage is proved BEFORE artifact assembly (KTD7): every
      // surviving node exactly once, no unknown or duplicate IDs.
      const scored = new Set<string>();
      for (const difficulty of difficulties) {
        if (!surviving.has(difficulty.derivedNodeId)) {
          throw new Error(`completeDerivedGraphLayer: difficulty output names unknown derived node "${difficulty.derivedNodeId}"; failing closed without persistence (R8).`);
        }
        if (scored.has(difficulty.derivedNodeId)) {
          throw new Error(`completeDerivedGraphLayer: difficulty output scores derived node "${difficulty.derivedNodeId}" more than once; failing closed without persistence (R8).`);
        }
        scored.add(difficulty.derivedNodeId);
      }
      if (scored.size !== surviving.size) {
        const missing = [...surviving].filter((id) => !scored.has(id));
        throw new Error(`completeDerivedGraphLayer: difficulty output omits ${missing.length} surviving derived node(s) (${missing.slice(0, 3).join(", ")}); failing closed without persistence (R8).`);
      }

      const layer: DerivedGraphLayer = {
        enrichmentId: request.enrichmentId,
        graphVersionId: contribution.graphVersionId,
        enrichmentConfigHash: config.enrichmentConfigHash,
        judgeModel: ports.prerequisiteOrdering.model,
        derivedNodes: nodes,
        prerequisiteEdges,
        difficulties
      };
      const trace: EnrichmentRunTrace = {
        enrichmentId: request.enrichmentId,
        graphVersionId: contribution.graphVersionId,
        enrichmentConfigHash: config.enrichmentConfigHash,
        derivedNodes: nodes,
        orderings: orderingTraces,
        nodeExclusions,
        dispositions: [
          ...uncertainEdges.map((edge) => disposition(edge, "uncertain")),
          ...weakEdges.map((edge) => disposition(edge, "weak_cut")),
          ...transitiveEdges.map((edge) => disposition(edge, "transitive_reduction")),
          ...reducedEdges.map((edge) => disposition(edge, "kept"))
        ],
        groundingDispositions: contribution.groundingDispositions,
        rescueDispositions: contribution.kind === "source_grounded" ? contribution.rescueDispositions : [],
        rescuedDefinitionDispositions: contribution.kind === "source_grounded" ? contribution.rescuedDefinitionDispositions : [],
        mintingDispositions: contribution.kind === "source_grounded" ? contribution.mintingDispositions : [],
        groundingAdmissionDispositions: contribution.kind === "source_grounded" ? contribution.groundingAdmissionDispositions : [],
        nodeMerges: contribution.kind === "source_grounded" ? contribution.nodeMerges : [],
        // Present only for the synthetic variant; source-grounded enrichment records its
        // distinct prerequisite-admission outcomes above instead.
        ...(contribution.kind === "synthetic" ? { syntheticProbeDispositions: contribution.syntheticProbeDispositions } : {})
      };

      if (contribution.kind === "synthetic") {
        contribution.onSummary?.({
          ...contribution.frontHalfCounts,
          nodes: nodes.length,
          committedEdges: reducedEdges.length,
          uncertainEdges: uncertainEdges.length
        });
      }

      await request.stage(NON_LLM_STAGES.persist, () =>
        ports.enrichmentStore.persist({
          layer,
          artifact: {
            artifactId: `${request.enrichmentId}:enrichment-run`,
            artifactType: "enrichment_run",
            // The envelope's graphVersionId is a non-null key; the synthetic artifact
            // omits it entirely (its trace carries the explicit null).
            ...(contribution.kind === "source_grounded" ? { graphVersionId: contribution.graphVersionId } : {}),
            producer: PRODUCER,
            producerVersion: PRODUCER_VERSION,
            configHash: config.enrichmentConfigHash,
            createdAt: new Date().toISOString(),
            payload: trace
          }
        })
      );
      return layer;
    }
  };
}

// --- Structural request validation (R8/R9) ---------------------------------------
//
// Every check here is a provable identity/lifecycle guarantee over the persisted types'
// semantics — never a heuristic over labels, rationales, or evidence prose (AGENTS rule
// 16). Surviving-node fields must name surviving nodes; historical dispositions may name
// dropped or absorbed IDs only when their recorded outcome or merge proves that
// lifecycle. A violation throws before any neural work and persists zero times; the
// module never normalizes, drops, or reinterprets well-formed input.
function validateRequest(request: DerivedGraphCompletionRequest): Set<string> {
  const { contribution, nodes } = request;
  const surviving = new Set<string>();
  for (const node of nodes) {
    if (surviving.has(node.derivedNodeId)) {
      fail(`duplicate derived node id "${node.derivedNodeId}"`);
    }
    surviving.add(node.derivedNodeId);
  }

  // Contribution/version identity: the discriminated types make a mismatch
  // unrepresentable for well-typed callers, but data can arrive through casts or a
  // buggy port, so the invariant is proved at runtime too (AE5).
  if (contribution.kind === "source_grounded" && typeof (contribution.graphVersionId as unknown) !== "string") {
    fail(`a source-grounded contribution requires a non-null graphVersionId`);
  }
  if (contribution.kind === "synthetic" && (contribution.graphVersionId as unknown) !== null) {
    fail(`a synthetic contribution requires a null graphVersionId`);
  }

  // A node the verbatim floor dropped is a proven absence: its recorded `failed`
  // outcome justifies earlier dispositions (rescue/minting acceptance) that name it.
  const floorDropped = new Set(
    contribution.groundingDispositions.filter((d) => d.outcome === "failed").map((d) => d.derivedNodeId)
  );

  if (contribution.kind === "source_grounded") {
    const absorbed = new Set<string>();
    for (const merge of contribution.nodeMerges) {
      if (!surviving.has(merge.canonicalDerivedNodeId)) {
        fail(`node merge names canonical node "${merge.canonicalDerivedNodeId}" that is not a surviving derived node`);
      }
      if (surviving.has(merge.absorbedDerivedNodeId)) {
        fail(`node merge names absorbed node "${merge.absorbedDerivedNodeId}" that is still a surviving derived node`);
      }
      absorbed.add(merge.absorbedDerivedNodeId);
    }
    const provenLifecycle = (id: string): boolean => surviving.has(id) || absorbed.has(id) || floorDropped.has(id);
    for (const d of contribution.groundingDispositions) {
      // A verified/exempt node must still exist or have been validly absorbed; only a
      // `failed` outcome proves its own absence.
      if (d.outcome !== "failed" && !surviving.has(d.derivedNodeId) && !absorbed.has(d.derivedNodeId)) {
        fail(`grounding disposition ("${d.outcome}") names node "${d.derivedNodeId}" with no proven lifecycle`);
      }
    }
    for (const d of contribution.rescueDispositions) {
      // A dropped rescue is a deliberately absent node; an accepted/kept one must
      // survive, be absorbed, or be proven dropped by the verbatim floor.
      if (d.disposition !== "dropped" && !provenLifecycle(d.derivedNodeId)) {
        fail(`rescue disposition ("${d.disposition}") names node "${d.derivedNodeId}" with no proven lifecycle`);
      }
    }
    const mintingById = new Map<string, MintingDisposition>();
    for (const d of contribution.mintingDispositions) {
      if (mintingById.has(d.derivedNodeId)) {
        fail(`duplicate minting disposition for "${d.derivedNodeId}"`);
      }
      mintingById.set(d.derivedNodeId, d);
    }
    const admissionById = new Map<string, GroundingAdmissionDisposition>();
    for (const d of contribution.groundingAdmissionDispositions) {
      if (admissionById.has(d.derivedNodeId)) {
        fail(`duplicate grounding-admission disposition for "${d.derivedNodeId}"`);
      }
      admissionById.set(d.derivedNodeId, d);
      const durability = mintingById.get(d.derivedNodeId);
      if (!durability || durability.disposition === "dropped") {
        fail(`grounding-admission disposition for "${d.derivedNodeId}" has no durability-kept proposal`);
      }
      if (
        durability.proposedLabel !== d.proposedLabel ||
        durability.normalizedLabel !== d.normalizedLabel ||
        durability.declaredDomain !== d.declaredDomain ||
        durability.anchorConceptId !== d.anchorConceptId
      ) {
        fail(`grounding-admission disposition for "${d.derivedNodeId}" disagrees with its minting disposition`);
      }
      if (d.disposition === "admitted" && !provenLifecycle(d.derivedNodeId)) {
        fail(`admitted grounding disposition names node "${d.derivedNodeId}" with no proven lifecycle`);
      }
      if (d.disposition !== "admitted" && provenLifecycle(d.derivedNodeId)) {
        fail(`${d.disposition} grounding disposition names node "${d.derivedNodeId}" that entered the derived layer`);
      }
    }
    for (const d of contribution.mintingDispositions) {
      const admission = admissionById.get(d.derivedNodeId);
      if (d.disposition === "dropped" && admission) {
        fail(`dropped minting disposition for "${d.derivedNodeId}" reached grounding admission`);
      }
      if (d.disposition !== "dropped" && !admission) {
        fail(`minting disposition ("${d.disposition}") names proposal "${d.derivedNodeId}" with no grounding-admission outcome`);
      }
    }
    for (const node of nodes) {
      if (node.groundingOrigin !== "llm_grounded") continue;
      if (node.mintingReason !== "assumed_prerequisite") {
        fail(`source-grounded llm node "${node.derivedNodeId}" lacks the assumed-prerequisite minting reason`);
      }
      if (admissionById.get(node.derivedNodeId)?.disposition !== "admitted") {
        fail(`source-grounded llm node "${node.derivedNodeId}" has no admitted grounding disposition`);
      }
    }
    for (const d of contribution.rescuedDefinitionDispositions) {
      // The rescue-definition judge runs after the floor and never drops nodes, so its
      // candidateKey (the derived node id) must survive or be validly absorbed.
      if (!surviving.has(d.candidateKey) && !absorbed.has(d.candidateKey)) {
        fail(`rescued-definition disposition names node "${d.candidateKey}" with no proven lifecycle`);
      }
    }
  } else {
    for (const d of contribution.groundingDispositions) {
      if (d.outcome !== "failed" && !surviving.has(d.derivedNodeId)) {
        fail(`grounding disposition ("${d.outcome}") names node "${d.derivedNodeId}" with no proven lifecycle`);
      }
    }
    for (const d of contribution.syntheticProbeDispositions) {
      // A boundary concept is held out of the trusted surface: null node. A core
      // concept must name the surviving node it became.
      if (d.disposition === "boundary" && d.derivedNodeId !== null) {
        fail(`boundary probe disposition for "${d.canonicalLabel}" names node "${d.derivedNodeId}" but a boundary concept never becomes a node`);
      }
      if (d.disposition === "core_knowledge" && (d.derivedNodeId === null || !surviving.has(d.derivedNodeId))) {
        fail(`core probe disposition for "${d.canonicalLabel}" must name a surviving derived node`);
      }
    }
  }
  return surviving;
}

function fail(reason: string): never {
  throw new Error(`completeDerivedGraphLayer: ${reason}; failing closed without persistence (R8).`);
}

function disposition(
  edge: InferredPrerequisiteEdge,
  value: EnrichmentRunTrace["dispositions"][number]["disposition"]
): EnrichmentRunTrace["dispositions"][number] {
  return {
    prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId,
    dependentDerivedNodeId: edge.dependentDerivedNodeId,
    disposition: value
  };
}

// A node carries evidence to ground a judgment when it has at least one definition or
// mention quote. The bare label is never the evidence — an evidence-free node is
// excluded from the ordering input and recorded once.
const hasEvidence = (context: PrerequisiteConceptContext): boolean =>
  context.definitions.length > 0 || context.mentions.length > 0;

// Reduce a derived node to exactly what the prerequisite and difficulty judges need
// (KTD2). An anchor uses its published CEP (verbatim definition + bounded mention quotes
// + LABELED `defines` assertions); a `source_mentioned` node has no definition — only
// verbatim mention quotes; an `llm_grounded` node uses its generated definition/mention
// text (exempt from the verbatim floor). The bare label is never the evidence — an empty
// context is treated as insufficient upstream. Exported for the dedup front half, whose
// merge-adjudication contexts reuse the same reduction — one authority, two readers.
export function derivedNodeJudgmentContext(
  node: DerivedGraphNode,
  profileByConcept: Map<string, PublishedConceptEvidenceProfile>,
  maxMentions: number,
  // Absorbed nodes' evidence: when this canonical node absorbed near-duplicate nodes
  // during dedup, their verbatim quotes are appended to its mentions so the judge sees
  // the unioned evidence. Undefined for a node that absorbed nothing (or when dedup did
  // not run).
  absorbedGrounding?: string[]
): PrerequisiteConceptContext {
  const withAbsorbed = (mentions: string[]): string[] =>
    absorbedGrounding && absorbedGrounding.length ? [...mentions, ...absorbedGrounding] : mentions;
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const publishedAssertions = profile?.assertions ?? [];
    return {
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: (profile?.definitions ?? []).map((passage) => passage.evidenceQuote),
      mentions: withAbsorbed((profile?.mentions ?? []).slice(0, maxMentions).map((passage) => passage.evidenceQuote)),
      assertions: publishedAssertions.map((assertion) => ({ type: assertion.type, detail: assertion.literalValue }))
    };
  }
  if (node.groundingOrigin === "source_mentioned") {
    return {
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: [],
      mentions: withAbsorbed(node.groundingPassages.slice(0, maxMentions).map((passage) => passage.evidenceQuote)),
      assertions: []
    };
  }
  return {
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    aliases: node.aliases,
    definitions: node.groundingBundle.definitions.map((passage) => passage.text),
    mentions: withAbsorbed(node.groundingBundle.mentions.slice(0, maxMentions).map((passage) => passage.text)),
    assertions: []
  };
}
