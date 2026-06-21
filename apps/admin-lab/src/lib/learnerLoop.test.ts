import assert from "node:assert/strict";
import { test } from "node:test";
import type { DerivedGraphLayer, LearnerPath, NewResponseLogRow, ResponseLogRow, SelfReportRating, JudgedOutcome } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, ArtifactRepositoryPort, EnrichmentRunStorePort, LearnerPathStorePort, ResponseLogStorePort } from "@lrnki/ports";
import { buildMasteryMap, dedupeEnrichmentScopes, detectConflicts, resubmitAndRecompute, summarizeLearnerStates, summarizeResponseSources } from "./learnerLoop";

let seq = 0;
function selfReport(derivedNodeId: string, rating: SelfReportRating): ResponseLogRow {
  return { responseId: `r${++seq}`, learnerStateRef: "L1", studyItemId: `studyItem-${derivedNodeId}`, derivedNodeId, signalType: "self_report", selfReportRating: rating, judgedOutcome: null, gradedScore: null, evidenceWeight: 0.3, responseSource: "synthetic", graderIdentity: null, batchId: "b", attemptSeq: seq, submittedAnswer: null, createdAt: new Date().toISOString() };
}
function graded(derivedNodeId: string, outcome: JudgedOutcome, source: "synthetic" | "human" = "synthetic"): ResponseLogRow {
  return { responseId: `r${++seq}`, learnerStateRef: "L1", studyItemId: `studyItem-${derivedNodeId}`, derivedNodeId, signalType: "graded", selfReportRating: null, judgedOutcome: outcome, gradedScore: outcome === "correct" ? 1 : outcome === "partial" ? 0.5 : 0, evidenceWeight: 1, responseSource: source, graderIdentity: "kg-independent-judge", attemptSeq: seq, batchId: null, submittedAnswer: "answer", createdAt: new Date().toISOString() };
}

test("detectConflicts flags a node claimed known but graded incorrect (Covers R16)", () => {
  const conflicts = detectConflicts([selfReport("nA", "good"), graded("nA", "incorrect")]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "claimed_known_but_failed");
  assert.equal(conflicts[0].derivedNodeId, "nA");
});

test("detectConflicts does not flag a node where self-report and graded agree", () => {
  assert.equal(detectConflicts([selfReport("nA", "good"), graded("nA", "correct")]).length, 0);
});

test("detectConflicts flags the reverse: claimed unknown but graded correct", () => {
  const conflicts = detectConflicts([selfReport("nB", "again"), graded("nB", "correct")]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "claimed_unknown_but_passed");
});

test("detectConflicts ignores nodes with only one signal type", () => {
  assert.equal(detectConflicts([selfReport("nA", "good"), graded("nB", "incorrect")]).length, 0);
});

test("summarizeLearnerStates records each learner's newest response and sorts by it", () => {
  const older = { ...selfReport("nA", "good"), learnerStateRef: "L1", createdAt: "2026-06-15T10:00:00.000Z" };
  const newestForL1 = { ...graded("nA", "incorrect"), learnerStateRef: "L1", createdAt: "2026-06-18T12:30:00.000Z" };
  const newestOverall = { ...selfReport("nB", "again"), learnerStateRef: "L2", createdAt: "2026-06-19T08:15:00.000Z" };

  const summaries = summarizeLearnerStates([older, newestForL1, newestOverall]);

  assert.deepEqual(summaries.map((summary) => summary.learnerStateRef), ["L2", "L1"]);
  assert.equal(summaries.find((summary) => summary.learnerStateRef === "L1")?.latestResponseAt, "2026-06-18T12:30:00.000Z");
  assert.equal(summaries.find((summary) => summary.learnerStateRef === "L2")?.latestResponseAt, "2026-06-19T08:15:00.000Z");
});

// --- U2 pure overlay helpers (R1/R3) ---------------------------------------
// The DB-bound getLearnerLoopDetail / getLearnerAdaptedGraphs are verified by real-use
// inspection (live Postgres, established untested-loader pattern); only these extracted
// pure helpers carry unit scenarios.

test("dedupeEnrichmentScopes: two enrichments yield two entries; duplicates collapse keeping the first (latest-first input)", () => {
  assert.deepEqual(
    dedupeEnrichmentScopes([{ enrichmentId: "e1" }, { enrichmentId: "e2" }]).map((s) => s.enrichmentId),
    ["e1", "e2"]
  );
  // Loader returns paths created_at DESC, so the first row for an enrichment is the latest.
  const collapsed = dedupeEnrichmentScopes([
    { enrichmentId: "e1", target: "latest" },
    { enrichmentId: "e1", target: "older" }
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].target, "latest");
});

test("summarizeResponseSources: mixed, all-synthetic, and all-human tallies", () => {
  assert.deepEqual(summarizeResponseSources([selfReport("nA", "good"), graded("nA", "incorrect", "human"), graded("nB", "correct", "synthetic")]), { synthetic: 2, human: 1, total: 3 });
  assert.deepEqual(summarizeResponseSources([graded("nA", "correct", "synthetic"), graded("nB", "correct", "synthetic")]), { synthetic: 2, human: 0, total: 2 });
  assert.deepEqual(summarizeResponseSources([graded("nA", "correct", "human")]), { synthetic: 0, human: 1, total: 1 });
});

test("buildMasteryMap: graded outranks self-report, latest graded wins, self-report recency selects the prior", () => {
  // Build rows in attempt_seq order (the order the loader returns them).
  const rows = [
    graded("nA", "incorrect"),        // nA earlier graded incorrect (0)
    selfReport("nA", "easy"),         // ...later self-report easy (1.0) must NOT override
    graded("nB", "partial"),          // nB earlier graded partial
    graded("nB", "correct"),          // ...latest graded correct (1.0) wins
    selfReport("nC", "good")          // nC self-report only → 0.7
  ];
  const mastery = buildMasteryMap(rows);
  assert.equal(mastery.nA, 0, "graded incorrect outranks the later self-report");
  assert.equal(mastery.nB, 1, "latest graded correct wins");
  assert.equal(mastery.nC, 0.7, "self-report recency selects the active prior");
  assert.deepEqual(buildMasteryMap([]), {}, "empty rows fold to an empty map");
});

// --- resubmit + recompute (deterministic envelope, canned judge) -----------

function fakeResponseLog(initial: ResponseLogRow[]): { store: ResponseLogStorePort; rows: ResponseLogRow[] } {
  const rows = [...initial];
  let n = rows.length;
  const store: ResponseLogStorePort = {
    async append(appended: NewResponseLogRow[]) { for (const r of appended) rows.push({ ...r, createdAt: new Date().toISOString() }); },
    async listForLearner(ref) { return rows.filter((r) => r.learnerStateRef === ref); },
    async listForLearnerNode(ref, nodeId) { return rows.filter((r) => r.learnerStateRef === ref && r.derivedNodeId === nodeId); },
    async nextAttemptSeq() { return ++n; }
  };
  return { store, rows };
}

const layer: DerivedGraphLayer = {
  enrichmentId: "e1", graphVersionId: "gv", enrichmentConfigHash: "c", judgeModel: "m",
  derivedNodes: [
    { nodeKind: "anchor", derivedNodeId: "nA", conceptId: "cA", groundingOrigin: "document_anchored", role: "anchor", layer: "asserted", canonicalLabel: "A", normalizedLabel: "a", declaredDomain: "d", aliases: [] },
    { nodeKind: "anchor", derivedNodeId: "nB", conceptId: "cB", groundingOrigin: "document_anchored", role: "anchor", layer: "asserted", canonicalLabel: "B", normalizedLabel: "b", declaredDomain: "d", aliases: [] }
  ],
  prerequisiteEdges: [{ prerequisiteDerivedNodeId: "nA", dependentDerivedNodeId: "nB", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } }],
  difficulties: [{ derivedNodeId: "nA", score: 0.2, method: "m", components: {}, neuralRationale: "" }, { derivedNodeId: "nB", score: 0.6, method: "m", components: {}, neuralRationale: "" }]
};

const enrichmentStore = { async getLayer() { return layer; } } as unknown as EnrichmentRunStorePort;
const judge: AnswerGradingJudgePort = { model: "kg-independent-judge", async grade() { return { outcome: "correct", score: 1, rationale: "r" }; } };

test("resubmit appends a new graded row, leaves the original synthetic row intact, and recomputes the path (Covers AE5, R15)", async () => {
  const original = graded("nA", "incorrect", "synthetic"); // an earlier synthetic graded row
  const log = fakeResponseLog([original]);
  const persisted: LearnerPath[] = [];
  const pathStore: LearnerPathStorePort = { async persist(p) { persisted.push(p); }, async getPath() { return undefined; } };
  const artifacts: ArtifactRepositoryPort = { async append() {} };

  const result = await resubmitAndRecompute({
    learnerStateRef: "L1",
    studyItem: { studyItemId: "studyItem-nA", derivedNodeId: "nA", question: "Q?", answerKey: "A" },
    declaredDomain: "d",
    submittedAnswer: "an improved answer",
    paths: [{ enrichmentId: "e1", targetDerivedNodeId: "nB" }],
    judge, responseLog: log.store, enrichmentStore, pathStore, artifacts,
    newPathId: () => "newpath-1"
  });

  assert.equal(result.judgedOutcome, "correct");
  assert.equal(result.recomputedPaths, 1);
  // original synthetic incorrect row still present (append-only).
  assert.ok(log.rows.some((r) => r.responseId === original.responseId && r.judgedOutcome === "incorrect"), "original row intact");
  // a new human graded row was appended for nA.
  const humanRows = log.rows.filter((r) => r.responseSource === "human" && r.derivedNodeId === "nA");
  assert.equal(humanRows.length, 1);
  assert.equal(humanRows[0].judgedOutcome, "correct");
  // the path was recomputed and persisted; the new graded correct on cA masters it,
  // so cA (0.7+) is pruned from the path to nB.
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].steps.some((s) => s.derivedNodeId === "nA"), false, "newly-mastered cA pruned");
});
