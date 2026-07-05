import { normalizeConceptLabel } from "@lrnki/domain-core";
import type {
  LlmGroundedEnrichmentNode,
  NonCoreRescueCandidate,
  MintingDisposition,
  RescueDisposition,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type {
  GroundingGenerationPort,
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  RescueDurabilityJudgmentPort
} from "@lrnki/ports";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { applyMintingDurabilityJudge, type ReservedMintingProposal } from "./applyMintingDurabilityJudge";
import { applyRescueDurabilityJudge } from "./applyRescueDurabilityJudge";
import { passthroughStageBracket, type StageBracket } from "./runProgressReporter";

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
// construction), then the grounding port fills a CEP-shaped bundle for each accepted
// label. Both caps are enforced deterministically. Nothing here enters the asserted
// layer (R5); the verbatim floor (U6) runs over the result before pair judging.
export async function assembleEnrichmentNodes(input: {
  anchors: MintingAnchor[];
  rescueCandidates: NonCoreRescueCandidate[];
  proposalPort: MissingPrerequisiteProposalPort;
  groundingPort: GroundingGenerationPort;
  // Optional measured rescue durability judge (U3). When provided, each AGGREGATED
  // rescued node is judged against its same-domain anchors before minting runs; a
  // node judged non-durable (confident + grounded) is dropped with a recorded
  // disposition. Omitted -> rescue is unjudged (prior behavior) and every aggregated
  // node is accepted. Dropped labels stay "taken" so minting never resurrects them.
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  // Optional measured minting durability judge. When provided, each reserved
  // assumed-prerequisite proposal is judged before grounding generation. Omitted ->
  // minting is identical to prior behavior and emits no minting dispositions.
  mintingDurabilityJudge?: MintingDurabilityJudgmentPort;
  bounds?: EnrichmentMintingBounds;
  newNodeId: () => string;
  // Stage-bracket seam (U1): each inner LLM port call is wrapped with its fine STAGE_TAGS
  // name so its wall-clock joins the cost the call already self-tags. The assembly is a
  // sequential `await` loop, so only one bracket of a given name is ever open at once
  // (KTD2/KTD3). Defaults to a passthrough so a direct unit test runs un-instrumented.
  stage?: StageBracket;
}): Promise<{
  rescuedNodes: SourceMentionedEnrichmentNode[];
  mintedNodes: LlmGroundedEnrichmentNode[];
  rescueDispositions: RescueDisposition[];
  mintingDispositions: MintingDisposition[];
}> {
  const bounds = input.bounds ?? DEFAULT_MINTING_BOUNDS;
  const stage = input.stage ?? passthroughStageBracket;

  // A label is "taken" when an anchor, a rescued node, or an already-minted node in
  // the same Declared Domain already carries it — the single dedupe authority for the
  // whole enrichment-node space (deterministic identity, ADR-0015 spirit).
  const takenByDomain = new Map<string, Set<string>>();
  const isTaken = (domain: string, normalized: string) => takenByDomain.get(domain)?.has(normalized) ?? false;
  const take = (domain: string, normalized: string) => {
    const set = takenByDomain.get(domain) ?? new Set<string>();
    set.add(normalized);
    takenByDomain.set(domain, set);
  };
  // Release a reservation. Used only to un-reserve a minting label whose proposal was
  // dropped: a minting verdict is anchor-scoped, so the label must stay available for a
  // later same-domain anchor (reservation scope = verdict scope). Safe because a label
  // is only reserved here after passing `isTaken`, so a dropped proposal is its sole
  // holder — releasing it never frees a label an anchor, rescued, or minted node owns.
  const untake = (domain: string, normalized: string) => {
    takenByDomain.get(domain)?.delete(normalized);
  };
  for (const anchor of input.anchors) take(anchor.declaredDomain, anchor.normalizedLabel);

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
    take(candidate.declaredDomain, candidate.normalizedLabel);
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

    // Canonical re-label (U8, R12): a durable rescued node whose label reads as a source
    // sentence adopts the judge's concept-shaped proposal — but only when its normalized form is
    // UNCLAIMED in the domain (the same `isTaken` authority that dedupes every enrichment node).
    // On adoption the new label is reserved (blocking a later same-domain candidate from taking
    // it), the original sentence is demoted to an alias, and the re-label is recorded on the
    // disposition. A collision or an empty proposal keeps the original label (fail-open).
    const dispositionByNodeId = new Map(rescueDispositions.map((disposition) => [disposition.derivedNodeId, disposition] as const));
    for (const node of rescuedNodes) {
      const proposal = judged.canonicalLabelProposalByNodeId.get(node.derivedNodeId);
      if (!proposal) continue;
      const normalized = normalizeConceptLabel(proposal);
      if (normalized.length === 0 || normalized === node.normalizedLabel || isTaken(node.declaredDomain, normalized)) continue;
      take(node.declaredDomain, normalized);
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
  let runBudget = bounds.maxMintedPerRun;
  // Deterministic anchor order so a replayed run proposes in the same sequence.
  const anchors = [...input.anchors].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
  for (const anchor of anchors) {
    if (runBudget <= 0) break;
    const maxProposals = Math.min(bounds.maxMintedPerAnchor, runBudget);
    const existingLabels = labelsInDomain(takenByDomain, anchor.declaredDomain, input, rescuedNodes, mintedNodes);
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
      take(anchor.declaredDomain, normalized);
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

    const keptProposals = input.mintingDurabilityJudge && reserved.length > 0
      ? await stage(STAGE_TAGS.mintingDurability, () =>
          applyMintingDurabilityJudge({ proposals: reserved, judge: input.mintingDurabilityJudge! })
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

    let mintedForAnchor = 0;
    for (const proposal of keptProposals.keptProposals) {
      if (runBudget <= 0 || mintedForAnchor >= bounds.maxMintedPerAnchor) break;
      const groundingBundle = await stage(STAGE_TAGS.groundingGeneration, () =>
        input.groundingPort.generate({
          derivedNodeId: proposal.derivedNodeId,
          declaredDomain: anchor.declaredDomain,
          nodeLabel: proposal.proposedLabel,
          scaffoldedAnchors: [{ conceptId: anchor.conceptId, canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes }]
        })
      );
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
        groundingBundle
      });
      mintedForAnchor += 1;
      runBudget -= 1;
    }
  }

  return { rescuedNodes, mintedNodes, rescueDispositions, mintingDispositions };
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
  _takenByDomain: Map<string, Set<string>>,
  domain: string,
  input: { anchors: MintingAnchor[] },
  rescuedNodes: SourceMentionedEnrichmentNode[],
  mintedNodes: LlmGroundedEnrichmentNode[]
): string[] {
  const labels: string[] = [];
  for (const anchor of input.anchors) if (anchor.declaredDomain === domain) labels.push(anchor.canonicalLabel);
  for (const node of rescuedNodes) if (node.declaredDomain === domain) labels.push(node.canonicalLabel);
  for (const node of mintedNodes) if (node.declaredDomain === domain) labels.push(node.canonicalLabel);
  return labels;
}
