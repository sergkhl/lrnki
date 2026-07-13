import assert from "node:assert/strict";
import test from "node:test";
import type { NeutralResponseLogRow, ResponseLogRow, JudgedOutcome } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { foldConceptMastery, loadResponseLogLearnerState, outcomeToMastery } from "./responseLogLearnerState";

let seq = 0;
function graded(derivedNodeId: string, outcome: JudgedOutcome, score: number): NeutralResponseLogRow {
  return { responseId: `r${seq}`, learnerStateRef: "L1", scope: "neutral", studyItemId: `studyItem-${derivedNodeId}`, derivedNodeId, signalType: "graded", judgedOutcome: outcome, gradedScore: score, responseSource: "synthetic", graderIdentity: "kg-independent-judge", attemptSeq: ++seq, batchId: null, submittedAnswer: "a", createdAt: new Date().toISOString() };
}

test("graded outcomes map to the documented mastery values", () => {
  assert.deepEqual([outcomeToMastery("incorrect"), outcomeToMastery("partial"), outcomeToMastery("correct")], [0, 0.5, 1.0]);
});

test("a node with no graded rows folds to 0", () => {
  assert.equal(foldConceptMastery([]), 0);
});

test("among multiple graded rows, the latest graded wins", () => {
  assert.equal(foldConceptMastery([graded("c", "correct", 1), graded("c", "partial", 0.5)]), 0.5);
  assert.equal(foldConceptMastery([graded("c", "incorrect", 0), graded("c", "correct", 1)]), 1.0);
});

test("loadResponseLogLearnerState folds graded rows directly by derived_node_id", async () => {
  const rows: ResponseLogRow[] = [graded("nA", "partial", 0.5), graded("nB", "correct", 1)];
  const store: ResponseLogStorePort = {
    async append() {},
    async listForLearner() { return rows; },
    async listForLearnerNode() { return rows; }
  };
  const state = await loadResponseLogLearnerState({ responseLog: store, learnerStateRef: "L1" });

  assert.equal(state.mastery("nA"), 0.5);
  assert.equal(state.mastery("nB"), 1.0);
  assert.equal(state.mastery("nMissing"), 0, "missing node is unmastered by default");
  assert.equal(state.learnerStateRef, "L1");
});
