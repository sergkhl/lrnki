import type { MintingDisposition } from "@lrnki/domain-core";
import type { MintingDurabilityJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

export type ReservedMintingProposal = {
  derivedNodeId: string;
  proposedLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  rationale: string;
  anchor: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] };
};

// Measured minting durability stage. Runs AFTER proposal labels are reserved and
// BEFORE generated grounding is created, so a dropped proposal never spends a
// grounding call and never becomes a node. Drop-only and fail-open: unavailable or
// schema-invalid judge output keeps the proposal and records why.
export async function applyMintingDurabilityJudge(input: {
  proposals: ReservedMintingProposal[];
  judge: MintingDurabilityJudgmentPort;
  concurrency?: number;
}): Promise<{ keptProposals: ReservedMintingProposal[]; dispositions: MintingDisposition[] }> {
  // The `MintingDisposition[]` IS the gate's index-aligned outcome array (rule 16,
  // gateByJudgment): `onVerdict` records accepted/dropped on a confident verdict;
  // `onUnavailable` records `kept_judge_unavailable` (fail open — a transport blip
  // never drops a proposal). No item is skipped: every proposal is judged.
  const dispositions = await gateByJudgment(input.proposals, {
    concurrency: input.concurrency,
    judge: (proposal) =>
      input.judge.judge({
        declaredDomain: proposal.declaredDomain,
        proposal: { proposedLabel: proposal.proposedLabel, rationale: proposal.rationale },
        anchor: { canonicalLabel: proposal.anchor.canonicalLabel, definitionQuotes: proposal.anchor.definitionQuotes }
      }),
    onVerdict: (proposal, judgment) =>
      record(proposal, judgment.verdict === "not_durable" ? "dropped" : "accepted", judgment.rationale),
    onUnavailable: (proposal) =>
      record(proposal, "kept_judge_unavailable", "minting durability judge unavailable")
  });
  const dropped = new Set(
    dispositions
      .filter((disposition) => disposition.disposition === "dropped")
      .map((disposition) => disposition.derivedNodeId)
  );
  const keptProposals = input.proposals.filter((proposal) => !dropped.has(proposal.derivedNodeId));
  return { keptProposals, dispositions };
}

function record(
  proposal: ReservedMintingProposal,
  disposition: MintingDisposition["disposition"],
  rationale: string
): MintingDisposition {
  return {
    derivedNodeId: proposal.derivedNodeId,
    proposedLabel: proposal.proposedLabel,
    normalizedLabel: proposal.normalizedLabel,
    declaredDomain: proposal.declaredDomain,
    anchorConceptId: proposal.anchor.conceptId,
    disposition,
    rationale: rationale.trim()
  };
}
