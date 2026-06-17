import { normalizeConceptLabel } from "@lrnki/domain-core";
import type {
  LlmGroundedEnrichmentNode,
  MentionedNonCoreCandidate,
  RescueDisposition,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type { GroundingGenerationPort, MissingPrerequisiteProposalPort, RescueDurabilityJudgmentPort } from "@lrnki/ports";
import { applyRescueDurabilityJudge } from "./applyRescueDurabilityJudge";

// Bounds on the anchor-driven minting pass (KTD6, R7). Defaults keep densification
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
// RESCUE (KTD5): each member-run rejected/optional candidate the source mentions but
// never defines becomes a `source_mentioned` node carrying its real mention evidence,
// deduped by normalized label within Declared Domain. MINT (KTD6): each anchor drives
// a bounded, explicit proposal pass — the proposal port NAMES assumed-prior concepts
// (handoff constraint: node identity is an inspectable operation, not local string
// construction), then the grounding port fills a CEP-shaped bundle for each accepted
// label. Both caps are enforced deterministically. Nothing here enters the asserted
// layer (R5); the verbatim floor (U6) runs over the result before pair judging.
export async function assembleEnrichmentNodes(input: {
  anchors: MintingAnchor[];
  rescueCandidates: MentionedNonCoreCandidate[];
  proposalPort: MissingPrerequisiteProposalPort;
  groundingPort: GroundingGenerationPort;
  // Optional measured rescue durability judge (U3). When provided, each AGGREGATED
  // rescued node is judged against its same-domain anchors before minting runs; a
  // node judged non-durable (confident + grounded) is dropped with a recorded
  // disposition. Omitted -> rescue is unjudged (prior behavior) and every aggregated
  // node is accepted. Dropped labels stay "taken" so minting never resurrects them.
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  bounds?: EnrichmentMintingBounds;
  newNodeId: () => string;
}): Promise<{
  rescuedNodes: SourceMentionedEnrichmentNode[];
  mintedNodes: LlmGroundedEnrichmentNode[];
  rescueDispositions: RescueDisposition[];
}> {
  const bounds = input.bounds ?? DEFAULT_MINTING_BOUNDS;

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
    const judged = await applyRescueDurabilityJudge({
      rescuedNodes: aggregatedRescuedNodes,
      anchorsByDomain,
      judge: input.rescueDurabilityJudge
    });
    rescuedNodes = judged.keptNodes;
    rescueDispositions = judged.dispositions;
  }

  // --- Mint: anchor-driven bounded llm_grounded nodes ----------------------------
  const mintedNodes: LlmGroundedEnrichmentNode[] = [];
  let runBudget = bounds.maxMintedPerRun;
  // Deterministic anchor order so a replayed run proposes in the same sequence.
  const anchors = [...input.anchors].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
  for (const anchor of anchors) {
    if (runBudget <= 0) break;
    const maxProposals = Math.min(bounds.maxMintedPerAnchor, runBudget);
    const existingLabels = labelsInDomain(takenByDomain, anchor.declaredDomain, input, rescuedNodes, mintedNodes);
    const proposals = await input.proposalPort.propose({
      declaredDomain: anchor.declaredDomain,
      anchor: { conceptId: anchor.conceptId, canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes },
      existingNodeLabels: existingLabels,
      maxProposals
    });

    let mintedForAnchor = 0;
    for (const proposal of proposals) {
      if (runBudget <= 0 || mintedForAnchor >= bounds.maxMintedPerAnchor) break;
      const normalized = normalizeConceptLabel(proposal.proposedLabel);
      if (normalized.length === 0 || isTaken(anchor.declaredDomain, normalized)) continue;
      take(anchor.declaredDomain, normalized);
      const derivedNodeId = input.newNodeId();
      const groundingBundle = await input.groundingPort.generate({
        derivedNodeId,
        declaredDomain: anchor.declaredDomain,
        nodeLabel: proposal.proposedLabel,
        scaffoldedAnchors: [{ conceptId: anchor.conceptId, canonicalLabel: anchor.canonicalLabel, definitionQuotes: anchor.definitionQuotes }]
      });
      mintedNodes.push({
        nodeKind: "enrichment",
        derivedNodeId,
        groundingOrigin: "llm_grounded",
        mintingReason: "assumed_prerequisite",
        role: "prerequisite",
        layer: "derived",
        canonicalLabel: proposal.proposedLabel,
        normalizedLabel: normalized,
        declaredDomain: anchor.declaredDomain,
        aliases: [],
        groundingBundle
      });
      mintedForAnchor += 1;
      runBudget -= 1;
    }
  }

  return { rescuedNodes, mintedNodes, rescueDispositions };
}

function rescuePassages(candidate: MentionedNonCoreCandidate): SourceMentionGroundingPassage[] {
  return candidate.mentions.map((mention) => ({
    passageType: "mention",
    text: mention.evidenceQuote,
    groundingOrigin: "source_mentioned",
    sourceResourceId: mention.sourceResourceId,
    sourceBlockId: mention.sourceBlockId,
    evidenceQuote: mention.evidenceQuote,
    headingPath: mention.headingPath,
    locator: mention.locator,
    // Provisional; the verbatim floor (U6) re-verifies against the cited block.
    verbatimCheck: { disposition: "verified", sourceResourceId: mention.sourceResourceId, sourceBlockId: mention.sourceBlockId }
  }));
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
