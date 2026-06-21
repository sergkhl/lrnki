import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrerequisiteConceptContext } from "@lrnki/domain-core";
import { LiteLlmPrerequisiteJudgmentAdapter, LiteLlmRescueDurabilityJudgmentAdapter, RESCUE_DURABILITY_JUDGE_MODEL } from "./enrichmentAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function context(derivedNodeId: string, canonicalLabel: string): PrerequisiteConceptContext {
  return { derivedNodeId, canonicalLabel, aliases: [], definitions: [`${canonicalLabel} def`], mentions: [], assertions: [] };
}

// Stub the forced-tool client so the test exercises ONLY the adapter's label->id
// mapping, not the network. The canned object stands in for the validated tool args.
function adapterReturning(canned: { relation: string; prerequisiteLabel: string; confidence: number; rationale: string }) {
  const client = { async call() { return canned; } } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmPrerequisiteJudgmentAdapter(client);
}

const a = context("idA", "Ownership");
const b = context("idB", "Move semantics");

test("names the A-side concept as prerequisite -> directed a->b", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "Ownership", confidence: 0.9, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "directed");
  assert.equal(judgment.prerequisiteDerivedNodeId, "idA");
  assert.equal(judgment.dependentDerivedNodeId, "idB");
});

test("names the B-side concept as prerequisite -> directed b->a (no positional bias)", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "Move semantics", confidence: 0.9, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "directed");
  assert.equal(judgment.prerequisiteDerivedNodeId, "idB");
  assert.equal(judgment.dependentDerivedNodeId, "idA");
});

test("label match is case-insensitive and trimmed", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "  move SEMANTICS ", confidence: 0.8, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "directed");
  assert.equal(judgment.prerequisiteDerivedNodeId, "idB");
});

test("a 'prerequisite' relation naming neither concept fails closed to uncertain", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "Borrowing", confidence: 0.9, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "uncertain");
});

test("'none' is mapped to none; 'uncertain' to uncertain", async () => {
  const none = await adapterReturning({ relation: "none", prerequisiteLabel: "", confidence: 0.1, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(none.outcome, "none");
  const uncertain = await adapterReturning({ relation: "uncertain", prerequisiteLabel: "", confidence: 0.4, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(uncertain.outcome, "uncertain");
});

// --- Rescue durability judge (U3) -----------------------------------------------

function rescueAdapterReturning(canned: { verdict: string; groundingSpan: string; rationale: string }) {
  const client = { async call() { return canned; } } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmRescueDurabilityJudgmentAdapter(client);
}

const rescueInput = {
  declaredDomain: "educational technology",
  candidate: { canonicalLabel: "Ablation Variant B", aliases: [], mentionQuotes: ["We ablate variant B in Table 3."] },
  anchors: [{ canonicalLabel: "Knowledge Gap Diagnosis", definitionQuotes: ["A gap is the difference between mastery and target."] }]
};

test("rescue judge runs on the independent cross-family alias", () => {
  assert.equal(RESCUE_DURABILITY_JUDGE_MODEL, "kg-independent-judge");
  assert.equal(rescueAdapterReturning({ verdict: "durable", groundingSpan: "", rationale: "r" }).model, "kg-independent-judge");
});

test("rescue judge passes through the validated verdict and grounding span (application grounds the veto)", async () => {
  const durable = await rescueAdapterReturning({ verdict: "durable", groundingSpan: "", rationale: "transferable" }).judge(rescueInput);
  assert.deepEqual(durable, { verdict: "durable", groundingSpan: "", rationale: "transferable" });

  const notDurable = await rescueAdapterReturning({ verdict: "not_durable", groundingSpan: "We ablate variant B in Table 3.", rationale: "ablation label" }).judge(rescueInput);
  assert.equal(notDurable.verdict, "not_durable");
  assert.equal(notDurable.groundingSpan, "We ablate variant B in Table 3.");
});
