import assert from "node:assert/strict";
import test from "node:test";
import type { RescueDurabilityJudgment, SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { RescueDurabilityJudgmentPort } from "@lrnki/ports";
import { applyRescueDurabilityJudge } from "./applyRescueDurabilityJudge";

function rescuedNode(overrides: Partial<SourceMentionedEnrichmentNode> = {}): SourceMentionedEnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId: overrides.derivedNodeId ?? "node-1",
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: overrides.canonicalLabel ?? "Ablation Variant B",
    normalizedLabel: overrides.normalizedLabel ?? "ablation variant b",
    declaredDomain: overrides.declaredDomain ?? "educational technology",
    aliases: overrides.aliases ?? [],
    groundingPassages: overrides.groundingPassages ?? [
      {
        passageType: "mention",
        text: "We ablate variant B of the proposed system in Table 3.",
        groundingOrigin: "source_mentioned",
        sourceResourceId: "source-1",
        sourceBlockId: "block-1",
        evidenceQuote: "We ablate variant B of the proposed system in Table 3.",
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "verified", sourceResourceId: "source-1", sourceBlockId: "block-1" }
      }
    ]
  };
}

const anchorsByDomain = new Map([
  ["educational technology", [{ canonicalLabel: "Knowledge Gap Diagnosis", definitionQuotes: ["A knowledge gap is the difference between mastery and target."] }]]
]);

function judgeReturning(judgment: RescueDurabilityJudgment): RescueDurabilityJudgmentPort {
  return { model: "kg-independent-judge", judge: async () => judgment };
}

test("a durable verdict keeps the node and records an accepted disposition", async () => {
  const node = rescuedNode({ canonicalLabel: "Spaced Repetition" });
  const { keptNodes, dispositions } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: judgeReturning({ verdict: "durable", groundingSpan: "", rationale: "transferable learning concept" })
  });

  assert.equal(keptNodes.length, 1);
  assert.equal(dispositions[0].disposition, "accepted");
  assert.equal(dispositions[0].derivedNodeId, "node-1");
});

test("a durable verdict surfaces a concept-shaped canonical label proposal keyed by node (U8)", async () => {
  const node = rescuedNode({ derivedNodeId: "node-9", canonicalLabel: "Memory is freed when the owner goes out of scope" });
  const { canonicalLabelProposalByNodeId } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: judgeReturning({ verdict: "durable", groundingSpan: "", rationale: "durable prerequisite", canonicalLabelProposal: "Ownership-based memory release" })
  });
  assert.equal(canonicalLabelProposalByNodeId.get("node-9"), "Ownership-based memory release");
});

test("a not_durable verdict never surfaces a re-label proposal (U8)", async () => {
  const node = rescuedNode({ derivedNodeId: "node-2" });
  const { canonicalLabelProposalByNodeId } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: judgeReturning({
      verdict: "not_durable",
      groundingSpan: "We ablate variant B of the proposed system",
      rationale: "incidental",
      canonicalLabelProposal: "Should Be Ignored"
    })
  });
  assert.equal(canonicalLabelProposalByNodeId.size, 0, "a dropped verdict's proposal is ignored");
});

test("a confident, grounded not_durable verdict drops the node with a recorded rationale", async () => {
  // Reproduces the InstructKG role/ablation/method-artifact noise generically — the
  // span is copied from the node's own mention, so the veto is grounded.
  const node = rescuedNode();
  const { keptNodes, dispositions } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: judgeReturning({
      verdict: "not_durable",
      groundingSpan: "We ablate variant B of the proposed system",
      rationale: "an ablation label specific to one system, not a durable prerequisite"
    })
  });

  assert.equal(keptNodes.length, 0);
  assert.equal(dispositions[0].disposition, "dropped");
  assert.match(dispositions[0].rationale, /ablation/);
});

test("an ungrounded not_durable verdict keeps the node and flags kept_judge_unavailable (rule 16)", async () => {
  const node = rescuedNode();
  const { keptNodes, dispositions } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: judgeReturning({
      verdict: "not_durable",
      groundingSpan: "text the candidate's mentions never contain",
      rationale: "claims non-durability on absent text"
    })
  });

  assert.equal(keptNodes.length, 1);
  assert.equal(dispositions[0].disposition, "kept_judge_unavailable");
});

test("a judge transport failure keeps the node and flags kept_judge_unavailable (fail open)", async () => {
  const node = rescuedNode();
  const failingJudge: RescueDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => { throw new Error("model unavailable"); }
  };
  const { keptNodes, dispositions } = await applyRescueDurabilityJudge({
    rescuedNodes: [node],
    anchorsByDomain,
    judge: failingJudge
  });

  assert.equal(keptNodes.length, 1);
  assert.equal(dispositions[0].disposition, "kept_judge_unavailable");
});

test("drop-only: the judge only filters rescued nodes, never adds one", async () => {
  const nodes = [rescuedNode({ derivedNodeId: "a", canonicalLabel: "A" }), rescuedNode({ derivedNodeId: "b", canonicalLabel: "B" })];
  const dropFirst: RescueDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) =>
      input.candidate.canonicalLabel === "A"
        ? { verdict: "not_durable", groundingSpan: "We ablate variant B of the proposed system", rationale: "incidental" }
        : { verdict: "durable", groundingSpan: "", rationale: "durable" }
  };
  const { keptNodes, dispositions } = await applyRescueDurabilityJudge({ rescuedNodes: nodes, anchorsByDomain, judge: dropFirst });

  assert.deepEqual(keptNodes.map((n) => n.derivedNodeId), ["b"]);
  assert.equal(dispositions.length, 2);
});
