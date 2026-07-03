import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { appendGradedSelectionOutcome, AUTO_GRADER_IDENTITY } from "./gradedSelectionOutcome";
import { foldConceptMastery } from "./responseLogLearnerState";

function fakeResponseLog(): { store: ResponseLogStorePort; rows: NewResponseLogRow[] } {
  const rows: NewResponseLogRow[] = [];
  // Mirror the real store: it allocates `attemptSeq` itself, monotonic per learner in
  // append order. The fake stamps the same on read so order assertions exercise the
  // boundary's contract rather than a caller-supplied value.
  const forLearner = (ref: string) => rows.filter((r) => r.learnerStateRef === ref);
  const hydrate = (r: NewResponseLogRow, seq: number): ResponseLogRow => ({ ...r, attemptSeq: seq, createdAt: new Date().toISOString() });
  const store: ResponseLogStorePort = {
    async append(appended) { rows.push(...appended); },
    async listForLearner(ref) { return forLearner(ref).map((r, i) => hydrate(r, i + 1)); },
    async listForLearnerNode(ref, nodeId) { return forLearner(ref).map((r, i) => hydrate(r, i + 1)).filter((r) => r.derivedNodeId === nodeId); }
  };
  return { store, rows };
}

const item = { studyItemId: "item-1", derivedNodeId: "node-1" };

test("a correct option appends one graded(auto) row with score 1 and no submitted answer (Covers AE1)", async () => {
  const log = fakeResponseLog();
  const { row } = await appendGradedSelectionOutcome({
    learnerStateRef: "L1", item, chosenId: "option-correct", keyedCorrectId: "option-correct", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.signalType, "graded");
  assert.equal(row.judgedOutcome, "correct");
  assert.equal(row.gradedScore, 1);
  assert.equal(row.graderIdentity, AUTO_GRADER_IDENTITY);
  assert.equal(row.submittedAnswer, null);
  assert.equal(log.rows.length, 1);
});

test("a wrong option appends incorrect / score 0 under the auto grader", async () => {
  const log = fakeResponseLog();
  const { row } = await appendGradedSelectionOutcome({
    learnerStateRef: "L1", item, chosenId: "option-wrong", keyedCorrectId: "option-correct", responseSource: "human", responseLog: log.store
  });
  assert.equal(row.judgedOutcome, "incorrect");
  assert.equal(row.gradedScore, 0);
  assert.equal(row.graderIdentity, AUTO_GRADER_IDENTITY);
});

test("graded(auto) correct composes with the graded mastery fold to master the node", async () => {
  const log = fakeResponseLog();
  await appendGradedSelectionOutcome({
    learnerStateRef: "L1", item, chosenId: "option-wrong", keyedCorrectId: "option-correct", responseSource: "human", responseLog: log.store
  });
  await appendGradedSelectionOutcome({
    learnerStateRef: "L1", item, chosenId: "option-correct", keyedCorrectId: "option-correct", responseSource: "human", responseLog: log.store
  });

  const nodeRows = (await log.store.listForLearner("L1")).filter((r) => r.derivedNodeId === "node-1");
  assert.equal(foldConceptMastery(nodeRows), 1, "the latest graded(auto) correct masters the node");
});

test("the store assigns monotonic attemptSeq across a learner's appends; the caller supplies none", async () => {
  const log = fakeResponseLog();
  await appendGradedSelectionOutcome({ learnerStateRef: "L1", item, chosenId: "a", keyedCorrectId: "a", responseSource: "human", responseLog: log.store });
  await appendGradedSelectionOutcome({ learnerStateRef: "L1", item, chosenId: "b", keyedCorrectId: "a", responseSource: "human", responseLog: log.store });
  const seqs = (await log.store.listForLearner("L1")).map((r) => r.attemptSeq);
  assert.deepEqual(seqs, [1, 2]);
});

test("responseSource is passed through verbatim for both human and synthetic", async () => {
  const log = fakeResponseLog();
  const human = await appendGradedSelectionOutcome({ learnerStateRef: "L1", item, chosenId: "a", keyedCorrectId: "a", responseSource: "human", responseLog: log.store });
  const synthetic = await appendGradedSelectionOutcome({ learnerStateRef: "L2", item, chosenId: "a", keyedCorrectId: "a", responseSource: "synthetic", responseLog: log.store });
  assert.equal(human.row.responseSource, "human");
  assert.equal(synthetic.row.responseSource, "synthetic");
});

test("Covers AE4: the shared grader serves impostor selection — picking the impostor scores 1, a truth scores 0", async () => {
  const log = fakeResponseLog();
  const impostorItem = { studyItemId: "imp-1", derivedNodeId: "node-1" };
  // The keyed-correct id for an impostor is the impostor statement id (resolved server-side).
  const hit = await appendGradedSelectionOutcome({
    learnerStateRef: "L1", item: impostorItem, chosenId: "stmt-impostor", keyedCorrectId: "stmt-impostor", responseSource: "human", responseLog: log.store
  });
  const miss = await appendGradedSelectionOutcome({
    learnerStateRef: "L2", item: impostorItem, chosenId: "stmt-truth", keyedCorrectId: "stmt-impostor", responseSource: "human", responseLog: log.store
  });
  assert.equal(hit.row.judgedOutcome, "correct");
  assert.equal(hit.row.gradedScore, 1);
  assert.equal(miss.row.judgedOutcome, "incorrect");
  assert.equal(miss.row.gradedScore, 0);
});

test("appendGradedSelectionOutcome imports no graph or enrichment write port", () => {
  const source = readFileSync(new URL("./gradedSelectionOutcome.ts", import.meta.url), "utf8");
  assert.equal(/GraphVersionStorePort|EnrichmentRunStorePort/.test(source), false);
});
