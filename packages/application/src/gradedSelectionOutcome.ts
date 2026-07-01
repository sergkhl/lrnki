import { randomUUID } from "node:crypto";
import type { JudgedOutcome, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";

export const AUTO_GRADER_IDENTITY = "auto";

// One grading-neutral keyed-selection grader shared by every auto-graded selection item type
// (KTD6, rule 18): option-select keys the correct option, impostor keys the planted lie. The
// caller resolves the keyed-correct id server-side, never trusting a client-sent key. A match
// is `correct`/score 1, a miss `incorrect`/score 0. Provenance-agnostic — the discriminant is
// just two ids — so a new selection type reuses this unchanged.
function outcomeFor(input: { chosenId: string; keyedCorrectId: string }): { judgedOutcome: JudgedOutcome; gradedScore: number } {
  return input.chosenId === input.keyedCorrectId
    ? { judgedOutcome: "correct", gradedScore: 1 }
    : { judgedOutcome: "incorrect", gradedScore: 0 };
}

export async function appendGradedSelectionOutcome(input: {
  learnerStateRef: string;
  item: { studyItemId: string; derivedNodeId: string };
  chosenId: string;
  keyedCorrectId: string;
  responseSource: ResponseSource;
  responseLog: ResponseLogStorePort;
}): Promise<{ row: NewResponseLogRow }> {
  const { judgedOutcome, gradedScore } = outcomeFor(input);
  // `attempt_seq` is allocated by the store inside `append`, atomically per learner — the
  // caller never computes it, so concurrent same-learner submissions cannot race it.
  const row: NewResponseLogRow = {
    responseId: randomUUID(),
    learnerStateRef: input.learnerStateRef,
    studyItemId: input.item.studyItemId,
    derivedNodeId: input.item.derivedNodeId,
    signalType: "graded",
    judgedOutcome,
    gradedScore,
    responseSource: input.responseSource,
    graderIdentity: AUTO_GRADER_IDENTITY,
    batchId: null,
    submittedAnswer: null
  };
  await input.responseLog.append([row]);
  return { row };
}
