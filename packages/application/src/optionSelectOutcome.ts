import { randomUUID } from "node:crypto";
import type { JudgedOutcome, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { GRADED_EVIDENCE_WEIGHT } from "./measurement";

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
  const attemptSeq = await input.responseLog.nextAttemptSeq(input.learnerStateRef);
  const row: NewResponseLogRow = {
    responseId: randomUUID(),
    learnerStateRef: input.learnerStateRef,
    studyItemId: input.item.studyItemId,
    derivedNodeId: input.item.derivedNodeId,
    signalType: "graded",
    selfReportRating: null,
    judgedOutcome,
    gradedScore,
    evidenceWeight: GRADED_EVIDENCE_WEIGHT,
    responseSource: input.responseSource,
    graderIdentity: AUTO_GRADER_IDENTITY,
    batchId: null,
    attemptSeq,
    submittedAnswer: null
  };
  await input.responseLog.append([row]);
  return { row };
}
