import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrerequisiteConceptContext } from "@lrnki/domain-core";
import { LiteLlmPrerequisiteJudgmentAdapter, LiteLlmRescueDurabilityJudgmentAdapter, RESCUE_DURABILITY_JUDGE_MODEL } from "./enrichmentAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { batchedPrerequisiteJudgmentValidator } from "./toolSchemas";

function context(derivedNodeId: string, canonicalLabel: string): PrerequisiteConceptContext {
  return { derivedNodeId, canonicalLabel, aliases: [], definitions: [`${canonicalLabel} def`], mentions: [], assertions: [] };
}

type Relation = { candidateRef: string; relation: string; prerequisiteLabel: string; confidence: number; rationale: string };

// Stub the forced-tool client so the test exercises ONLY the adapter's batched
// candidateRef/label -> id mapping, not the network. The canned object stands in for
// the validated tool args (a deterministic envelope over a canned response — rule 11).
function adapterReturning(canned: { relations: Relation[] }) {
  const client = { async call() { return canned; } } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmPrerequisiteJudgmentAdapter(client);
}

const subject = context("idS", "Ownership");
const moveSemantics = context("idA", "Move semantics");
const borrowing = context("idB", "Borrowing");

test("names the SUBJECT as prerequisite -> directed subject->candidate", async () => {
  const { relations } = await adapterReturning({
    relations: [{ candidateRef: "Move semantics", relation: "prerequisite", prerequisiteLabel: "Ownership", confidence: 0.9, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(relations.length, 1);
  assert.equal(relations[0].outcome, "directed");
  assert.equal(relations[0].prerequisiteDerivedNodeId, "idS");
  assert.equal(relations[0].dependentDerivedNodeId, "idA");
});

test("names the CANDIDATE as prerequisite -> directed candidate->subject (no positional bias)", async () => {
  const { relations } = await adapterReturning({
    relations: [{ candidateRef: "Move semantics", relation: "prerequisite", prerequisiteLabel: "Move semantics", confidence: 0.9, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(relations[0].outcome, "directed");
  assert.equal(relations[0].prerequisiteDerivedNodeId, "idA");
  assert.equal(relations[0].dependentDerivedNodeId, "idS");
});

test("candidateRef and prerequisiteLabel match are case-insensitive and trimmed", async () => {
  const { relations } = await adapterReturning({
    relations: [{ candidateRef: "  move SEMANTICS ", relation: "prerequisite", prerequisiteLabel: "  OWNERSHIP ", confidence: 0.8, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(relations[0].outcome, "directed");
  assert.equal(relations[0].prerequisiteDerivedNodeId, "idS");
});

// AE1: a 'prerequisite' relation whose label matches neither concept degrades to
// 'uncertain' rather than producing an edge.
test("a 'prerequisite' relation naming neither subject nor candidate fails closed to uncertain", async () => {
  const { relations } = await adapterReturning({
    relations: [{ candidateRef: "Move semantics", relation: "prerequisite", prerequisiteLabel: "Pointers", confidence: 0.9, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(relations[0].outcome, "uncertain");
});

test("'none' maps to none; 'uncertain' maps to uncertain", async () => {
  const none = await adapterReturning({
    relations: [{ candidateRef: "Move semantics", relation: "none", prerequisiteLabel: "", confidence: 0.1, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(none.relations[0].outcome, "none");
  const uncertain = await adapterReturning({
    relations: [{ candidateRef: "Move semantics", relation: "uncertain", prerequisiteLabel: "", confidence: 0.4, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(uncertain.relations[0].outcome, "uncertain");
});

// Per-candidate results map to the correct candidate ids regardless of array order.
test("results map to the correct candidate regardless of returned order", async () => {
  const { relations } = await adapterReturning({
    relations: [
      { candidateRef: "Borrowing", relation: "prerequisite", prerequisiteLabel: "Borrowing", confidence: 0.9, rationale: "r" },
      { candidateRef: "Move semantics", relation: "none", prerequisiteLabel: "", confidence: 0.1, rationale: "r" }
    ]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics, borrowing] });
  // Results follow INPUT candidate order: [moveSemantics, borrowing].
  assert.equal(relations.length, 2);
  assert.equal(relations[0].outcome, "none"); // moveSemantics
  assert.equal(relations[1].outcome, "directed"); // borrowing
  assert.equal(relations[1].prerequisiteDerivedNodeId, "idB");
  assert.equal(relations[1].dependentDerivedNodeId, "idS");
});

// Fail-closed: a candidateRef matching no provided candidate is dropped (never mapped
// to a guessed candidate), and a provided candidate the model omitted degrades to
// uncertain — so coverage stays exhaustive without inventing an edge.
test("unmatched candidateRef is dropped; an omitted candidate degrades to uncertain", async () => {
  const { relations } = await adapterReturning({
    relations: [{ candidateRef: "Nonexistent", relation: "prerequisite", prerequisiteLabel: "Ownership", confidence: 0.9, rationale: "r" }]
  }).judge({ declaredDomain: "x", subject, candidates: [moveSemantics] });
  assert.equal(relations.length, 1, "exactly one result per provided candidate");
  assert.equal(relations[0].dependentDerivedNodeId, "idA");
  assert.equal(relations[0].outcome, "uncertain");
  assert.equal(relations[0].confidence, 0);
});

// Fail-closed (rule 6): the validator rejects a relation missing a required field.
test("validator rejects a relation missing a required field", () => {
  assert.throws(() => batchedPrerequisiteJudgmentValidator.parse({
    relations: [{ candidateRef: "x", relation: "none", confidence: 0.1, rationale: "r" }] // missing prerequisiteLabel
  }));
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
