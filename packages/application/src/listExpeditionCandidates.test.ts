import assert from "node:assert/strict";
import test from "node:test";
import type { ResponseLogRow, StudyItem } from "@lrnki/domain-core";
import type { DerivedGraphDetail, EnrichmentInspectionReadPort, EnrichmentSummary, LearnerExpedition, LearnerExpeditionStorePort, LessonReadStorePort, ResponseLogStorePort, StudyItemBankStorePort } from "@lrnki/ports";
import { listExpeditionCandidates } from "./listExpeditionCandidates";

test("listExpeditionCandidates ranks fully ready targets above larger unready targets and caps the result", async () => {
  const read = fakeRead([
    summary("unready", "2026-01-02T00:00:00.000Z"),
    summary("ready", "2026-01-01T00:00:00.000Z")
  ], {
    unready: detail("unready", [
      node("u-a", "Unready prerequisite", true),
      node("u-b", "Unready target", false)
    ], [{ prerequisiteDerivedNodeId: "u-a", dependentDerivedNodeId: "u-b", confidence: 0.9, uncertain: false, judgeModel: "test" }]),
    ready: detail("ready", [
      node("r-a", "Ready prerequisite", true),
      node("r-b", "Ready target", true)
    ], [{ prerequisiteDerivedNodeId: "r-a", dependentDerivedNodeId: "r-b", confidence: 0.9, uncertain: false, judgeModel: "test" }])
  });

  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: read,
    expeditionStore: fakeStore([]),
    limit: 1
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].enrichmentId, "ready");
  assert.equal(result.candidates[0].readinessRank, 1);
});

test("returns the full ranked catalog without an explicit limit and excludes one-stop trails", async () => {
  const read = fakeRead([
    summary("later", "2026-01-02T00:00:00.000Z"),
    summary("earlier", "2026-01-01T00:00:00.000Z"),
    summary("oldest", "2025-12-31T00:00:00.000Z"),
    summary("ancient", "2025-12-30T00:00:00.000Z"),
    summary("summit-only", "2026-01-03T00:00:00.000Z")
  ], {
    later: detail("later", [node("later-start", "Photosynthetic start", true), node("later-summit", "Later summit", true)], [edge("later-start", "later-summit")]),
    earlier: detail("earlier", [node("earlier-start", "Earlier start", true), node("earlier-summit", "Earlier summit", true)], [edge("earlier-start", "earlier-summit")]),
    oldest: detail("oldest", [node("oldest-start", "Oldest start", true), node("oldest-summit", "Oldest summit", true)], [edge("oldest-start", "oldest-summit")]),
    ancient: detail("ancient", [node("ancient-start", "Ancient start", true), node("ancient-summit", "Ancient summit", true)], [edge("ancient-start", "ancient-summit")]),
    "summit-only": detail("summit-only", [node("only", "Only summit", true)], [])
  });

  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: read,
    expeditionStore: fakeStore([])
  });

  assert.deepEqual(result.candidates.map((candidate) => [candidate.enrichmentId, candidate.readinessRank]), [
    ["later", 1],
    ["earlier", 2],
    ["oldest", 3],
    ["ancient", 4]
  ]);
  assert.deepEqual(result.candidates[0].searchTerms, ["Photosynthetic start", "Later summit"]);
});

test("Covers AE3: progress counts only items on trail-reachable (non-floored) nodes", async () => {
  // Layer: easy(band-1 confident, floored) -> mid -> summit. `easy` carries an item that must
  // NOT count toward the trail total; mid and summit items do.
  const floorNode = (id: string, label: string, band: number | null): DerivedGraphDetail["nodes"][number] => ({
    ...node(id, label, true),
    difficulty: band,
    difficultyBand: band,
    difficultyContested: band === null ? null : false
  });
  const layer = detail("exp", [
    floorNode("easy", "Trivial", 1),
    floorNode("mid", "Middle", 3),
    floorNode("summit", "Summit", 4)
  ], [
    { prerequisiteDerivedNodeId: "easy", dependentDerivedNodeId: "mid", confidence: 0.9, uncertain: false, judgeModel: "test" },
    { prerequisiteDerivedNodeId: "mid", dependentDerivedNodeId: "summit", confidence: 0.9, uncertain: false, judgeModel: "test" }
  ]);
  const items: StudyItem[] = [studyItem("i-easy", "easy"), studyItem("i-mid", "mid"), studyItem("i-summit", "summit")];
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };

  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([summary("exp", "2026-01-01T00:00:00.000Z")], { exp: layer }),
    expeditionStore: fakeStore([ready]),
    studyItemStore: fakeStudyItemStore(items),
    responseLog: fakeResponseLog([gradedCorrect("i-mid")])
  });

  const progress = result.learnerExpeditions[0].progress;
  // 3 items exist, but `easy` is floored → only mid + summit count. One is latest-correct.
  assert.deepEqual(progress, { itemsPassed: 1, itemsAttempted: 1, lessonsRead: 0, itemsTotal: 2 });
});

test("progress captures wrong-answer-only activity for Resume", async () => {
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([summary("exp", "2026-01-01T00:00:00.000Z")], { exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")] ) }),
    expeditionStore: fakeStore([ready]),
    studyItemStore: fakeStudyItemStore([studyItem("i-mid", "mid")]),
    responseLog: fakeResponseLog([gradedIncorrect("i-mid")])
  });

  assert.deepEqual(result.learnerExpeditions[0].progress, { itemsPassed: 0, itemsAttempted: 1, lessonsRead: 0, itemsTotal: 1 });
});

test("progress captures lesson-read-only activity for Resume", async () => {
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([summary("exp", "2026-01-01T00:00:00.000Z")], { exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")] ) }),
    expeditionStore: fakeStore([ready]),
    studyItemStore: fakeStudyItemStore([studyItem("i-mid", "mid")]),
    responseLog: fakeResponseLog([]),
    lessonReadStore: fakeLessonReadStore(["mid"])
  });

  assert.deepEqual(result.learnerExpeditions[0].progress, { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 1, itemsTotal: 1 });
});

test("candidates expose an existing learner expedition for Resume routing", async () => {
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([summary("exp", "2026-01-01T00:00:00.000Z")], { exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")] ) }),
    expeditionStore: fakeStore([ready])
  });

  assert.equal(result.candidates[0].existingLearnerExpeditionId, "row-1");
});

test("listExpeditionCandidates returns only the learner's own expedition rows", async () => {
  const own = expedition("learner-one", "mine");
  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([], {}),
    expeditionStore: fakeStore([own, expedition("learner-two", "theirs")])
  });

  assert.deepEqual(result.learnerExpeditions.map((row) => row.learnerExpeditionId), ["mine"]);
});

function fakeRead(summaries: EnrichmentSummary[], details: Record<string, DerivedGraphDetail>): EnrichmentInspectionReadPort {
  return {
    async listEnrichmentSummaries() {
      return summaries;
    },
    async getDerivedGraphDetail(enrichmentId: string) {
      return details[enrichmentId];
    },
    async derivedNodeBelongsToEnrichment() {
      return true;
    }
  };
}

function fakeStore(rows: LearnerExpedition[]): LearnerExpeditionStorePort {
  return {
    async upsert() {},
    async listForLearner(learnerStateRef: string) {
      return rows.filter((row) => row.learnerStateRef === learnerStateRef);
    },
    async getForLearner() {
      return undefined;
    },
    async getByEnrichment() {
      return undefined;
    },
    async setActive() {},
    async claimNextGenerating() { return undefined; },
    async failExhaustedGenerating() { return 0; },
    async resetGeneration() {},
    async updateProgress() { return 1; }
  };
}

function summary(enrichmentId: string, startedAt: string): EnrichmentSummary {
  return {
    enrichmentId,
    graphVersionId: null,
    enrichmentConfigHash: "test",
    judgeModel: "test",
    difficultyMethod: "test",
    status: "succeeded",
    edgeCount: 1,
    certainEdgeCount: 1,
    uncertainEdgeCount: 0,
    conceptCount: 2,
    studyItemCount: 1,
    startedAt,
    completedAt: startedAt
  };
}

function detail(enrichmentId: string, nodes: DerivedGraphDetail["nodes"], edges: DerivedGraphDetail["edges"]): DerivedGraphDetail {
  return {
    summary: summary(enrichmentId, "2026-01-01T00:00:00.000Z"),
    nodes,
    edges,
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

function node(derivedNodeId: string, label: string, hasStudyItem: boolean): DerivedGraphDetail["nodes"][number] {
  return {
    derivedNodeId,
    label,
    aliases: [],
    declaredDomain: "test",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment",
    groundingOrigin: "llm_grounded",
    role: "prerequisite",
    hasStudyItem,
    grounding: null
  };
}

function edge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string): DerivedGraphDetail["edges"][number] {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId, confidence: 0.9, uncertain: false, judgeModel: "test" };
}

function fakeStudyItemStore(items: StudyItem[]): StudyItemBankStorePort {
  return {
    async persist() {},
    async getStudyItem() { return undefined; },
    async getStudyItemById() { return undefined; },
    async listStudyItemsForEnrichment() { return items; },
    async supportedItemTypes() { return []; }
  };
}

function fakeResponseLog(rows: ResponseLogRow[]): ResponseLogStorePort {
  return {
    async append() {},
    async listForLearner() { return rows; },
    async listForLearnerNode() { return []; }
  };
}

function fakeLessonReadStore(derivedNodeIds: string[]): LessonReadStorePort {
  return {
    async markRead() {},
    async listForLearner(learnerStateRef: string) {
      return derivedNodeIds.map((derivedNodeId) => ({ learnerStateRef, derivedNodeId, firstReadAt: "2026-01-01T00:00:00.000Z" }));
    }
  };
}

function studyItem(studyItemId: string, derivedNodeId: string): StudyItem {
  return {
    studyItemId, graphVersionId: null, enrichmentId: "exp", derivedNodeId,
    groundingProvenance: "source_cep", generatingModel: "deepseek", configHash: "cfg",
    itemType: "option_select", question: "Q", explanation: "E",
    options: [{ optionId: "o1", text: "One", isCorrect: true, provenance: "source" }, { optionId: "o2", text: "Two", isCorrect: false, provenance: "generated" }]
  };
}

function gradedCorrect(studyItemId: string): ResponseLogRow {
  return {
    responseId: `r-${studyItemId}`, learnerStateRef: "learner-one", studyItemId, derivedNodeId: "mid",
    signalType: "graded", judgedOutcome: "correct", gradedScore: 1, responseSource: "synthetic",
    graderIdentity: "kg-independent-judge", batchId: null, attemptSeq: 1, submittedAnswer: "x"
  };
}

function gradedIncorrect(studyItemId: string): ResponseLogRow {
  return {
    ...gradedCorrect(studyItemId),
    judgedOutcome: "incorrect",
    gradedScore: 0
  };
}

function expedition(learnerStateRef: string, learnerExpeditionId: string): LearnerExpedition {
  return {
    learnerExpeditionId,
    learnerStateRef,
    kind: "topic",
    title: "Topic",
    declaredDomain: "test",
    status: "generating",
    currentOperationId: null,
    currentOperationType: null,
    enrichmentId: null,
    active: false,
    failureMessage: null,
    generationAttempts: 0,
    claimedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
