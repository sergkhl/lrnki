import assert from "node:assert/strict";
import test from "node:test";
import type { NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { appendSelfAssessedGrade, SELF_GRADER_IDENTITY } from "./selfAssessment";
import { appendSelfReportBatch } from "./calibration";
import { GRADED_EVIDENCE_WEIGHT } from "./measurement";
import { foldConceptMastery } from "./responseLogLearnerState";

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

const card = { cardId: "card-1", derivedNodeId: "node-1" };

test("'got it' appends a graded(self) row: correct / score 1, no submitted answer (Covers R6)", async () => {
  const log = fakeResponseLog();
  const { row } = await appendSelfAssessedGrade({
    learnerStateRef: "L1", card, outcome: "got_it", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.signalType, "graded");
  assert.equal(row.judgedOutcome, "correct");
  assert.equal(row.gradedScore, 1);
  assert.equal(row.graderIdentity, SELF_GRADER_IDENTITY);
  assert.equal(row.submittedAnswer, null);
  assert.equal(row.selfReportRating, null);
  assert.equal(row.evidenceWeight, GRADED_EVIDENCE_WEIGHT);
  assert.equal(log.rows.length, 1);
});

test("'missed it' appends incorrect / score 0", async () => {
  const log = fakeResponseLog();
  const { row } = await appendSelfAssessedGrade({
    learnerStateRef: "L1", card, outcome: "missed_it", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.judgedOutcome, "incorrect");
  assert.equal(row.gradedScore, 0);
  assert.equal(row.graderIdentity, SELF_GRADER_IDENTITY);
});

test("graded(self) outranks an earlier self_report in the fold; latest graded wins (Covers R8)", async () => {
  const log = fakeResponseLog();
  // A calibrated "I know it" (self_report good) followed by a self-assessed "missed it".
  await appendSelfReportBatch({
    learnerStateRef: "L1", responseLog: log.store, responseSource: "human",
    ratings: [{ derivedNodeId: "node-1", cardId: "card-1", rating: "good" }]
  });
  await appendSelfAssessedGrade({ learnerStateRef: "L1", card, outcome: "missed_it", responseSource: "human", responseLog: log.store });

  const nodeRows = (await log.store.listForLearner("L1")).filter((r) => r.derivedNodeId === "node-1");
  assert.equal(foldConceptMastery(nodeRows), 0, "graded(self) incorrect beats the earlier self_report 'good'");
});

test("attemptSeq comes from nextAttemptSeq and rows append in monotonic order", async () => {
  const log = fakeResponseLog();
  await appendSelfAssessedGrade({ learnerStateRef: "L1", card, outcome: "got_it", responseSource: "human", responseLog: log.store });
  await appendSelfAssessedGrade({ learnerStateRef: "L1", card, outcome: "missed_it", responseSource: "human", responseLog: log.store });
  assert.deepEqual(log.rows.map((r) => r.attemptSeq), [1, 2]);
});

test("responseSource is passed through verbatim for both human and synthetic", async () => {
  const log = fakeResponseLog();
  const human = await appendSelfAssessedGrade({ learnerStateRef: "L1", card, outcome: "got_it", responseSource: "human", responseLog: log.store });
  const synthetic = await appendSelfAssessedGrade({ learnerStateRef: "L2", card, outcome: "got_it", responseSource: "synthetic", responseLog: log.store });
  assert.equal(human.row.responseSource, "human");
  assert.equal(synthetic.row.responseSource, "synthetic");
});
