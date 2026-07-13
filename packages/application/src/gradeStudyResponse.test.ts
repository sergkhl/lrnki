import assert from "node:assert/strict";
import test from "node:test";
import type { ImpostorItem, MatchingItem, NewResponseLogRow, OptionSelectItem, ResponseLogRow, StudyItem, Verdict } from "@lrnki/domain-core";
import type { CalibrationVerdictStorePort, EnrichmentInspectionReadPort, LearnerExpedition, LearnerExpeditionStorePort, LessonRead, LessonReadStorePort, ResponseLogStorePort, StudyItemBankStorePort } from "@lrnki/ports";
import type { ScaffoldDetourStorePort } from "@lrnki/ports";
import type { ScaffoldStep } from "@lrnki/domain-core";
import { checkMatchingAttempt, gradeScaffoldOptionSelect, gradeStudyResponse, recordLearnerVerdict, recordLessonRead, recordScaffoldLessonRead } from "./gradeStudyResponse";

const EN = "en-1";
const LEARNER = "L1";

function expedition(overrides: Partial<LearnerExpedition> = {}): LearnerExpedition {
  return {
    learnerExpeditionId: "exp-1",
    learnerStateRef: LEARNER,
    kind: "topic",
    title: "Topic",
    declaredDomain: null,
    status: "ready",
    currentOperationId: null,
    currentOperationType: null,
    enrichmentId: EN,
    active: true,
    failureMessage: null,
    generationAttempts: 0,
    claimedAt: null,
    createdAt: "2026-07-07T00:00:00Z",
    updatedAt: "2026-07-07T00:00:00Z",
    ...overrides
  };
}

function fakeExpeditionStore(exp: LearnerExpedition | undefined): LearnerExpeditionStorePort {
  const notUsed = () => { throw new Error("not used"); };
  return {
    async getByEnrichment() { return exp; },
    upsert: notUsed, listForLearner: notUsed as never, getForLearner: notUsed as never,
    setActive: notUsed, claimNextGenerating: notUsed as never, failExhaustedGenerating: notUsed as never,
    resetGeneration: notUsed, updateProgress: notUsed as never
  };
}

function fakeStudyItemStore(items: Record<string, StudyItem>): StudyItemBankStorePort {
  const notUsed = () => { throw new Error("not used"); };
  return {
    async getStudyItemById(id: string) { return items[id]; },
    persist: notUsed as never, getStudyItem: notUsed as never,
    listStudyItemsForEnrichment: notUsed as never, supportedItemTypes: notUsed as never
  };
}

function fakeResponseLog(): { store: ResponseLogStorePort; rows: NewResponseLogRow[] } {
  const rows: NewResponseLogRow[] = [];
  const hydrate = (r: NewResponseLogRow, i: number): ResponseLogRow => ({ ...r, attemptSeq: i + 1, createdAt: new Date().toISOString() });
  return {
    rows,
    store: {
      async append(appended) { rows.push(...appended); },
      async listForLearner(ref) { return rows.filter((r) => r.learnerStateRef === ref).map(hydrate); },
      async listForLearnerNode(ref, nodeId) { return rows.filter((r) => r.learnerStateRef === ref && r.scope === "neutral" && r.derivedNodeId === nodeId).map(hydrate); }
    }
  };
}

function fakeVerdictStore(): { store: CalibrationVerdictStorePort; upserts: { derivedNodeId: string; verdict: Verdict }[] } {
  const upserts: { derivedNodeId: string; verdict: Verdict }[] = [];
  const notUsed = () => { throw new Error("not used"); };
  return {
    upserts,
    store: {
      async upsert(v) { upserts.push({ derivedNodeId: v.derivedNodeId, verdict: v.verdict }); },
      delete: notUsed, listForLearner: notUsed as never, clearLearner: notUsed
    }
  };
}

function fakeLessonReadStore(): { store: LessonReadStorePort; reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    store: {
      async markRead(input) { reads.push(input.derivedNodeId); },
      async listForLearner() { return [] as LessonRead[]; }
    }
  };
}

function fakeEnrichmentRead(belongs: boolean): EnrichmentInspectionReadPort {
  const notUsed = () => { throw new Error("not used"); };
  return {
    listEnrichmentSummaries: notUsed as never,
    getDerivedGraphDetail: notUsed as never,
    async derivedNodeBelongsToEnrichment() { return belongs; }
  };
}

const optionItem: OptionSelectItem = {
  itemType: "option_select", studyItemId: "os-1", graphVersionId: null, enrichmentId: EN, derivedNodeId: "node-1",
  explorableTerms: [],
  groundingProvenance: "source_cep", generatingModel: "m", configHash: "c", question: "?", explanation: "e",
  options: [
    { optionId: "o-correct", text: "right", isCorrect: true, provenance: "source" },
    { optionId: "o-wrong", text: "wrong", isCorrect: false, provenance: "generated" }
  ]
};

const impostorItem: ImpostorItem = {
  itemType: "impostor", studyItemId: "imp-1", graphVersionId: null, enrichmentId: EN, derivedNodeId: "node-1",
  explorableTerms: [],
  groundingProvenance: "source_cep", generatingModel: "m", configHash: "c", question: "?",
  statements: [
    { statementId: "s-truth", ordinal: 0, text: "true", isImpostor: false, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "node-1", passageText: "p" } },
    { statementId: "s-lie", ordinal: 1, text: "lie", isImpostor: true, provenance: "generated", reveal: "r", lieSource: "generated" }
  ]
};

const matchingItem: MatchingItem = {
  itemType: "matching", studyItemId: "mt-1", graphVersionId: null, enrichmentId: EN, derivedNodeId: "node-1",
  explorableTerms: [],
  groundingProvenance: "source_cep", generatingModel: "m", configHash: "c", question: "?",
  pairs: [
    { pairId: "p-1", matchId: "m-1", promptText: "a", matchText: "A", citation: { provenance: "generated", derivedNodeId: "node-1", passageText: "p" } },
    { pairId: "p-2", matchId: "m-2", promptText: "b", matchText: "B", citation: { provenance: "generated", derivedNodeId: "node-1", passageText: "p" } }
  ]
};

test("refuses grading when no active/ready expedition exists (no response row written)", async () => {
  const log = fakeResponseLog();
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-correct" } },
    { expeditionStore: fakeExpeditionStore(expedition({ active: false })), studyItemStore: fakeStudyItemStore({ "os-1": optionItem }), responseLog: log.store }
  );
  assert.deepEqual(result, { graded: false, refused: "expedition_inactive" });
  assert.equal(log.rows.length, 0);
});

test("refuses grading when the expedition is missing entirely", async () => {
  const log = fakeResponseLog();
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-correct" } },
    { expeditionStore: fakeExpeditionStore(undefined), studyItemStore: fakeStudyItemStore({ "os-1": optionItem }), responseLog: log.store }
  );
  assert.deepEqual(result, { graded: false, refused: "expedition_inactive" });
});

test("refuses an item that belongs to a different enrichment", async () => {
  const foreign: OptionSelectItem = { ...optionItem, enrichmentId: "en-other" };
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-correct" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "os-1": foreign }), responseLog: fakeResponseLog().store }
  );
  assert.deepEqual(result, { graded: false, refused: "item_not_found" });
});

test("refuses a superseded / absent item (getStudyItemById returns nothing)", async () => {
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-correct" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({}), responseLog: fakeResponseLog().store }
  );
  assert.deepEqual(result, { graded: false, refused: "item_not_found" });
});

test("refuses an item-type mismatch between submission and stored item", async () => {
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "impostor", chosenStatementId: "s-lie" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "os-1": optionItem }), responseLog: fakeResponseLog().store }
  );
  assert.deepEqual(result, { graded: false, refused: "item_type_mismatch" });
});

test("grades a correct option-select, keying the correct option server-side and appending one row", async () => {
  const log = fakeResponseLog();
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-correct" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "os-1": optionItem }), responseLog: log.store }
  );
  assert.deepEqual(result, { graded: true, outcome: { kind: "selection", chosenId: "o-correct", keyedCorrectId: "o-correct", correct: true } });
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].gradedScore, 1);
});

test("grades an incorrect option-select without trusting a client-sent key", async () => {
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "os-1", submission: { itemType: "option_select", chosenOptionId: "o-wrong" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "os-1": optionItem }), responseLog: fakeResponseLog().store }
  );
  assert.deepEqual(result, { graded: true, outcome: { kind: "selection", chosenId: "o-wrong", keyedCorrectId: "o-correct", correct: false } });
});

test("grades impostor selection, keying the planted lie", async () => {
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "imp-1", submission: { itemType: "impostor", chosenStatementId: "s-lie" } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "imp-1": impostorItem }), responseLog: fakeResponseLog().store }
  );
  assert.deepEqual(result, { graded: true, outcome: { kind: "selection", chosenId: "s-lie", keyedCorrectId: "s-lie", correct: true } });
});

test("grades matching first-try partial scoring", async () => {
  const result = await gradeStudyResponse(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "mt-1", submission: { itemType: "matching", trace: [{ promptId: "p-1", chosenMatchId: "m-1" }, { promptId: "p-2", chosenMatchId: "m-1" }] } },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "mt-1": matchingItem }), responseLog: fakeResponseLog().store }
  );
  assert.equal(result.graded, true);
  assert.deepEqual(result.graded && result.outcome, { kind: "matching", correct: false, correctFirstTry: 1, pairCount: 2 });
});

test("checkMatchingAttempt answers a single pair purely and refuses on inactive expedition", async () => {
  const ok = await checkMatchingAttempt(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "mt-1", promptId: "p-1", matchId: "m-1" },
    { expeditionStore: fakeExpeditionStore(expedition()), studyItemStore: fakeStudyItemStore({ "mt-1": matchingItem }) }
  );
  assert.deepEqual(ok, { checked: true, correct: true });
  const refused = await checkMatchingAttempt(
    { learnerStateRef: LEARNER, enrichmentId: EN, studyItemId: "mt-1", promptId: "p-1", matchId: "m-1" },
    { expeditionStore: fakeExpeditionStore(undefined), studyItemStore: fakeStudyItemStore({ "mt-1": matchingItem }) }
  );
  assert.deepEqual(refused, { checked: false, refused: "expedition_inactive" });
});

test("refuses a verdict write for a node outside the guarded enrichment", async () => {
  const verdict = fakeVerdictStore();
  const result = await recordLearnerVerdict(
    { learnerStateRef: LEARNER, enrichmentId: EN, derivedNodeId: "node-foreign", verdict: "known" },
    { expeditionStore: fakeExpeditionStore(expedition()), enrichmentRead: fakeEnrichmentRead(false), verdictStore: verdict.store }
  );
  assert.deepEqual(result, { recorded: false, refused: "node_not_in_enrichment" });
  assert.equal(verdict.upserts.length, 0);
});

test("records a verdict when the node belongs and the expedition is active (set and clear both upsert)", async () => {
  const verdict = fakeVerdictStore();
  const set = await recordLearnerVerdict(
    { learnerStateRef: LEARNER, enrichmentId: EN, derivedNodeId: "node-1", verdict: "known" },
    { expeditionStore: fakeExpeditionStore(expedition()), enrichmentRead: fakeEnrichmentRead(true), verdictStore: verdict.store }
  );
  assert.deepEqual(set, { recorded: true });
  await recordLearnerVerdict(
    { learnerStateRef: LEARNER, enrichmentId: EN, derivedNodeId: "node-1", verdict: "learn" },
    { expeditionStore: fakeExpeditionStore(expedition()), enrichmentRead: fakeEnrichmentRead(true), verdictStore: verdict.store }
  );
  assert.deepEqual(verdict.upserts, [{ derivedNodeId: "node-1", verdict: "known" }, { derivedNodeId: "node-1", verdict: "learn" }]);
});

test("refuses a foreign-node lesson read and records a belonging one", async () => {
  const foreign = fakeLessonReadStore();
  const refused = await recordLessonRead(
    { learnerStateRef: LEARNER, enrichmentId: EN, derivedNodeId: "node-foreign" },
    { expeditionStore: fakeExpeditionStore(expedition()), enrichmentRead: fakeEnrichmentRead(false), lessonReadStore: foreign.store }
  );
  assert.deepEqual(refused, { recorded: false, refused: "node_not_in_enrichment" });
  assert.equal(foreign.reads.length, 0);

  const ok = fakeLessonReadStore();
  const recorded = await recordLessonRead(
    { learnerStateRef: LEARNER, enrichmentId: EN, derivedNodeId: "node-1" },
    { expeditionStore: fakeExpeditionStore(expedition()), enrichmentRead: fakeEnrichmentRead(true), lessonReadStore: ok.store }
  );
  assert.deepEqual(recorded, { recorded: true });
  assert.deepEqual(ok.reads, ["node-1"]);
});

test("the use-case imports no graph or enrichment write port", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./gradeStudyResponse.ts", import.meta.url), "utf8");
  assert.equal(/GraphVersionStorePort|EnrichmentRunStorePort/.test(source), false);
});

// --- Scaffold-scoped grading (plan 2026-07-12-002 U5, KTD4) --------------------------------
function generatedStep(): ScaffoldStep {
  return {
    scaffoldStepId: "step-1", ordinal: 0, kind: "generated", lessonReadAt: null,
    payload: {
      scaffoldNodeId: "sn-1", label: "Affine types",
      lesson: [{ kind: "definition", text: "def", groundingProvenance: "generated" }],
      item: {
        scaffoldItemId: "si-1", question: "Q?", explanation: "E",
        options: [
          { optionId: "so-1", text: "right", isCorrect: true },
          { optionId: "so-2", text: "wrong", isCorrect: false }
        ]
      }
    }
  };
}

function fakeScaffoldStore(step: ScaffoldStep | undefined): { store: ScaffoldDetourStorePort; reads: string[] } {
  const reads: string[] = [];
  const store = {
    getStep: async (i: { scaffoldStepId: string; learnerStateRef: string }) => (step && i.learnerStateRef === "owner" ? { step, detourId: "d1" } : undefined),
    markLessonRead: async (i: { scaffoldStepId: string }) => { reads.push(i.scaffoldStepId); }
  } as unknown as ScaffoldDetourStorePort;
  return { store, reads };
}

test("gradeScaffoldOptionSelect grades against the step's embedded key and appends a scaffold-scoped row", async () => {
  const log = fakeResponseLog();
  const { store } = fakeScaffoldStore(generatedStep());
  const result = await gradeScaffoldOptionSelect({ learnerStateRef: "owner", scaffoldStepId: "step-1", chosenOptionId: "so-1" }, { scaffoldStore: store, responseLog: log.store });
  assert.deepEqual(result, { graded: true, chosenId: "so-1", keyedCorrectId: "so-1", correct: true });
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].scope, "scaffold");
  assert.equal(log.rows[0].scope === "scaffold" && log.rows[0].scaffoldStepId, "step-1");
});

test("gradeScaffoldOptionSelect refuses a reference step and another learner's step (no row)", async () => {
  const log = fakeResponseLog();
  const referenceStep: ScaffoldStep = { scaffoldStepId: "ref-1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n1" };
  const notGradable = await gradeScaffoldOptionSelect({ learnerStateRef: "owner", scaffoldStepId: "ref-1", chosenOptionId: "x" }, { scaffoldStore: fakeScaffoldStore(referenceStep).store, responseLog: log.store });
  assert.deepEqual(notGradable, { graded: false, refused: "step_not_gradable" });
  const notOwned = await gradeScaffoldOptionSelect({ learnerStateRef: "intruder", scaffoldStepId: "step-1", chosenOptionId: "so-1" }, { scaffoldStore: fakeScaffoldStore(generatedStep()).store, responseLog: log.store });
  assert.deepEqual(notOwned, { graded: false, refused: "step_not_found" });
  assert.equal(log.rows.length, 0);
});

test("recordScaffoldLessonRead marks only a learner-owned generated step", async () => {
  const owned = fakeScaffoldStore(generatedStep());
  assert.deepEqual(await recordScaffoldLessonRead({ learnerStateRef: "owner", scaffoldStepId: "step-1" }, { scaffoldStore: owned.store }), { recorded: true });
  assert.deepEqual(owned.reads, ["step-1"]);
  const missing = fakeScaffoldStore(undefined);
  assert.deepEqual(await recordScaffoldLessonRead({ learnerStateRef: "owner", scaffoldStepId: "nope" }, { scaffoldStore: missing.store }), { recorded: false, refused: "step_not_found" });
});
