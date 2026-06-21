import assert from "node:assert/strict";
import test from "node:test";
import type { JudgedOutcome, NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, ResponseLogStorePort } from "@lrnki/ports";
import { gradeAndAppend, GRADED_EVIDENCE_WEIGHT } from "./measurement";
import { appendSelfReportBatch, SELF_REPORT_EVIDENCE_WEIGHT } from "./calibration";

function fakeResponseLog(): { store: ResponseLogStorePort; rows: NewResponseLogRow[] } {
  const rows: NewResponseLogRow[] = [];
  const hydrate = (r: NewResponseLogRow): ResponseLogRow => ({ ...r, createdAt: new Date().toISOString() });
  const store: ResponseLogStorePort = {
    async append(appended) { rows.push(...appended); },
    async listForLearner(ref) { return rows.filter((r) => r.learnerStateRef === ref).map(hydrate); },
    async listForLearnerNode(ref, nodeId) { return rows.filter((r) => r.learnerStateRef === ref && r.derivedNodeId === nodeId).map(hydrate); },
    async nextAttemptSeq(ref) { return rows.filter((r) => r.learnerStateRef === ref).length + 1; }
  };
  return { store, rows };
}

function judgeReturning(canned: { outcome: JudgedOutcome; score: number; rationale: string }): AnswerGradingJudgePort {
  return { model: "kg-independent-judge", async grade() { return canned; } };
}

const card = { cardId: "card-1", derivedNodeId: "node-1", question: "What is X?", answerKey: "X is a thing." };

test("a canned 'partial' verdict appends a graded row with the score and grader identity (Covers AE4, R4)", async () => {
  const log = fakeResponseLog();
  const { row } = await gradeAndAppend({
    learnerStateRef: "L1", card, declaredDomain: "software engineering", submittedAnswer: "X is sort of a thing",
    judge: judgeReturning({ outcome: "partial", score: 0.5, rationale: "incomplete" }), responseLog: log.store, responseSource: "synthetic"
  });
  assert.equal(row.signalType, "graded");
  assert.equal(row.judgedOutcome, "partial");
  assert.equal(row.gradedScore, 0.5);
  assert.equal(row.graderIdentity, "kg-independent-judge");
  assert.equal(row.submittedAnswer, "X is sort of a thing");
  assert.equal(log.rows.length, 1);
});

test("canned 'correct' and 'incorrect' verdicts map to graded_score 1.0 and 0", async () => {
  const log = fakeResponseLog();
  const correct = await gradeAndAppend({
    learnerStateRef: "L1", card, declaredDomain: "d", submittedAnswer: "X is a thing",
    judge: judgeReturning({ outcome: "correct", score: 1.0, rationale: "ok" }), responseLog: log.store, responseSource: "human"
  });
  const incorrect = await gradeAndAppend({
    learnerStateRef: "L1", card, declaredDomain: "d", submittedAnswer: "no idea",
    judge: judgeReturning({ outcome: "incorrect", score: 0, rationale: "wrong" }), responseLog: log.store, responseSource: "human"
  });
  assert.equal(correct.row.gradedScore, 1.0);
  assert.equal(incorrect.row.gradedScore, 0);
  assert.deepEqual(log.rows.map((r) => r.attemptSeq), [1, 2], "graded rows take monotonic attempt_seq");
});

test("the graded row's evidence weight exceeds a self-report row's weight", async () => {
  assert.ok(GRADED_EVIDENCE_WEIGHT > SELF_REPORT_EVIDENCE_WEIGHT);
  const log = fakeResponseLog();
  await appendSelfReportBatch({ learnerStateRef: "L1", responseLog: log.store, ratings: [{ derivedNodeId: "node-1", cardId: "card-1", rating: "good" }], responseSource: "human" });
  const { row } = await gradeAndAppend({
    learnerStateRef: "L1", card, declaredDomain: "d", submittedAnswer: "answer",
    judge: judgeReturning({ outcome: "correct", score: 1, rationale: "ok" }), responseLog: log.store, responseSource: "human"
  });
  const selfReport = log.rows.find((r) => r.signalType === "self_report")!;
  assert.ok(row.evidenceWeight > selfReport.evidenceWeight);
});

test("a judge transport/validation failure propagates and appends nothing (fail-closed)", async () => {
  const log = fakeResponseLog();
  const failingJudge: AnswerGradingJudgePort = { model: "kg-independent-judge", async grade() { throw new Error("invalid tool arguments"); } };
  await assert.rejects(() => gradeAndAppend({
    learnerStateRef: "L1", card, declaredDomain: "d", submittedAnswer: "answer",
    judge: failingJudge, responseLog: log.store, responseSource: "synthetic"
  }), /invalid tool arguments/);
  assert.equal(log.rows.length, 0, "no row appended when grading fails");
});
