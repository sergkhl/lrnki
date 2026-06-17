import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmBridgeConceptProposalAdapter } from "./densificationProposalAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { bridgeConceptProposalValidator } from "./toolSchemas";

function adapterReturning(canned: { proposals: { proposedLabel: string; rationale: string }[] }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: new LiteLlmBridgeConceptProposalAdapter(client, "mock-bridge-proposer"), calls };
}

test("proposes bridge concepts for one sparse gap with endpoint grounding", async () => {
  const { adapter, calls } = adapterReturning({
    proposals: [{ proposedLabel: "Density-gradient experimental design", rationale: "It connects labeling with separation for interpreting experiment results." }]
  });

  const proposals = await adapter.propose({
    declaredDomain: "molecular biology",
    gap: {
      a: { conceptId: "a", canonicalLabel: "isotopic labeling", groundingTexts: ["15N labels DNA density."] },
      b: { conceptId: "b", canonicalLabel: "ultracentrifugation", groundingTexts: ["Centrifugation separates DNA bands."] },
      declinedRationale: "The baseline found no direct prerequisite direction."
    },
    existingNodeLabels: ["isotopic labeling", "ultracentrifugation"],
    maxProposals: 1
  });

  assert.deepEqual(proposals, [
    { proposedLabel: "Density-gradient experimental design", rationale: "It connects labeling with separation for interpreting experiment results." }
  ]);
  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "mock-bridge-proposer");
  assert.equal(call.toolName, "submit_bridge_concepts");
  assert.ok(call.messages.some((message) => message.content.includes("15N labels DNA density.")));
  assert.ok(call.messages.some((message) => message.content.includes("Baseline declined-pair rationale")));
});

test("enforces the proposal cap deterministically", async () => {
  const { adapter } = adapterReturning({
    proposals: [
      { proposedLabel: "A", rationale: "r" },
      { proposedLabel: "B", rationale: "r" }
    ]
  });

  const proposals = await adapter.propose({
    declaredDomain: "economics",
    gap: {
      a: { conceptId: "a", canonicalLabel: "Division of Labour", groundingTexts: [] },
      b: { conceptId: "b", canonicalLabel: "Universal Opulence", groundingTexts: [] },
      declinedRationale: "No direct edge."
    },
    existingNodeLabels: [],
    maxProposals: 1
  });

  assert.deepEqual(proposals.map((proposal) => proposal.proposedLabel), ["A"]);
});

test("an empty proposal list is valid", async () => {
  const { adapter } = adapterReturning({ proposals: [] });
  const proposals = await adapter.propose({
    declaredDomain: "educational technology",
    gap: {
      a: { conceptId: "a", canonicalLabel: "Semantic Signals", groundingTexts: [] },
      b: { conceptId: "b", canonicalLabel: "Pedagogical Roles", groundingTexts: [] },
      declinedRationale: "Co-equal concepts."
    },
    existingNodeLabels: [],
    maxProposals: 1
  });

  assert.deepEqual(proposals, []);
});

test("malformed bridge proposal arguments fail closed at the schema boundary", () => {
  assert.throws(() => bridgeConceptProposalValidator.parse({ proposals: [{ proposedLabel: "", rationale: "r" }] }));
});
