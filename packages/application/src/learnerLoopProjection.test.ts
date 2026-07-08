import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalibrationVerdict, ResponseLogRow, Verdict, JudgedOutcome } from "@lrnki/domain-core";
import type { Learner, LearnerLoopReadPort, LearnerStorePort } from "@lrnki/ports";
import { buildMasteryMap, detectConflicts, listLearnerAdminSummaries, summarizeLearnerStates, summarizeResponseSources } from "./learnerLoopProjection";

let seq = 0;
function verdict(derivedNodeId: string, v: Verdict, learnerStateRef = "L1"): CalibrationVerdict {
  return { learnerStateRef, derivedNodeId, verdict: v };
}
function graded(derivedNodeId: string, outcome: JudgedOutcome, source: "synthetic" | "human" = "synthetic", learnerStateRef = "L1"): ResponseLogRow & { createdAt: string } {
  return { responseId: `r${++seq}`, learnerStateRef, studyItemId: `studyItem-${derivedNodeId}`, derivedNodeId, signalType: "graded", judgedOutcome: outcome, gradedScore: outcome === "correct" ? 1 : outcome === "partial" ? 0.5 : 0, responseSource: source, graderIdentity: "kg-independent-judge", attemptSeq: seq, batchId: null, submittedAnswer: "answer", createdAt: new Date().toISOString() };
}
function learner(learnerRef: string, displayName = learnerRef, createdAt = "2026-06-01T00:00:00.000Z"): Learner {
  return { learnerRef, displayName, pinHash: "hash", createdAt };
}
function fakeLearnerStore(rows: Learner[]): LearnerStorePort {
  return {
    async create() {
      return { created: false };
    },
    async get(learnerRef) {
      return rows.find((row) => row.learnerRef === learnerRef);
    },
    async list() {
      return rows;
    },
    async listRefsWithStudyEvidence() {
      return rows.map((row) => row.learnerRef);
    }
  };
}
function fakeLoopRead(rows: (ResponseLogRow & { createdAt: string })[], verdicts: CalibrationVerdict[]): LearnerLoopReadPort {
  return {
    async listAllResponses() {
      return rows;
    },
    async listAllVerdicts() {
      return verdicts;
    },
    async listResponsesForLearner() {
      return [];
    },
    async listVerdictsForLearner() {
      return [];
    }
  };
}

test("detectConflicts flags a node whose verdict is known but graded incorrect (Covers R12/AE3)", () => {
  const conflicts = detectConflicts([verdict("nA", "known")], [graded("nA", "incorrect")]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "claimed_known_but_failed");
  assert.equal(conflicts[0].derivedNodeId, "nA");
  assert.equal(conflicts[0].verdict, "known");
});

test("detectConflicts does not flag a node where the verdict and graded agree", () => {
  assert.equal(detectConflicts([verdict("nA", "known")], [graded("nA", "correct")]).length, 0);
});

test("detectConflicts flags the reverse: verdict learn but graded correct", () => {
  const conflicts = detectConflicts([verdict("nB", "learn")], [graded("nB", "correct")]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "claimed_unknown_but_passed");
});

test("detectConflicts uses the LATEST graded per node — a later correct clears an earlier incorrect", () => {
  assert.equal(detectConflicts([verdict("nA", "known")], [graded("nA", "incorrect"), graded("nA", "correct")]).length, 0);
});

test("detectConflicts ignores a node with a verdict but no graded row, or a graded row but no verdict", () => {
  assert.equal(detectConflicts([verdict("nA", "known")], [graded("nB", "incorrect")]).length, 0);
  assert.equal(detectConflicts([], [graded("nA", "incorrect")]).length, 0);
});

test("summarizeLearnerStates counts known verdicts + conflicts and sorts by newest response", () => {
  const older = graded("nA", "correct", "synthetic", "L1");
  older.createdAt = "2026-06-15T10:00:00.000Z";
  const newestForL1 = graded("nC", "incorrect", "synthetic", "L1");
  newestForL1.createdAt = "2026-06-18T12:30:00.000Z";
  const newestOverall = graded("nB", "correct", "synthetic", "L2");
  newestOverall.createdAt = "2026-06-19T08:15:00.000Z";

  const verdicts = [verdict("nA", "known", "L1"), verdict("nC", "known", "L1"), verdict("nB", "learn", "L2")];
  const summaries = summarizeLearnerStates([older, newestForL1, newestOverall], verdicts);

  assert.deepEqual(summaries.map((summary) => summary.learnerStateRef), ["L2", "L1"]);
  const l1 = summaries.find((summary) => summary.learnerStateRef === "L1");
  assert.equal(l1?.latestResponseAt, "2026-06-18T12:30:00.000Z");
  assert.equal(l1?.knownVerdictCount, 2, "two known verdicts for L1");
  assert.equal(l1?.conflictCount, 1, "nC: known verdict vs graded incorrect");
  assert.equal(summaries.find((summary) => summary.learnerStateRef === "L2")?.knownVerdictCount, 0, "L2's only verdict is learn");
});

test("summarizeLearnerStates includes a learner with verdicts but no graded rows yet", () => {
  const summaries = summarizeLearnerStates([], [verdict("nA", "known", "L3")]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].learnerStateRef, "L3");
  assert.equal(summaries[0].latestResponseAt, null);
  assert.equal(summaries[0].knownVerdictCount, 1);
  assert.equal(summaries[0].responseCount, 0);
});

test("listLearnerAdminSummaries includes a registered learner with no activity", async () => {
  const registry = await listLearnerAdminSummaries({
    learnerStore: fakeLearnerStore([learner("L1", "Quiet Learner")]),
    loopRead: fakeLoopRead([], [])
  });

  assert.equal(registry.learners.length, 1);
  assert.equal(registry.learners[0].displayName, "Quiet Learner");
  assert.equal(registry.learners[0].latestResponseAt, null);
  assert.equal(registry.learners[0].knownVerdictCount, 0);
  assert.equal(registry.learners[0].gradedCount, 0);
  assert.deepEqual(registry.stats, {
    registeredLearnerCount: 1,
    activeLearnerCount: 0,
    gradedResponseCount: 0,
    conflictCount: 0
  });
});

test("listLearnerAdminSummaries merges learner activity and aggregates stats", async () => {
  const l1Correct = graded("nA", "correct", "human", "L1");
  l1Correct.createdAt = "2026-06-20T10:00:00.000Z";
  const l1Conflict = graded("nB", "incorrect", "human", "L1");
  l1Conflict.createdAt = "2026-06-20T11:00:00.000Z";

  const registry = await listLearnerAdminSummaries({
    learnerStore: fakeLearnerStore([learner("L1", "Active Learner"), learner("L2", "Verdict Only")]),
    loopRead: fakeLoopRead([l1Correct, l1Conflict], [verdict("nB", "known", "L1"), verdict("nC", "known", "L2")])
  });

  const active = registry.learners.find((summary) => summary.learnerRef === "L1");
  assert.equal(active?.latestResponseAt, "2026-06-20T11:00:00.000Z");
  assert.equal(active?.knownVerdictCount, 1);
  assert.equal(active?.gradedCount, 2);
  assert.equal(active?.conflictCount, 1);
  assert.equal(registry.learners.find((summary) => summary.learnerRef === "L2")?.knownVerdictCount, 1);
  assert.deepEqual(registry.stats, {
    registeredLearnerCount: 2,
    activeLearnerCount: 2,
    gradedResponseCount: 2,
    conflictCount: 1
  });
});

test("summarizeResponseSources: mixed, all-synthetic, and all-human tallies", () => {
  assert.deepEqual(summarizeResponseSources([graded("nA", "incorrect", "synthetic"), graded("nA", "incorrect", "human"), graded("nB", "correct", "synthetic")]), { synthetic: 2, human: 1, total: 3 });
  assert.deepEqual(summarizeResponseSources([graded("nA", "correct", "synthetic"), graded("nB", "correct", "synthetic")]), { synthetic: 2, human: 0, total: 2 });
  assert.deepEqual(summarizeResponseSources([graded("nA", "correct", "human")]), { synthetic: 0, human: 1, total: 1 });
});

test("buildMasteryMap: graded-only fold — latest graded wins per node", () => {
  // Build rows in attempt_seq order (the order the loaders return them).
  const rows = [
    graded("nA", "incorrect"),        // nA: only graded incorrect → 0
    graded("nB", "partial"),          // nB earlier graded partial
    graded("nB", "correct"),          // ...latest graded correct (1.0) wins
    graded("nC", "partial")           // nC: partial → 0.5
  ];
  const mastery = buildMasteryMap(rows);
  assert.equal(mastery.nA, 0, "a graded incorrect folds to 0");
  assert.equal(mastery.nB, 1, "latest graded correct wins");
  assert.equal(mastery.nC, 0.5, "graded partial folds to 0.5");
  assert.deepEqual(buildMasteryMap([]), {}, "empty rows fold to an empty map");
});
