import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrerequisiteConceptContext } from "@lrnki/domain-core";
import { LiteLlmPrerequisiteJudgmentAdapter } from "./enrichmentAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function context(conceptId: string, canonicalLabel: string): PrerequisiteConceptContext {
  return { conceptId, canonicalLabel, aliases: [], definitions: [`${canonicalLabel} def`], mentions: [], assertions: [] };
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
  assert.equal(judgment.prerequisiteConceptId, "idA");
  assert.equal(judgment.dependentConceptId, "idB");
});

test("names the B-side concept as prerequisite -> directed b->a (no positional bias)", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "Move semantics", confidence: 0.9, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "directed");
  assert.equal(judgment.prerequisiteConceptId, "idB");
  assert.equal(judgment.dependentConceptId, "idA");
});

test("label match is case-insensitive and trimmed", async () => {
  const judgment = await adapterReturning({ relation: "prerequisite", prerequisiteLabel: "  move SEMANTICS ", confidence: 0.8, rationale: "r" }).judge({ declaredDomain: "x", a, b });
  assert.equal(judgment.outcome, "directed");
  assert.equal(judgment.prerequisiteConceptId, "idB");
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
