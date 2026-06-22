import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { appendOptionSelectOutcome, AUTO_GRADER_IDENTITY } from "./optionSelectOutcome";
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

const item = { studyItemId: "item-1", derivedNodeId: "node-1" };

test("a correct option appends one graded(auto) row with score 1 and no submitted answer (Covers AE1)", async () => {
  const log = fakeResponseLog();
  const { row } = await appendOptionSelectOutcome({
    learnerStateRef: "L1", item, chosenOptionId: "option-correct", correctOptionId: "option-correct", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.signalType, "graded");
  assert.equal(row.judgedOutcome, "correct");
  assert.equal(row.gradedScore, 1);
  assert.equal(row.graderIdentity, AUTO_GRADER_IDENTITY);
  assert.equal(row.submittedAnswer, null);
  assert.equal(row.selfReportRating, null);
  assert.equal(row.evidenceWeight, GRADED_EVIDENCE_WEIGHT);
  assert.equal(log.rows.length, 1);
});

test("a wrong option appends incorrect / score 0 under the auto grader", async () => {
  const log = fakeResponseLog();
  const { row } = await appendOptionSelectOutcome({
    learnerStateRef: "L1", item, chosenOptionId: "option-wrong", correctOptionId: "option-correct", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.judgedOutcome, "incorrect");
  assert.equal(row.gradedScore, 0);
  assert.equal(row.graderIdentity, AUTO_GRADER_IDENTITY);
});

test("graded(auto) correct composes with the mastery fold and outranks self_report", async () => {
  const log = fakeResponseLog();
  await appendSelfReportBatch({
    learnerStateRef: "L1", responseLog: log.store, responseSource: "human",
    ratings: [{ derivedNodeId: "node-1", studyItemId: "item-1", rating: "again" }]
  });
  await appendOptionSelectOutcome({
    learnerStateRef: "L1", item, chosenOptionId: "option-correct", correctOptionId: "option-correct", responseSource: "human", responseLog: log.store
  });

  const nodeRows = (await log.store.listForLearner("L1")).filter((r) => r.derivedNodeId === "node-1");
  assert.equal(foldConceptMastery(nodeRows), 1, "graded(auto) correct masters the node");
});

test("attemptSeq comes from nextAttemptSeq and rows append in monotonic order", async () => {
  const log = fakeResponseLog();
  await appendOptionSelectOutcome({ learnerStateRef: "L1", item, chosenOptionId: "a", correctOptionId: "a", responseSource: "human", responseLog: log.store });
  await appendOptionSelectOutcome({ learnerStateRef: "L1", item, chosenOptionId: "b", correctOptionId: "a", responseSource: "human", responseLog: log.store });
  assert.deepEqual(log.rows.map((r) => r.attemptSeq), [1, 2]);
});

test("responseSource is passed through verbatim for both human and synthetic", async () => {
  const log = fakeResponseLog();
  const human = await appendOptionSelectOutcome({ learnerStateRef: "L1", item, chosenOptionId: "a", correctOptionId: "a", responseSource: "human", responseLog: log.store });
  const synthetic = await appendOptionSelectOutcome({ learnerStateRef: "L2", item, chosenOptionId: "a", correctOptionId: "a", responseSource: "synthetic", responseLog: log.store });
  assert.equal(human.row.responseSource, "human");
  assert.equal(synthetic.row.responseSource, "synthetic");
});

test("appendOptionSelectOutcome imports no graph or enrichment write port", () => {
  const source = readFileSync(new URL("./optionSelectOutcome.ts", import.meta.url), "utf8");
  assert.equal(/GraphVersionStorePort|EnrichmentRunStorePort|LearnerPathStorePort/.test(source), false);
});
