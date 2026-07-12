import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentLayerPurposeStorePort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import type { ResponseLogRow, StudyItem } from "@lrnki/domain-core";
import {
  EXPECTED_TOPIC_GENERATION_STAGE_PLAN,
  getExpeditionCatalog,
  getExpeditionJournal,
  type ExpeditionJournalDeps
} from "./expeditionJournal";
import { OPERATION_TIMELINE_CATALOG } from "./operationTimelineCatalog";
import { OPERATION_HEARTBEAT_STALE_AFTER_MS } from "./operationRunLiveness";

const TOTAL = 14;

// AE8: every expected stage is locked to its operation's catalog entry with kind `llm`;
// a stage that leaves the catalog (or a non-LLM bookkeeping stage sneaking in) fails here.
test("the expected stage plan is a subset of each operation's LLM catalog stages", () => {
  for (const [operationType, stages] of Object.entries(EXPECTED_TOPIC_GENERATION_STAGE_PLAN)) {
    const llmCatalogStages = new Set(
      OPERATION_TIMELINE_CATALOG[operationType as keyof typeof OPERATION_TIMELINE_CATALOG]
        .filter((descriptor) => descriptor.kind === "llm")
        .map((descriptor) => descriptor.stage)
    );
    for (const stage of stages) {
      assert.ok(llmCatalogStages.has(stage), `${stage} is not an llm stage of ${operationType}`);
    }
  }
  assert.equal(
    EXPECTED_TOPIC_GENERATION_STAGE_PLAN.enrichment.length + EXPECTED_TOPIC_GENERATION_STAGE_PLAN.study_items.length,
    TOTAL
  );
});

test("generation facts count completed expected stages against the fixed denominator", async () => {
  const journal = await journalWithTimeline(timeline({
    stages: [
      closed(STAGE_TAGS.conceptSetSynthesis),
      closed(STAGE_TAGS.knowledgeBoundaryProbe),
      closed(STAGE_TAGS.groundingGeneration),
      closed(STAGE_TAGS.prerequisiteOrdering),
      open(STAGE_TAGS.intrinsicDifficulty)
    ]
  }));
  const generation = generatingFacts(journal);
  assert.equal(generation.completed, 4);
  assert.equal(generation.total, TOTAL);
  assert.equal(generation.fraction, 4 / TOTAL);
  assert.equal(generation.currentStage, STAGE_TAGS.intrinsicDifficulty);
});

test("study-item timelines are offset after the six enrichment-phase stages", async () => {
  const journal = await journalWithTimeline(timeline({
    operationType: "study_items",
    stages: [
      closed(STAGE_TAGS.layerPurposeGeneration),
      closed(STAGE_TAGS.conceptLessonGeneration),
      closed(STAGE_TAGS.studyItemBlueprint),
      open(STAGE_TAGS.studyItemGeneration)
    ]
  }));
  const generation = generatingFacts(journal);
  assert.equal(generation.completed, 9);
  assert.equal(generation.total, TOTAL);
});

// AE1 (the drift fix): an open layerPurposeGeneration stage is an EXPECTED stage, so the
// bar stays determinate at the enrichment phase boundary instead of flipping blank.
test("a running study_items timeline whose open stage is layerPurposeGeneration stays determinate", async () => {
  const journal = await journalWithTimeline(timeline({
    operationType: "study_items",
    stages: [open(STAGE_TAGS.layerPurposeGeneration)]
  }));
  const generation = generatingFacts(journal);
  assert.equal(generation.indeterminate, false);
  assert.ok(generation.completed >= 6);
  assert.equal(generation.total, TOTAL);
  assert.equal(generation.currentStage, STAGE_TAGS.layerPurposeGeneration);
});

test("a running unexpected current stage signals indeterminate", async () => {
  const journal = await journalWithTimeline(timeline({ stages: [open("future-stage")] }));
  const generation = generatingFacts(journal);
  assert.equal(generation.completed, 0);
  assert.equal(generation.fraction, null);
  assert.equal(generation.indeterminate, true);
});

// AE2: a succeeded study_items phase clamps to its full span even when conditional
// stages (matching/impostor and their judges) never appeared.
test("a succeeded study_items timeline with absent conditional stages still reaches 14/14", async () => {
  const journal = await journalWithTimeline(timeline({
    operationType: "study_items",
    status: "succeeded",
    stages: [
      closed(STAGE_TAGS.layerPurposeGeneration),
      closed(STAGE_TAGS.conceptLessonGeneration),
      closed(STAGE_TAGS.studyItemBlueprint),
      closed(STAGE_TAGS.studyItemGeneration)
    ]
  }));
  const generation = generatingFacts(journal);
  assert.equal(generation.completed, generation.total);
  assert.equal(generation.fraction, 1);
});

test("a succeeded enrichment timeline with domain inference skipped reaches its phase boundary (6/14)", async () => {
  const journal = await journalWithTimeline(timeline({
    status: "succeeded",
    stages: [
      closed(STAGE_TAGS.conceptSetSynthesis),
      closed(STAGE_TAGS.knowledgeBoundaryProbe),
      closed(STAGE_TAGS.groundingGeneration),
      closed(STAGE_TAGS.prerequisiteOrdering),
      closed(STAGE_TAGS.intrinsicDifficulty)
    ]
  }));
  assert.equal(generatingFacts(journal).completed, 6);
});

// AE3: generating with no operation id is queued; the card needs no timeline knowledge.
test("a generating row with no operation id is queued with a null fraction", async () => {
  const generating: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "generating" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({ expeditions: [generating] }));
  const generation = generatingFacts(journal);
  assert.equal(generation.queued, true);
  assert.equal(generation.fraction, null);
  assert.equal(generation.stalled, false);
  assert.equal(generation.currentStage, null);
});

// AE4: staleness crosses the seam as a finished fact via the shared ADR-0029 predicate.
test("a running timeline with a stale lastProgressAt reports stalled", async () => {
  const staleAt = new Date(Date.now() - OPERATION_HEARTBEAT_STALE_AFTER_MS - 60_000).toISOString();
  const journal = await journalWithTimeline({
    ...timeline({ stages: [open(STAGE_TAGS.conceptSetSynthesis)] }),
    summary: { ...timeline({ stages: [open(STAGE_TAGS.conceptSetSynthesis)] }).summary, lastProgressAt: staleAt }
  });
  const generation = generatingFacts(journal);
  assert.equal(generation.stalled, true);
  assert.equal(generation.queued, false);
});

// AE6: tier partition is projection policy — engaged ready rows land in `started`,
// untouched/generating/failed rows in `yours`, preserving store order.
test("tiers: graded activity moves a ready row to started; others stay in yours in store order", async () => {
  const readyStarted: LearnerExpedition = { ...expedition("learner-one", "row-started"), status: "ready", enrichmentId: "exp" };
  const readyUntouched: LearnerExpedition = { ...expedition("learner-one", "row-untouched"), status: "ready", enrichmentId: "exp-2" };
  const failed: LearnerExpedition = { ...expedition("learner-one", "row-failed"), status: "failed", failureMessage: "boom" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries: [summary("exp", "2026-01-01T00:00:00.000Z"), summary("exp-2", "2026-01-02T00:00:00.000Z")],
    details: {
      exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")]),
      "exp-2": detail("exp-2", [node("a", "A", true), node("b", "B", true)], [edge("a", "b")])
    },
    expeditions: [failed, readyStarted, readyUntouched],
    items: [studyItem("i-mid", "mid")],
    responses: [gradedIncorrect("i-mid")]
  }));
  assert.deepEqual(journal.started.map((row) => row.learnerExpeditionId), ["row-started"]);
  assert.deepEqual(journal.yours.map((row) => row.learnerExpeditionId), ["row-failed", "row-untouched"]);
  const failedRow = journal.yours[0];
  assert.equal(failedRow.status, "failed");
  assert.equal(failedRow.status === "failed" || failedRow.status === "generating" ? failedRow.failureMessage : null, "boom");
});

test("lesson-read-only activity also counts as started", async () => {
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries: [summary("exp", "2026-01-01T00:00:00.000Z")],
    details: { exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")]) },
    expeditions: [ready],
    items: [studyItem("i-mid", "mid")],
    lessonReadNodeIds: ["mid"]
  }));
  assert.equal(journal.started.length, 1);
  assert.deepEqual(journal.started[0].progress, { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 1, itemsTotal: 1 });
});

// AE3: progress counts only items on trail-reachable (non-floored) nodes, so the total
// matches the stop math the trail walks.
test("progress counts only items on trail-reachable (non-floored) nodes", async () => {
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
  ], [edge("easy", "mid"), edge("mid", "summit")]);
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries: [summary("exp", "2026-01-01T00:00:00.000Z")],
    details: { exp: layer },
    expeditions: [ready],
    items: [studyItem("i-easy", "easy"), studyItem("i-mid", "mid"), studyItem("i-summit", "summit")],
    responses: [gradedCorrect("i-mid")]
  }));
  // 3 items exist, but `easy` is floored → only mid + summit count. One is latest-correct.
  assert.deepEqual(journal.started[0].progress, { itemsPassed: 1, itemsAttempted: 1, lessonsRead: 0, itemsTotal: 2 });
  assert.equal(journal.started[0].layerPurpose, "Purpose of exp");
});

test("wrong-answer-only activity produces attempted progress and a started row", async () => {
  const ready: LearnerExpedition = { ...expedition("learner-one", "row-1"), status: "ready", enrichmentId: "exp" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries: [summary("exp", "2026-01-01T00:00:00.000Z")],
    details: { exp: detail("exp", [node("start", "Start", true), node("mid", "Middle", true)], [edge("start", "mid")]) },
    expeditions: [ready],
    items: [studyItem("i-mid", "mid")],
    responses: [gradedIncorrect("i-mid")]
  }));
  assert.deepEqual(journal.started[0].progress, { itemsPassed: 0, itemsAttempted: 1, lessonsRead: 0, itemsTotal: 1 });
});

// AE5: Explore filters adopted candidates BEFORE taking its top five, so an adopted
// expedition consumes no slot; the wire candidate carries only what surfaces render.
test("Explore curation filters adopted candidates then takes the top five, narrowed to card fields", async () => {
  const summaries = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "adopted"].map((id, index) =>
    summary(id, `2026-01-0${Math.min(index + 1, 8)}T00:00:00.000Z`)
  );
  const details = Object.fromEntries(summaries.map(({ enrichmentId }) => [
    enrichmentId,
    detail(enrichmentId, [node(`${enrichmentId}-a`, `${enrichmentId} start`, true), node(`${enrichmentId}-b`, `${enrichmentId} summit`, true)], [edge(`${enrichmentId}-a`, `${enrichmentId}-b`)])
  ]));
  // The adopted candidate would rank first by recency; it must not consume a slot.
  const adopted: LearnerExpedition = { ...expedition("learner-one", "row-adopted"), status: "ready", enrichmentId: "adopted" };
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries, details, expeditions: [adopted]
  }));
  assert.equal(journal.shared.length, 5);
  assert.ok(!journal.shared.some((candidate) => candidate.enrichmentId === "adopted"));
  assert.deepEqual(
    Object.keys(journal.shared[0]).sort(),
    ["declaredDomain", "enrichmentId", "searchTerms", "title", "totalStopCount"]
  );
});

test("the catalog is unlimited, adoption-filtered, readiness-ranked, and excludes one-stop trails", async () => {
  const catalog = await getExpeditionCatalog({ learnerStateRef: "learner-one" }, deps({
    summaries: [
      summary("later", "2026-01-02T00:00:00.000Z"),
      summary("earlier", "2026-01-01T00:00:00.000Z"),
      summary("oldest", "2025-12-31T00:00:00.000Z"),
      summary("ancient", "2025-12-30T00:00:00.000Z"),
      summary("summit-only", "2026-01-03T00:00:00.000Z"),
      summary("adopted", "2026-01-04T00:00:00.000Z")
    ],
    details: {
      later: detail("later", [node("later-start", "Photosynthetic start", true), node("later-summit", "Later summit", true)], [edge("later-start", "later-summit")]),
      earlier: detail("earlier", [node("earlier-start", "Earlier start", true), node("earlier-summit", "Earlier summit", true)], [edge("earlier-start", "earlier-summit")]),
      oldest: detail("oldest", [node("oldest-start", "Oldest start", true), node("oldest-summit", "Oldest summit", true)], [edge("oldest-start", "oldest-summit")]),
      ancient: detail("ancient", [node("ancient-start", "Ancient start", true), node("ancient-summit", "Ancient summit", true)], [edge("ancient-start", "ancient-summit")]),
      "summit-only": detail("summit-only", [node("only", "Only summit", true)], []),
      adopted: detail("adopted", [node("adopted-start", "Adopted start", true), node("adopted-summit", "Adopted summit", true)], [edge("adopted-start", "adopted-summit")])
    },
    expeditions: [{ ...expedition("learner-one", "row-adopted"), status: "ready", enrichmentId: "adopted" }]
  }));
  assert.deepEqual(catalog.candidates.map((candidate) => candidate.enrichmentId), ["later", "earlier", "oldest", "ancient"]);
  assert.deepEqual(catalog.candidates[0].searchTerms, ["Photosynthetic start", "Later summit"]);
});

test("ranking prefers fully ready candidates over larger unready ones", async () => {
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    summaries: [summary("unready", "2026-01-02T00:00:00.000Z"), summary("ready", "2026-01-01T00:00:00.000Z")],
    details: {
      unready: detail("unready", [node("u-a", "Unready prerequisite", true), node("u-b", "Unready target", false)], [edge("u-a", "u-b")]),
      ready: detail("ready", [node("r-a", "Ready prerequisite", true), node("r-b", "Ready target", true)], [edge("r-a", "r-b")])
    }
  }));
  assert.deepEqual(journal.shared.map((candidate) => candidate.enrichmentId), ["ready", "unready"]);
});

test("the journal returns only the learner's own expedition rows", async () => {
  const journal = await getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    expeditions: [expedition("learner-one", "mine"), expedition("learner-two", "theirs")]
  }));
  assert.deepEqual([...journal.started, ...journal.yours].map((row) => row.learnerExpeditionId), ["mine"]);
});

// --- fakes and fixtures ---

async function journalWithTimeline(detailTimeline: OperationTimelineDetail) {
  const generating: LearnerExpedition = {
    ...expedition("learner-one", "row-1"),
    status: "generating",
    currentOperationId: detailTimeline.summary.operationId,
    currentOperationType: detailTimeline.summary.operationType
  };
  return getExpeditionJournal({ learnerStateRef: "learner-one" }, deps({
    expeditions: [generating],
    timelines: { [detailTimeline.summary.operationId]: detailTimeline }
  }));
}

function generatingFacts(journal: Awaited<ReturnType<typeof getExpeditionJournal>>) {
  const row = journal.yours[0];
  assert.ok(row && row.status !== "ready");
  return row.generation;
}

function deps(input: {
  summaries?: EnrichmentSummary[];
  details?: Record<string, DerivedGraphDetail>;
  expeditions?: LearnerExpedition[];
  items?: StudyItem[];
  responses?: ResponseLogRow[];
  lessonReadNodeIds?: string[];
  timelines?: Record<string, OperationTimelineDetail>;
}): ExpeditionJournalDeps {
  return {
    enrichmentRead: fakeRead(input.summaries ?? [], input.details ?? {}),
    expeditionStore: fakeStore(input.expeditions ?? []),
    studyItemStore: fakeStudyItemStore(input.items ?? []),
    responseLog: fakeResponseLog(input.responses ?? []),
    lessonReadStore: fakeLessonReadStore(input.lessonReadNodeIds ?? []),
    layerPurposeStore: fakeLayerPurposeStore(),
    timelineRead: fakeTimelineRead(input.timelines ?? {})
  };
}

function fakeRead(summaries: EnrichmentSummary[], details: Record<string, DerivedGraphDetail>): EnrichmentInspectionReadPort {
  return {
    async listEnrichmentSummaries() { return summaries; },
    async getDerivedGraphDetail(enrichmentId: string) { return details[enrichmentId]; },
    async derivedNodeBelongsToEnrichment() { return true; }
  };
}

function fakeStore(rows: LearnerExpedition[]): LearnerExpeditionStorePort {
  return {
    async upsert() {},
    async listForLearner(learnerStateRef: string) { return rows.filter((row) => row.learnerStateRef === learnerStateRef); },
    async getForLearner() { return undefined; },
    async getByEnrichment() { return undefined; },
    async setActive() {},
    async claimNextGenerating() { return undefined; },
    async failExhaustedGenerating() { return 0; },
    async resetGeneration() {},
    async updateProgress() { return 1; }
  };
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

function fakeLayerPurposeStore(): EnrichmentLayerPurposeStorePort {
  return {
    async persist() {},
    async get(enrichmentId: string) { return `Purpose of ${enrichmentId}`; }
  };
}

function fakeTimelineRead(timelines: Record<string, OperationTimelineDetail>): OperationTimelineReadPort {
  return {
    async listOperationTimelines() { return Object.values(timelines).map((entry) => entry.summary); },
    async getOperationTimeline(operationId: string) { return timelines[operationId]; }
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
  return { ...gradedCorrect(studyItemId), judgedOutcome: "incorrect", gradedScore: 0 };
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

function timeline(input: {
  operationType?: OperationTimelineDetail["summary"]["operationType"];
  status?: OperationTimelineDetail["summary"]["status"];
  stages: OperationTimelineDetail["stages"];
}): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: "run-1",
      operationType: input.operationType ?? "enrichment",
      operationId: "op-1",
      status: input.status ?? "running",
      currentStage: input.stages.find((stage) => !stage.endedAt)?.stage ?? null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      elapsedMs: 0,
      stageCount: input.stages.length
    },
    stages: input.stages
  };
}

function closed(stage: string): OperationTimelineDetail["stages"][number] {
  return { stage, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, ok: true, progressDone: null, progressTotal: null, errorDetail: null };
}

function open(stage: string): OperationTimelineDetail["stages"][number] {
  return { stage, startedAt: "2026-01-01T00:00:00.000Z", endedAt: null, durationMs: null, ok: null, progressDone: null, progressTotal: null, errorDetail: null };
}
