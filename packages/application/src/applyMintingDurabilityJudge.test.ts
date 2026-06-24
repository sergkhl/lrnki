import assert from "node:assert/strict";
import { test } from "node:test";
import type { MintingDurabilityJudgmentPort } from "@lrnki/ports";
import { applyMintingDurabilityJudge, type ReservedMintingProposal } from "./applyMintingDurabilityJudge";

function proposal(id: string, label: string): ReservedMintingProposal {
  return {
    derivedNodeId: id,
    proposedLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: "software engineering",
    rationale: `why ${label}`,
    anchor: { conceptId: "anchor-1", canonicalLabel: "Borrowing", definitionQuotes: ["Borrowing is defined here."] }
  };
}

test("drops not_durable proposals and records dispositions", async () => {
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) => ({
      verdict: input.proposal.proposedLabel === "Incidental label" ? "not_durable" : "durable",
      rationale: `${input.proposal.proposedLabel} judgment`
    })
  };
  const result = await applyMintingDurabilityJudge({
    proposals: [proposal("dn-1", "Incidental label"), proposal("dn-2", "Lifetime")],
    judge
  });
  assert.deepEqual(result.keptProposals.map((item) => item.derivedNodeId), ["dn-2"]);
  assert.equal(result.dispositions.find((item) => item.derivedNodeId === "dn-1")?.disposition, "dropped");
  assert.equal(result.dispositions.find((item) => item.derivedNodeId === "dn-2")?.disposition, "accepted");
});

test("judge failure keeps proposals fail-open and records unavailable", async () => {
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => {
      throw new Error("transport");
    }
  };
  const result = await applyMintingDurabilityJudge({ proposals: [proposal("dn-1", "Lifetime")], judge });
  assert.deepEqual(result.keptProposals.map((item) => item.derivedNodeId), ["dn-1"]);
  assert.equal(result.dispositions[0].disposition, "kept_judge_unavailable");
  assert.equal(result.dispositions[0].anchorConceptId, "anchor-1");
});
