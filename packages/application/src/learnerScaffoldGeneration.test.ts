import assert from "node:assert/strict";
import test from "node:test";
import type { ScaffoldDetour, ScaffoldStep } from "@lrnki/domain-core";
import type { ScaffoldContentDraft } from "@lrnki/ports";
import { buildScaffoldNodePayload, resolveExactMatch, runScaffoldGeneration, type ScaffoldGenerationDeps, type ScaffoldParentContext, type ScaffoldReuseCandidate } from "./learnerScaffoldGeneration";

function candidate(overrides: Partial<ScaffoldReuseCandidate> & { derivedNodeId: string; canonicalLabel: string }): ScaffoldReuseCandidate {
  return { aliases: [], declaredDomain: "cs", hasLesson: true, hasOptionSelect: true, isLocked: false, ...overrides };
}

// --- resolveExactMatch (KTD3, R8/R10) ---------------------------------------

test("resolveExactMatch: a unique usable non-parent match becomes a reference", () => {
  const result = resolveExactMatch("Borrow checker", [candidate({ derivedNodeId: "n-1", canonicalLabel: "Borrow Checker" })], "parent");
  assert.deepEqual(result, { kind: "reference", derivedNodeId: "n-1" });
});

test("resolveExactMatch: an alias match resolves too", () => {
  const result = resolveExactMatch("BC", [candidate({ derivedNodeId: "n-1", canonicalLabel: "Borrow Checker", aliases: ["BC"] })], "parent");
  assert.deepEqual(result, { kind: "reference", derivedNodeId: "n-1" });
});

test("resolveExactMatch: the parent, a locked node, a payload-incomplete node, and ambiguity are all unusable (AE4)", () => {
  assert.equal(resolveExactMatch("Parent", [candidate({ derivedNodeId: "parent", canonicalLabel: "Parent" })], "parent").kind, "unusable");
  assert.equal(resolveExactMatch("Locked", [candidate({ derivedNodeId: "n", canonicalLabel: "Locked", isLocked: true })], "parent").kind, "unusable");
  assert.equal(resolveExactMatch("NoItem", [candidate({ derivedNodeId: "n", canonicalLabel: "NoItem", hasOptionSelect: false })], "parent").kind, "unusable");
  assert.equal(resolveExactMatch("Dup", [candidate({ derivedNodeId: "a", canonicalLabel: "Dup" }), candidate({ derivedNodeId: "b", canonicalLabel: "Dup" })], "parent").kind, "unusable");
});

test("resolveExactMatch: no match is none", () => {
  assert.equal(resolveExactMatch("Absent", [candidate({ derivedNodeId: "n", canonicalLabel: "Present" })], "parent").kind, "none");
});

// --- buildScaffoldNodePayload (KTD10) ---------------------------------------

let idSeq = 0;
const ids = () => `id-${++idSeq}`;

function contentDraft(overrides: Partial<ScaffoldContentDraft> = {}): ScaffoldContentDraft {
  return { microLesson: "A short lesson with an example.", question: "Q?", explanation: "because", correctAnswer: "Right", distractors: ["Wrong A", "Wrong B", "Wrong C"], ...overrides };
}

test("buildScaffoldNodePayload: four distinct options with the first keyed correct", () => {
  idSeq = 0;
  const payload = buildScaffoldNodePayload("Affine types", contentDraft(), ids);
  assert.ok(payload);
  assert.equal(payload!.item.options.length, 4);
  assert.equal(payload!.item.options.filter((o) => o.isCorrect).length, 1);
  assert.equal(payload!.item.options[0].isCorrect, true);
  assert.equal(payload!.lesson[0].groundingProvenance, "generated");
});

test("buildScaffoldNodePayload: rejects duplicate options and empty text", () => {
  assert.equal(buildScaffoldNodePayload("x", contentDraft({ distractors: ["Right", "Wrong B", "Wrong C"] }), ids), null);
  assert.equal(buildScaffoldNodePayload("x", contentDraft({ microLesson: "  " }), ids), null);
});

// --- runScaffoldGeneration orchestration ------------------------------------

function fakeDetour(term: string): ScaffoldDetour {
  return { detourId: "d-1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "parent", term, normalizedTerm: term.toLowerCase(), status: "generating", latestOperationId: "op-1", claimToken: "tok", steps: [] };
}

function makeDeps(context: ScaffoldParentContext, overrides: Partial<ScaffoldGenerationDeps> & { detourTerm?: string } = {}): { deps: ScaffoldGenerationDeps; published: ScaffoldStep[][]; failed: number; outlineCalls: number; contentCalls: number } {
  const published: ScaffoldStep[][] = [];
  let failed = 0;
  let outlineCalls = 0;
  let contentCalls = 0;
  const deps: ScaffoldGenerationDeps = {
    scaffoldStore: {
      getById: async () => fakeDetour(overrides.detourTerm ?? "Borrow checker"),
      publishReady: async ({ steps }) => { published.push(steps); return true; },
      markFailed: async () => { failed += 1; return true; },
      upsertPending: async () => { throw new Error("unused"); },
      listActiveForLearnerEnrichment: async () => [],
      claim: async () => true,
      claimNextGenerating: async () => undefined,
      failExhaustedGenerating: async () => 0,
      restartGenerating: async () => undefined,
      hide: async () => true,
      getStep: async () => undefined,
      markLessonRead: async () => {},
      listGeneratedStepsForAudit: async () => []
    },
    loadParentContext: async () => context,
    outline: { model: "m", propose: async () => { outlineCalls += 1; return { steps: [{ label: "Affine types", rationale: "needed" }] }; } },
    content: { model: "m", generate: async () => { contentCalls += 1; return contentDraft(); } },
    groundConcept: async () => ({ kind: "grounded", groundingText: "grounding" }),
    newId: (() => { let n = 0; return () => `x-${++n}`; })(),
    ...overrides
  };
  return { deps, published, get failed() { return failed; }, get outlineCalls() { return outlineCalls; }, get contentCalls() { return contentCalls; } };
}

const emptyContext: ScaffoldParentContext = { declaredDomain: "cs", parentLabel: "Ownership", parentDerivedNodeId: "parent", reuseCandidates: [], parentGroundingText: "parent grounding" };

test("Covers AE3: a unique usable selected-term match publishes one reference and makes NO LLM call", async () => {
  const context: ScaffoldParentContext = { ...emptyContext, reuseCandidates: [candidate({ derivedNodeId: "ref-1", canonicalLabel: "Borrow checker" })] };
  const h = makeDeps(context, { detourTerm: "Borrow checker" });
  const outcome = await runScaffoldGeneration({ detourId: "d-1", claimToken: "tok" }, h.deps);
  assert.deepEqual(outcome, { kind: "published", stepCount: 1 });
  assert.equal(h.outlineCalls, 0, "no outline call");
  assert.equal(h.contentCalls, 0, "no content call");
  assert.equal(h.published[0][0].kind, "reference");
});

test("an outline concept generates a scaffold node and publishes it", async () => {
  const h = makeDeps(emptyContext);
  const outcome = await runScaffoldGeneration({ detourId: "d-1", claimToken: "tok" }, h.deps);
  assert.deepEqual(outcome, { kind: "published", stepCount: 1 });
  assert.equal(h.published[0][0].kind, "generated");
});

test("a boundary concept is dropped and, with nothing left, the detour fails (R22)", async () => {
  const h = makeDeps(emptyContext, { groundConcept: async () => ({ kind: "boundary" }) });
  const outcome = await runScaffoldGeneration({ detourId: "d-1", claimToken: "tok" }, h.deps);
  assert.equal(outcome.kind, "failed");
  assert.equal(h.published.length, 0, "no partial publish");
  assert.equal(h.failed, 1);
});

test("a mixed outline publishes a reference and a generated node together", async () => {
  const context: ScaffoldParentContext = { ...emptyContext, reuseCandidates: [candidate({ derivedNodeId: "ref-1", canonicalLabel: "Move semantics" })] };
  const h = makeDeps(context, {
    outline: { model: "m", propose: async () => ({ steps: [{ label: "Move semantics", rationale: "reuse" }, { label: "Affine types", rationale: "generate" }] }) }
  });
  const outcome = await runScaffoldGeneration({ detourId: "d-1", claimToken: "tok" }, h.deps);
  assert.equal(outcome.kind, "published");
  assert.deepEqual(h.published[0].map((s) => s.kind), ["reference", "generated"]);
});

test("a lost fence on publish reports failure without claiming success", async () => {
  const h = makeDeps(emptyContext);
  h.deps.scaffoldStore.publishReady = async () => false;
  const outcome = await runScaffoldGeneration({ detourId: "d-1", claimToken: "stale" }, h.deps);
  assert.equal(outcome.kind, "failed");
});
