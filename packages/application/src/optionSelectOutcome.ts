import { randomUUID } from "node:crypto";
import type { JudgedOutcome, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";

export const AUTO_GRADER_IDENTITY = "auto";

function outcomeFor(input: { chosenOptionId: string; correctOptionId: string }): { judgedOutcome: JudgedOutcome; gradedScore: number } {
  return input.chosenOptionId === input.correctOptionId
    ? { judgedOutcome: "correct", gradedScore: 1 }
    : { judgedOutcome: "incorrect", gradedScore: 0 };
}

export async function appendOptionSelectOutcome(input: {
  learnerStateRef: string;
  item: { studyItemId: string; derivedNodeId: string };
  chosenOptionId: string;
  correctOptionId: string;
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
