import { normalizeConceptLabel } from "@lrnki/domain-core";
import type {
  GroundingAdmissionDisposition,
  LlmGroundedEnrichmentNode,
  NonCoreRescueCandidate,
  MintingDisposition,
  RescueDisposition,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type {
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  RescueDurabilityJudgmentPort,
  RescuedNodeLabelingPort
} from "@lrnki/ports";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { applyMintingDurabilityJudge, type ReservedMintingProposal } from "./applyMintingDurabilityJudge";
import { applyRescueDurabilityJudge } from "./applyRescueDurabilityJudge";
import { applyRescuedNodeLabeling } from "./applyRescuedNodeLabeling";
import { passthroughStageBracket, type StageBracket } from "./runProgressReporter";
import type {
  GroundingAdmissionCandidate,
  GroundingAdmissionOutcome,
  SourceLessGroundingAdmission
} from "./sourceLessGroundingAdmission";

// Bounds on the anchor-driven minting pass (KTD6, R7). Defaults keep minting
// bounded so a thin source cannot explode into a runaway derived graph; both knobs
// belong to the enrichment configuration so changing them re-derives the layer.
export type EnrichmentMintingBounds = {
  maxMintedPerAnchor: number;
  maxMintedPerRun: number;
};

export const DEFAULT_MINTING_BOUNDS: EnrichmentMintingBounds = {
  maxMintedPerAnchor: 2,
  maxMintedPerRun: 12
};

// One asserted anchor reduced to what minting needs: identity, label, domain, and the
// verbatim definition quotes that condition both proposal (R7) and grounding (R10).
export type MintingAnchor = {
  conceptId: string;
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  definitionQuotes: string[];
};

// Assemble the derived layer's ENRICHMENT nodes (rescue + mint) for one run (U5).
// RESCUE (KTD1/KTD5): each member-run non-core candidate becomes a `source_mentioned`
// node reusing its real verbatim evidence — `optional`-tier candidates carry their
// Definition Passages alongside mentions (the rule-21 reuse-over-regeneration fix),
// `reject`-tier carry mentions only — deduped by normalized label within Declared
// Domain so the minter cannot regenerate a rescued concept. MINT (KTD6): each anchor drives
// a bounded, explicit proposal pass — the proposal port NAMES assumed-prior concepts
// (handoff constraint: node identity is an inspectable operation, not local string
// construction), then the finished Source-less Grounding Admission module checks every
// durability-kept label before a node can exist. Both caps are enforced deterministically.
// Nothing here enters the asserted layer (R5); the verbatim floor (U6) runs over the result
// before pair judging.
export async function assembleEnrichmentNodes(input: {
  anchors: MintingAnchor[];
  rescueCandidates: NonCoreRescueCandidate[];
  proposalPort: MissingPrerequisiteProposalPort;
  sourceLessGroundingAdmission: SourceLessGroundingAdmission;
  // Optional measured rescue durability judge (U3). When provided, each AGGREGATED
  // rescued node is judged against its same-domain anchors before minting runs; a
  // node judged non-durable (confident + grounded) is dropped with a recorded
  // disposition. Omitted -> rescue is unjudged (prior behavior) and every aggregated
  // node is accepted. Dropped labels stay "taken" so minting never resurrects them.
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  // Optional measured Rescued-Node Canonical Labeling judge (TODO #1). When provided, each
  // KEPT durable rescued node is re-named to a concept-shaped label by a dedicated whole-set
  // per-domain call, and minting adopts the proposal when its normalized form is unclaimed
  // (demoting the original sentence to an alias). Omitted -> rescued labels stay as-is.
  rescuedNodeLabelingJudge?: RescuedNodeLabelingPort;
  // Every reserved assumed-prerequisite proposal is durability-judged before it may
  // cross source-less grounding admission. The Graph Enrichment boundary structurally
  // pairs this dependency with proposal and admission, so there is no bypass path.
  mintingDurabilityJudge: MintingDurabilityJudgmentPort;
  bounds?: EnrichmentMintingBounds;
  newNodeId: () => string;
  // Stage-bracket seam (U1): local LLM ports use their fine STAGE_TAGS names and the
  // finished admission module receives the same operation-scoped bracket. Defaults to
  // a passthrough so a direct unit test runs un-instrumented.
  stage?: StageBracket;
}): Promise<{
  rescuedNodes: SourceMentionedEnrichmentNode[];
  mintedNodes: LlmGroundedEnrichmentNode[];
  rescueDispositions: RescueDisposition[];
  mintingDispositions: MintingDisposition[];
  groundingAdmissionDispositions: GroundingAdmissionDisposition[];
}> {
  const bounds = input.bounds ?? DEFAULT_MINTING_BOUNDS;
  const stage = input.stage ?? passthroughStageBracket;

  // A label is "taken" when an anchor, a rescued node, or an already-minted node in
  // the same Declared Domain already carries it — the single dedupe authority for the
  // whole enrichment-node space (deterministic identity, ADR-0015 spirit).
  const takenByDomain = new Map<string, Map<string, string>>();
  const isTaken = (domain: string, normalized: string) => takenByDomain.get(domain)?.has(normalized) ?? false;
  const take = (domain: string, normalized: string, label: string) => {
    const labels = takenByDomain.get(domain) ?? new Map<string, string>();
    if (!labels.has(normalized)) labels.set(normalized, label);
    takenByDomain.set(domain, labels);
  };
  // Release a reservation. Used only to un-reserve a minting label whose proposal was
  // dropped: a minting verdict is anchor-scoped, so the label must stay available for a
  // later same-domain anchor (reservation scope = verdict scope). Safe because a label
  // is only reserved here after passing `isTaken`, so a dropped proposal is its sole
  // holder — releasing it never frees a label an anchor, rescued, or minted node owns.
  const untake = (domain: string, normalized: string) => {
    takenByDomain.get(domain)?.delete(normalized);
  };
  for (const anchor of input.anchors) take(anchor.declaredDomain, anchor.normalizedLabel, anchor.canonicalLabel);

  // --- Rescue: source_mentioned nodes from member-run non-core mentions ----------
  const rescuedByKey = new Map<string, SourceMentionedEnrichmentNode>();
  for (const candidate of input.rescueCandidates) {
    if (isTaken(candidate.declaredDomain, candidate.normalizedLabel)) {
      // Already an anchor or an earlier member run's rescue — merge its mentions so a
      // concept appearing in two member runs collapses to a single node (R7, KTD5).
      const existing = rescuedByKey.get(`${candidate.declaredDomain}|${candidate.normalizedLabel}`);
      if (existing) existing.groundingPassages.push(...rescuePassages(candidate));
      continue;
    }
    take(candidate.declaredDomain, candidate.normalizedLabel, candidate.canonicalLabel);
    rescuedByKey.set(`${candidate.declaredDomain}|${candidate.normalizedLabel}`, {
      nodeKind: "enrichment",
      derivedNodeId: input.newNodeId(),
      groundingOrigin: "source_mentioned",
      role: "prerequisite",
      layer: "derived",
      canonicalLabel: candidate.canonicalLabel,
      normalizedLabel: candidate.normalizedLabel,
      declaredDomain: candidate.declaredDomain,
      aliases: candidate.aliases,
      groundingPassages: rescuePassages(candidate)
    });
  }
  const aggregatedRescuedNodes = [...rescuedByKey.values()];

  // --- Durability judging over AGGREGATED rescue nodes (U3) -----------------------
  // The judge runs once per merged candidate (so it sees the node's full aggregated
  // evidence) against the same-domain anchors it would scaffold. Drop-only and
  // fail-open-with-flag. Dropped nodes leave the derived layer but their labels stay
  // in `takenByDomain`, so the minting pass below cannot resurrect a dropped concept
  // as an `llm_grounded` node. When no judge is provided, every node is accepted.
  let rescuedNodes = aggregatedRescuedNodes;
  let rescueDispositions: RescueDisposition[] = [];
  if (input.rescueDurabilityJudge && aggregatedRescuedNodes.length > 0) {
    const anchorsByDomain = new Map<string, { canonicalLabel: string; definitionQuotes: string[] }[]>();
    for (const anchor of input.anchors) {
      const existing = anchorsByDomain.get(anchor.declaredDomain) ?? [];
      existing.push({ canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes });
      anchorsByDomain.set(anchor.declaredDomain, existing);
    }
    const judged = await stage(STAGE_TAGS.rescueDurability, () =>
      applyRescueDurabilityJudge({
        rescuedNodes: aggregatedRescuedNodes,
        anchorsByDomain,
        judge: input.rescueDurabilityJudge!
      })
    );
    rescuedNodes = judged.keptNodes;
    rescueDispositions = judged.dispositions;
  }

  // --- Rescued-Node Canonical Labeling over KEPT durable nodes (TODO #1) ----------
  // A dedicated measured step re-names each durable rescued node — whose label is the source
  // sentence it was mentioned in — to a concept-shaped label (one whole-set call per Declared
  // Domain). Adoption keeps its single authority HERE: a proposal is adopted only when its
  // normalized form is UNCLAIMED in the domain (the same `isTaken` guard that dedupes every
  // enrichment node). On adoption the new label is reserved (blocking a later same-domain
  // candidate from taking it), the original sentence is demoted to an alias, and the re-label is
  // recorded on the disposition. A collision or an empty proposal keeps the original (fail-open).
  if (input.rescuedNodeLabelingJudge && rescuedNodes.length > 0) {
    const takenLabelsByDomain = new Map<string, string[]>();
    for (const anchor of input.anchors) {
      const bucket = takenLabelsByDomain.get(anchor.declaredDomain) ?? [];
      bucket.push(anchor.canonicalLabel);
      takenLabelsByDomain.set(anchor.declaredDomain, bucket);
    }
    const canonicalLabelProposalByNodeId = await stage(STAGE_TAGS.rescuedNodeLabeling, () =>
      applyRescuedNodeLabeling({
        rescuedNodes,
        takenLabelsByDomain,
        judge: input.rescuedNodeLabelingJudge!
      })
    );
    const dispositionByNodeId = new Map(rescueDispositions.map((disposition) => [disposition.derivedNodeId, disposition] as const));
    for (const node of rescuedNodes) {
      const proposal = canonicalLabelProposalByNodeId.get(node.derivedNodeId);
      if (!proposal) continue;
      const normalized = normalizeConceptLabel(proposal);
      if (normalized.length === 0 || normalized === node.normalizedLabel || isTaken(node.declaredDomain, normalized)) continue;
      take(node.declaredDomain, normalized, proposal);
      const original = node.canonicalLabel;
      node.aliases = [original, ...node.aliases.filter((alias) => alias !== original)];
      node.canonicalLabel = proposal;
      node.normalizedLabel = normalized;
      const disposition = dispositionByNodeId.get(node.derivedNodeId);
      if (disposition) {
        disposition.relabeledFrom = original;
        disposition.canonicalLabel = proposal;
        disposition.normalizedLabel = normalized;
      }
    }
  }

  // --- Mint: anchor-driven bounded llm_grounded nodes ----------------------------
  const mintedNodes: LlmGroundedEnrichmentNode[] = [];
  const mintingDispositions: MintingDisposition[] = [];
  const groundingAdmissionDispositions: GroundingAdmissionDisposition[] = [];
  const admission = input.sourceLessGroundingAdmission.forOperation(stage);
  let runBudget = bounds.maxMintedPerRun;
  // Deterministic anchor order so a replayed run proposes in the same sequence.
  const anchors = [...input.anchors].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
  for (const anchor of anchors) {
    if (runBudget <= 0) break;
    const maxProposals = Math.min(bounds.maxMintedPerAnchor, runBudget);
    const existingLabels = labelsInDomain(takenByDomain, anchor.declaredDomain);
    const proposals = await stage(STAGE_TAGS.missingPrerequisiteProposal, () =>
      input.proposalPort.propose({
        declaredDomain: anchor.declaredDomain,
        anchor: { conceptId: anchor.conceptId, canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes },
        existingNodeLabels: existingLabels,
        maxProposals
      })
    );

    const reserved: ReservedMintingProposal[] = [];
    for (const proposal of proposals) {
      // Never reserve more than the budget can mint, regardless of whether the port
      // honored `maxProposals`. This bounds judge calls and guarantees reserved.length
      // <= runBudget, so every KEPT proposal is mintable: a dropped proposal frees no
      // budget but no kept proposal is ever recorded `accepted` without a node.
      if (reserved.length >= maxProposals) break;
      const normalized = normalizeConceptLabel(proposal.proposedLabel);
      if (normalized.length === 0 || isTaken(anchor.declaredDomain, normalized)) continue;
      take(anchor.declaredDomain, normalized, proposal.proposedLabel);
      const derivedNodeId = input.newNodeId();
      reserved.push({
        derivedNodeId,
        proposedLabel: proposal.proposedLabel,
        normalizedLabel: normalized,
        declaredDomain: anchor.declaredDomain,
        rationale: proposal.rationale,
        anchor: { conceptId: anchor.conceptId, canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes }
      });
    }

    const keptProposals = reserved.length > 0
      ? await stage(STAGE_TAGS.mintingDurability, () =>
          applyMintingDurabilityJudge({ proposals: reserved, judge: input.mintingDurabilityJudge })
        )
      : { keptProposals: reserved, dispositions: [] };
    mintingDispositions.push(...keptProposals.dispositions);
    // A `dropped` verdict is scoped to THIS anchor, so release the label: a later
    // same-domain anchor that genuinely depends on the concept can re-propose and be
    // judged independently (Option 1 — reservation scope follows verdict scope). Kept
    // and fail-open labels stay reserved because they become real nodes.
    for (const disposition of keptProposals.dispositions) {
      if (disposition.disposition === "dropped") untake(disposition.declaredDomain, disposition.normalizedLabel);
    }

    const admissionCandidates = keptProposals.keptProposals.map(toAdmissionCandidate);
    const outcomes = admissionCandidates.length > 0
      ? await admission.admitBatch(admissionCandidates)
      : [];
    if (outcomes.length !== keptProposals.keptProposals.length) {
      throw new Error("Source-less Grounding Admission returned a result-count mismatch for prerequisite minting.");
    }

    let mintedForAnchor = 0;
    for (const [index, proposal] of keptProposals.keptProposals.entries()) {
      const outcome = outcomes[index];
      if (!outcome || outcome.candidateKey !== proposal.derivedNodeId) {
        throw new Error(`Source-less Grounding Admission returned an out-of-order prerequisite outcome for ${JSON.stringify(proposal.derivedNodeId)}.`);
      }
      groundingAdmissionDispositions.push(recordGroundingAdmissionDisposition(proposal, outcome));
      if (outcome.disposition === "held_out") {
        // Knowledge-boundary uncertainty is domain/label scoped: keep the reservation so a later
        // same-domain anchor cannot turn the same ungrounded concept into a trusted node.
        continue;
      }
      if (outcome.disposition === "rejected") {
        // Factual rejection is label + anchor-context scoped. Release the reservation so a later
        // same-domain anchor may propose and independently ground the concept in its own context.
        untake(proposal.declaredDomain, proposal.normalizedLabel);
        continue;
      }
      if (runBudget <= 0 || mintedForAnchor >= bounds.maxMintedPerAnchor) {
        throw new Error("Source-less Grounding Admission admitted more prerequisite nodes than the reserved minting budget permits.");
      }
      mintedNodes.push({
        nodeKind: "enrichment",
        derivedNodeId: proposal.derivedNodeId,
        groundingOrigin: "llm_grounded",
        mintingReason: "assumed_prerequisite",
        role: "prerequisite",
        layer: "derived",
        canonicalLabel: proposal.proposedLabel,
        normalizedLabel: proposal.normalizedLabel,
        declaredDomain: anchor.declaredDomain,
        aliases: [],
        groundingBundle: outcome.bundle
      });
      mintedForAnchor += 1;
      runBudget -= 1;
    }
  }

  return { rescuedNodes, mintedNodes, rescueDispositions, mintingDispositions, groundingAdmissionDispositions };
}

function toAdmissionCandidate(proposal: ReservedMintingProposal): GroundingAdmissionCandidate {
  const [firstDefinition, ...remainingDefinitions] = proposal.anchor.definitionQuotes;
  if (!firstDefinition) {
    throw new Error(`Cannot ground ${proposal.proposedLabel} on anchor ${proposal.anchor.conceptId} without a Definition Passage.`);
  }
  return {
    candidateKey: proposal.derivedNodeId,
    canonicalLabel: proposal.proposedLabel,
    aliases: [],
    declaredDomain: proposal.declaredDomain,
    context: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: proposal.anchor.conceptId,
        canonicalLabel: proposal.anchor.canonicalLabel,
        definitionPassages: [firstDefinition, ...remainingDefinitions]
      }
    }
  };
}

function recordGroundingAdmissionDisposition(
  proposal: ReservedMintingProposal,
  outcome: GroundingAdmissionOutcome
): GroundingAdmissionDisposition {
  const base = {
    derivedNodeId: proposal.derivedNodeId,
    proposedLabel: proposal.proposedLabel,
    normalizedLabel: proposal.normalizedLabel,
    declaredDomain: proposal.declaredDomain,
    anchorConceptId: proposal.anchor.conceptId
  };
  if (outcome.disposition === "admitted") return { ...base, disposition: outcome.disposition, probe: outcome.probe };
  if (outcome.disposition === "held_out") {
    return { ...base, disposition: outcome.disposition, reason: outcome.reason, probe: outcome.probe };
  }
  return {
    ...base,
    disposition: outcome.disposition,
    reason: outcome.reason,
    probe: outcome.probe,
    rationale: outcome.rationale
  };
}

function rescuePassages(candidate: NonCoreRescueCandidate): SourceMentionGroundingPassage[] {
  // Reuse both Definition and mention evidence (KTD1). Definitions lead — they are the
  // richer grounding that downstream study items prefer (U4). Every passage is provisional
  // `verified`; the verbatim floor (U3) re-verifies each quote against its cited block.
  const passage = (
    passageType: "definition" | "mention",
    source: NonCoreRescueCandidate["mentions"][number]
  ): SourceMentionGroundingPassage => ({
    passageType,
    text: source.evidenceQuote,
    groundingOrigin: "source_mentioned",
    sourceResourceId: source.sourceResourceId,
    sourceBlockId: source.sourceBlockId,
    evidenceQuote: source.evidenceQuote,
    headingPath: source.headingPath,
    locator: source.locator,
    verbatimCheck: { disposition: "verified", sourceResourceId: source.sourceResourceId, sourceBlockId: source.sourceBlockId }
  });
  return [
    ...candidate.definitions.map((definition) => passage("definition", definition)),
    ...candidate.mentions.map((mention) => passage("mention", mention))
  ];
}

// The labels already present in one domain, as canonical strings, so the proposer can
// avoid re-proposing an anchor, a rescued node, or an earlier-minted node.
function labelsInDomain(
  takenByDomain: Map<string, Map<string, string>>,
  domain: string
): string[] {
  return [...(takenByDomain.get(domain)?.values() ?? [])];
}
