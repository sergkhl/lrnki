import assert from "node:assert/strict";
import { test } from "node:test";
import { createMissingPrerequisiteProposalPort } from "./missingPrerequisiteProposalAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function adapterReturning(canned: { proposals: { proposedLabel: string; rationale: string }[] }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createMissingPrerequisiteProposalPort(client), calls };
}

test("proposes assumed-prior prerequisites for one anchor, conditioned on its evidence", async () => {
  const { adapter, calls } = adapterReturning({
    proposals: [
      { proposedLabel: "Stack allocation", rationale: "A learner must know stack memory before Copy semantics." },
      { proposedLabel: "Heap allocation", rationale: "Move semantics assume an understanding of heap-owned data." }
    ]
  });

  const proposals = await adapter.propose({
    declaredDomain: "software engineering",
    anchor: { conceptId: "copy", canonicalLabel: "Copy Trait", definitionQuotes: ["Types with a known size implement Copy."] },
    existingNodeLabels: ["Copy Trait", "Ownership"],
    maxProposals: 2
  });

  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].proposedLabel, "Stack allocation");

  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "kg-source-less-node-generation");
  assert.equal(call.toolName, "submit_missing_prerequisites");
  assert.ok(call.messages.some((message) => message.content.includes("Copy Trait")));
  assert.ok(call.messages.some((message) => message.content.includes("Ownership")));
  assert.ok(call.messages.some((message) => message.content.includes("Types with a known size")));
});

test("enforces the per-anchor cap deterministically even if the model over-returns", async () => {
  const { adapter } = adapterReturning({
    proposals: [
      { proposedLabel: "A", rationale: "r" },
      { proposedLabel: "B", rationale: "r" },
      { proposedLabel: "C", rationale: "r" }
    ]
  });

  const proposals = await adapter.propose({
    declaredDomain: "software engineering",
    anchor: { conceptId: "x", canonicalLabel: "X", definitionQuotes: [] },
    existingNodeLabels: [],
    maxProposals: 2
  });

  assert.deepEqual(proposals.map((p) => p.proposedLabel), ["A", "B"]);
});

test("an empty proposal list is valid (source assumes nothing)", async () => {
  const { adapter } = adapterReturning({ proposals: [] });
  const proposals = await adapter.propose({
    declaredDomain: "biology",
    anchor: { conceptId: "x", canonicalLabel: "X", definitionQuotes: ["..."] },
    existingNodeLabels: [],
    maxProposals: 2
  });
  assert.deepEqual(proposals, []);
});
