import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrerequisiteConceptContext } from "@lrnki/domain-core";
import {
  LiteLlmMintingDurabilityJudgmentAdapter,
  LiteLlmPrerequisiteOrderingAdapter,
  LiteLlmRescueDurabilityJudgmentAdapter,
  MINTING_DURABILITY_JUDGE_MODEL,
  PREREQUISITE_ORDERING_MODEL,
  RESCUE_DURABILITY_JUDGE_MODEL
} from "./enrichmentAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { buildPrerequisiteOrderingValidator, mintingDurabilityJudgmentValidator } from "./toolSchemas";

function context(derivedNodeId: string, canonicalLabel: string): PrerequisiteConceptContext {
  return { derivedNodeId, canonicalLabel, aliases: [], definitions: [`${canonicalLabel} def`], mentions: [], assertions: [] };
}

type OrderingEdge = { prerequisiteNumber: number; dependentNumber: number; confidence: number; rationale: string };

// Stub the forced-tool client so the test exercises ONLY the adapter's render + validate
// + passthrough, not the network. The canned object stands in for the validated tool
// args (a deterministic envelope over a canned response — rule 11). `capture` records the
// last client call so a test can assert the prompt's forced tool name, stage tag, and
// per-call retry budget.
function adapterReturning(canned: { edges: OrderingEdge[] }, capture?: { lastCall?: { messages?: { role: string; content: string }[]; tags?: string[]; toolName?: string; maxRetries?: number } }) {
  const client = {
    async call(input: unknown) {
      if (capture) capture.lastCall = input as { messages?: { role: string; content: string }[]; tags?: string[]; toolName?: string; maxRetries?: number };
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmPrerequisiteOrderingAdapter(client);
}

const ownership = context("idS", "Ownership");
const moveSemantics = context("idA", "Move semantics");
const borrowing = context("idB", "Borrowing");

test("ordering adapter runs on the single non-DeepSeek ordering alias", () => {
  assert.equal(PREREQUISITE_ORDERING_MODEL, "kg-prerequisite-ordering");
  assert.equal(adapterReturning({ edges: [] }).model, "kg-prerequisite-ordering");
});

// Happy path: a well-formed edges array parses to a typed WholeSetOrdering in input order.
// Endpoints are cited by 1-based Concept number (Ownership=1, Move semantics=2, Borrowing=3).
test("returns the validated number-cited edges verbatim, in order", async () => {
  const { edges } = await adapterReturning({
    edges: [
      { prerequisiteNumber: 1, dependentNumber: 2, confidence: 0.9, rationale: "r1" },
      { prerequisiteNumber: 1, dependentNumber: 3, confidence: 0.8, rationale: "r2" }
    ]
  }).order({ declaredDomain: "software engineering", nodes: [ownership, moveSemantics, borrowing] });
  assert.equal(edges.length, 2);
  assert.equal(edges[0].prerequisiteNumber, 1);
  assert.equal(edges[0].dependentNumber, 2);
  assert.equal(edges[1].dependentNumber, 3);
});

// The ordering stage gets a tightened budget: first call + exactly one corrective re-prompt.
test("ordering request passes maxRetries: 1 for a single corrective re-prompt", async () => {
  const capture: { lastCall?: { maxRetries?: number } } = {};
  await adapterReturning({ edges: [] }, capture).order({ declaredDomain: "x", nodes: [ownership, moveSemantics] });
  assert.equal(capture.lastCall?.maxRetries, 1);
});

// Edge case: an empty edges array (the judge asserts no relations) is a valid empty ordering.
test("an empty edges array parses to an empty ordering", async () => {
  const { edges } = await adapterReturning({ edges: [] }).order({ declaredDomain: "x", nodes: [ownership, moveSemantics] });
  assert.deepEqual(edges, []);
});

// The request carries the forced tool name and the single ordering stage tag (R19).
test("ordering request carries the stage tag and forced tool name", async () => {
  const capture: { lastCall?: { toolName?: string; tags?: string[] } } = {};
  await adapterReturning({ edges: [] }, capture).order({ declaredDomain: "x", nodes: [ownership, moveSemantics] });
  assert.equal(capture.lastCall?.toolName, "submit_prerequisite_ordering");
  assert.deepEqual(capture.lastCall?.tags, ["prerequisite-ordering"]);
});

// Fail-closed (rule 6): the validator rejects an edge with confidence out of [0,1].
test("validator rejects confidence out of [0,1]", () => {
  assert.throws(() => buildPrerequisiteOrderingValidator(3).parse({
    edges: [{ prerequisiteNumber: 1, dependentNumber: 2, confidence: 1.5, rationale: "r" }]
  }));
});

// Fail-closed (rule 6): the validator rejects an edge missing a required field.
test("validator rejects an edge missing dependentNumber", () => {
  assert.throws(() => buildPrerequisiteOrderingValidator(3).parse({
    edges: [{ prerequisiteNumber: 1, confidence: 0.5, rationale: "r" }] // missing dependentNumber
  }));
});

// Defense-in-depth (rule 6): the validator bounds the index to [1, N] and rejects a
// self-edge, so a drifting index re-prompts before the application boundary even runs.
test("validator rejects an out-of-range or self-referential number", () => {
  assert.throws(() => buildPrerequisiteOrderingValidator(3).parse({
    edges: [{ prerequisiteNumber: 1, dependentNumber: 4, confidence: 0.5, rationale: "r" }] // 4 > N=3
  }));
  assert.throws(() => buildPrerequisiteOrderingValidator(3).parse({
    edges: [{ prerequisiteNumber: 2, dependentNumber: 2, confidence: 0.5, rationale: "r" }] // self-edge
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

// --- Minting durability judge ----------------------------------------------------

function mintingAdapterReturning(canned: { verdict: string; rationale: string }, capture?: { lastCall?: unknown }) {
  const client = {
    async call(input: unknown) {
      if (capture) capture.lastCall = input;
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmMintingDurabilityJudgmentAdapter(client);
}

const mintingInput = {
  declaredDomain: "software engineering",
  proposal: { proposedLabel: "Lifetime", rationale: "Needed to understand references." },
  anchor: { canonicalLabel: "Borrowing", definitionQuotes: ["Borrowing lets code access a value without taking ownership."] }
};

test("minting durability judge runs on the independent cross-family alias", () => {
  assert.equal(MINTING_DURABILITY_JUDGE_MODEL, "kg-independent-judge");
  assert.equal(mintingAdapterReturning({ verdict: "durable", rationale: "r" }).model, "kg-independent-judge");
});

test("minting durability judge passes through the validated verdict", async () => {
  const durable = await mintingAdapterReturning({ verdict: "durable", rationale: "foundation" }).judge(mintingInput);
  assert.deepEqual(durable, { verdict: "durable", rationale: "foundation" });

  const notDurable = await mintingAdapterReturning({ verdict: "not_durable", rationale: "tangential" }).judge(mintingInput);
  assert.deepEqual(notDurable, { verdict: "not_durable", rationale: "tangential" });
});

test("minting durability validator rejects missing or out-of-enum verdicts", () => {
  assert.throws(() => mintingDurabilityJudgmentValidator.parse({ rationale: "missing verdict" }));
  assert.throws(() => mintingDurabilityJudgmentValidator.parse({ verdict: "maybe", rationale: "bad enum" }));
});

test("minting durability request carries the stage tag and forced tool name", async () => {
  const capture: { lastCall?: { toolName?: string; tags?: string[] } } = {};
  await mintingAdapterReturning({ verdict: "durable", rationale: "r" }, capture).judge(mintingInput);
  assert.equal(capture.lastCall?.toolName, "submit_minting_durability_judgment");
  assert.deepEqual(capture.lastCall?.tags, ["minting-durability"]);
});
