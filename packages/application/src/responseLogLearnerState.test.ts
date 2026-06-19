import assert from "node:assert/strict";
import test from "node:test";
import type { ResponseLogRow, SelfReportRating, JudgedOutcome } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { foldConceptMastery, loadResponseLogLearnerState, outcomeToMastery, ratingToMastery } from "./responseLogLearnerState";

let seq = 0;
function selfReport(conceptId: string, rating: SelfReportRating): ResponseLogRow {
  return { responseId: `r${seq}`, learnerStateRef: "L1", cardId: `card-${conceptId}`, conceptId, signalType: "self_report", selfReportRating: rating, judgedOutcome: null, gradedScore: null, evidenceWeight: 0.3, responseSource: "synthetic", graderIdentity: null, batchId: "b", attemptSeq: ++seq, submittedAnswer: null, createdAt: new Date().toISOString() };
}
function graded(conceptId: string, outcome: JudgedOutcome, score: number): ResponseLogRow {
  return { responseId: `r${seq}`, learnerStateRef: "L1", cardId: `card-${conceptId}`, conceptId, signalType: "graded", selfReportRating: null, judgedOutcome: outcome, gradedScore: score, evidenceWeight: 1, responseSource: "synthetic", graderIdentity: "kg-independent-judge", attemptSeq: ++seq, batchId: null, submittedAnswer: "a", createdAt: new Date().toISOString() };
}

test("anki ratings and graded outcomes map to the documented mastery values", () => {
  assert.deepEqual([ratingToMastery("again"), ratingToMastery("hard"), ratingToMastery("good"), ratingToMastery("easy")], [0, 0.33, 0.7, 1.0]);
  assert.deepEqual([outcomeToMastery("incorrect"), outcomeToMastery("partial"), outcomeToMastery("correct")], [0, 0.5, 1.0]);
});

test("a graded incorrect row outranks a LATER self_report good (Covers AE1, R11)", () => {
  // rows are in attempt_seq order; the self_report is more recent than the graded.
  const mastery = foldConceptMastery([graded("c", "incorrect", 0), selfReport("c", "good")]);
  assert.equal(mastery, 0, "graded outranks self-report regardless of recency");
});

test("with only self_report rows, the more recent rating wins (recency)", () => {
  assert.equal(foldConceptMastery([selfReport("c", "again"), selfReport("c", "good")]), 0.7);
  assert.equal(foldConceptMastery([selfReport("c", "good"), selfReport("c", "again")]), 0);
});

test("among multiple graded rows, the latest graded wins", () => {
  assert.equal(foldConceptMastery([graded("c", "correct", 1), graded("c", "partial", 0.5)]), 0.5);
});

test("loadResponseLogLearnerState resolves concept_id to derived_node_id; an unanchored concept defaults to 0", async () => {
  const rows: ResponseLogRow[] = [selfReport("cA", "good"), graded("cB", "correct", 1), selfReport("cGhost", "easy")];
  const store: ResponseLogStorePort = {
    async append() {},
    async listForLearner() { return rows; },
    async listForLearnerConcept() { return rows; },
    async nextAttemptSeq() { return 1; }
  };
  // cA -> nA, cB -> nB; cGhost has no anchor in this enrichment.
  const resolver = (conceptId: string) => ({ cA: "nA", cB: "nB" } as Record<string, string>)[conceptId];
  const state = await loadResponseLogLearnerState({ responseLog: store, learnerStateRef: "L1", conceptToNodeResolver: resolver });

  assert.equal(state.mastery("nA"), 0.7);
  assert.equal(state.mastery("nB"), 1.0);
  assert.equal(state.mastery("nGhost"), 0, "unresolved/unanchored concept is unmastered by default");
  assert.equal(state.learnerStateRef, "L1");
});
