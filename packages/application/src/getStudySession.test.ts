import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalibrationVerdict, ConceptLesson, LessonAbsentNode, ResponseLogRow, StudyItem } from "@lrnki/domain-core";
import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  RecallChallengeStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { getStudySession } from "./getStudySession";
import { composeStudySession } from "./studySessionProjection";

function node(id: string, label: string, difficulty: number): DerivedGraphDetail["nodes"][number] {
  return { derivedNodeId: id, label, aliases: [], declaredDomain: "rust", difficulty, difficultyRationale: null, nodeKind: "anchor", groundingOrigin: "document_anchored", role: "prerequisite", hasStudyItem: false, grounding: null };
}

function detail(): DerivedGraphDetail {
  return {
    summary: { enrichmentId: "e", graphVersionId: "g", enrichmentConfigHash: "cfg", judgeModel: "j", difficultyMethod: "m", status: "succeeded", edgeCount: 1, certainEdgeCount: 1, uncertainEdgeCount: 0, conceptCount: 2, studyItemCount: 1, startedAt: "t", completedAt: "t" },
    nodes: [node("scope", "Variable scope", 0.2), node("ownership", "Ownership", 0.5)],
    edges: [{ prerequisiteDerivedNodeId: "scope", dependentDerivedNodeId: "ownership", confidence: 0.9, uncertain: false, judgeModel: "j" }],
    originCounts: [], rescueDispositions: [], mintingDispositions: [], merges: []
  };
}

const optionItem: StudyItem = {
  studyItemId: "os-scope", graphVersionId: "g", enrichmentId: "e", derivedNodeId: "scope",
  groundingProvenance: "source_cep", generatingModel: "deepseek", configHash: "cfg", explorableTerms: [],
  itemType: "option_select", question: "Q", explanation: "One is correct because the grounding says so.", options: [
    { optionId: "o1", text: "One", isCorrect: true, provenance: "source" },
    { optionId: "o2", text: "Two", isCorrect: false, provenance: "generated" }
  ]
};

// --- Port fakes (no DB) -----------------------------------------------------

function enrichmentRead(detailById: Record<string, DerivedGraphDetail>): EnrichmentInspectionReadPort {
  return {
    async listEnrichmentSummaries() { throw new Error("not used"); },
    async getDerivedGraphDetail(id: string) { return detailById[id]; },
    async derivedNodeBelongsToEnrichment() { return true; }
  };
}

function studyItemStore(items: StudyItem[]): StudyItemBankStorePort {
  return {
    async persist() { throw new Error("not used"); },
    async getStudyItem() { throw new Error("not used"); },
    async getStudyItemById() { throw new Error("not used"); },
    async listStudyItemsForEnrichment() { return items; },
    async supportedItemTypes() { throw new Error("not used"); }
  };
}

function responseLog(rows: ResponseLogRow[]): ResponseLogStorePort {
  return {
    async append() { throw new Error("not used"); },
    async listForLearner() { return rows; },
    async listForLearnerNode() { throw new Error("not used"); }
  };
}

function verdictStore(verdicts: CalibrationVerdict[]): CalibrationVerdictStorePort {
  return {
    async upsert() { throw new Error("not used"); },
    async delete() { throw new Error("not used"); },
    async listForLearner() { return verdicts; },
    async clearLearner() { throw new Error("not used"); }
  };
}

function conceptLessonStore(lessons: ConceptLesson[], absent: LessonAbsentNode[] = []): ConceptLessonStorePort {
  return {
    async persist() { throw new Error("not used"); },
    async getLesson() { throw new Error("not used"); },
    async listLessonsForEnrichment() { return lessons; },
    async listAbsentForEnrichment() { return absent; }
  };
}

function lessonReadStore(reads: string[] = []) {
  return {
    async markRead() { throw new Error("not used"); },
    async listForLearner() {
      return reads.map((derivedNodeId) => ({ learnerStateRef: "L1", derivedNodeId, firstReadAt: "2026-01-01T00:00:00.000Z" }));
    }
  };
}

const scopeLesson: ConceptLesson = {
  conceptLessonId: "lesson-scope",
  derivedNodeId: "scope", graphVersionId: "g", enrichmentId: "e", generatingModel: "deepseek", configHash: "cfg",
  canonicalLabel: "Variable scope",
  sections: [
    { kind: "gist", text: "A name is valid within a region.", groundingProvenance: "generated" },
    { kind: "definition", text: "Scope is the region where a binding is valid.", groundingProvenance: "source_cep", citation: { provenance: "source", sourceResourceId: "r", sourceBlockId: "b", evidenceQuote: "Scope is the region where a binding is valid.", matchKind: "exact" } },
    { kind: "applications", text: "Ownership builds on scope.", groundingProvenance: "generated" }
  ],
  explorableTerms: []
};

function callGetStudySession(args: { enrichmentId?: string; items?: StudyItem[]; rows?: ResponseLogRow[]; verdicts?: CalibrationVerdict[]; lessons?: ConceptLesson[]; absent?: LessonAbsentNode[] }) {
  return getStudySession({
    enrichmentId: args.enrichmentId ?? "e",
    learnerStateRef: "L1",
    enrichmentRead: enrichmentRead({ e: detail() }),
    studyItemStore: studyItemStore(args.items ?? [optionItem]),
    conceptLessonStore: conceptLessonStore(args.lessons ?? [], args.absent ?? []),
    lessonReadStore: lessonReadStore(),
    responseLog: responseLog(args.rows ?? []),
    verdictStore: verdictStore(args.verdicts ?? [])
  });
}

test("getStudySession returns undefined for an unknown enrichment", async () => {
  assert.equal(await callGetStudySession({ enrichmentId: "missing" }), undefined);
});

test("getStudySession returns exactly what composeStudySession produces for the loaded data", async () => {
  const rows: ResponseLogRow[] = [];
  const verdicts: CalibrationVerdict[] = [];
  const fromUseCase = await callGetStudySession({ items: [optionItem], rows, verdicts });
  const fromPure = composeStudySession({ enrichmentId: "e", learnerStateRef: "L1", detail: detail(), studyItems: [optionItem], rows, verdicts });
  assert.deepEqual(fromUseCase, fromPure);
});

test("a learner with zero rows/verdicts yields the knows-nothing session; the only frontier in the cone is the foundational prerequisite", async () => {
  const session = await callGetStudySession({});
  assert.ok(session);
  assert.equal(session.classification.selectedFrontierTarget, "scope");
  assert.equal(session.adaptedHiddenNodeIds.length, 0);
});

test("Covers R12: a node's Concept Lesson rides down into lessonByNode with its honest provenance badges", async () => {
  const session = await callGetStudySession({ lessons: [scopeLesson] });
  assert.ok(session);
  const lesson = session.lessonByNode["scope"];
  assert.ok(lesson, "the lesson rides down keyed by node");
  assert.equal(lesson.sections.length, 3);
  // The source-cited definition is badged source; the synthesized gist is generated.
  assert.equal(lesson.sections.find((s) => s.kind === "definition")?.isSourceCited, true);
  assert.equal(lesson.sections.find((s) => s.kind === "gist")?.isSourceCited, false);
});

test("a lesson-absent node surfaces in the operator visibility list with its reason", async () => {
  const session = await callGetStudySession({ absent: [{ derivedNodeId: "scope", canonicalLabel: "Variable scope", reason: "no usable grounding passages" }] });
  assert.ok(session);
  assert.equal(session.lessonAbsent.length, 1);
  assert.equal(session.lessonAbsent[0].label, "Variable scope");
  assert.match(session.lessonAbsent[0].reason, /no usable grounding/);
});

test("a calibrated learner who marked the prerequisite known yields the pruned/hidden session", async () => {
  const session = await callGetStudySession({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }] });
  assert.ok(session);
  // scope is mastered via calibration, so ownership (the goal) is now the frontier and scope is hidden.
  assert.equal(session.classification.selectedFrontierTarget, "ownership");
  assert.deepEqual(session.adaptedHiddenNodeIds, ["scope"]);
});

// --- Recall Challenge scope wiring (plan 2026-07-13-003 U4) --------------------

test("getStudySession composes server-owned recall scopes from the challenge store and the rows it already loaded", async () => {
  const challengeStore: RecallChallengeStorePort = {
    async create() { throw new Error("not used"); },
    async getForLearner() { throw new Error("not used"); },
    async getActiveForScope() { throw new Error("not used"); },
    async listForLearnerEnrichment() {
      return [{ challengeId: "ch-live", learnerStateRef: "L1", enrichmentId: "e", scopeKind: "section", scopeAnchorDerivedNodeId: "ownership", status: "active", createdAt: "t", updatedAt: "t" }];
    },
    async appendEvent() { throw new Error("not used"); },
    async priorExposure() { return { "os-scope": 3 }; },
    async listWonScopes() { return []; },
    async hydrateLineupItems() { throw new Error("not used"); }
  };
  const correctRow: ResponseLogRow = {
    responseId: "r1", learnerStateRef: "L1", scope: "neutral", studyItemId: "os-scope", derivedNodeId: "scope",
    signalType: "graded", judgedOutcome: "correct", gradedScore: 1, responseSource: "human", graderIdentity: "auto",
    batchId: null, attemptSeq: 1, submittedAnswer: "x"
  };
  const session = await getStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    enrichmentRead: enrichmentRead({ e: detail() }),
    studyItemStore: studyItemStore([optionItem]),
    conceptLessonStore: conceptLessonStore([]),
    responseLog: responseLog([correctRow]),
    verdictStore: verdictStore([]),
    challengeStore
  });
  assert.ok(session);
  // The two-node layer is one section anchored on `ownership`: the passed item on `scope`
  // makes one eligible item; the active challenge rides through; the summit scope is the
  // milestone itself only when a summit exists past the sections — here the single milestone
  // doubles as summit, so we assert the section scope's facts.
  const sectionScope = session.recallScopes.find((scope) => scope.scopeKind === "section");
  assert.ok(sectionScope);
  assert.equal(sectionScope.anchorDerivedNodeId, "ownership");
  assert.equal(sectionScope.state, "active");
  assert.equal(sectionScope.activeChallengeId, "ch-live");
  assert.equal(sectionScope.eligibleItemCount, 1);
});

test("getStudySession without a challenge store composes empty recall scopes", async () => {
  const session = await callGetStudySession({});
  assert.ok(session);
  assert.deepEqual(session.recallScopes, []);
});
