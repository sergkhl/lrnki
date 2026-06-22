import { randomUUID } from "node:crypto";
import type { JudgedOutcome, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, ResponseLogStorePort } from "@lrnki/ports";

// Measurement mode (U5, R4/R9). A free-form written answer is graded against the
// studyItem's answer-key by the cross-family judge, producing one `graded` row at the
// higher evidence weight, recording the judge model as the grader identity. The
// judge proposes; this deterministic transform maps its verdict into an immutable
// append — the only thing tests assert (AGENTS rule 11).
export const GRADED_EVIDENCE_WEIGHT = 1.0;

export async function gradeAndAppend(input: {
  learnerStateRef: string;
  studyItem: { studyItemId: string; derivedNodeId: string; question: string; answerKey: string };
  declaredDomain: string;
  submittedAnswer: string;
  judge: AnswerGradingJudgePort;
  responseLog: ResponseLogStorePort;
  responseSource: ResponseSource;
}): Promise<{ row: NewResponseLogRow; judgment: { outcome: JudgedOutcome; score: number; rationale: string } }> {
  const judgment = await input.judge.grade({
    declaredDomain: input.declaredDomain,
    question: input.studyItem.question,
    answerKey: input.studyItem.answerKey,
    submittedAnswer: input.submittedAnswer
  });

  const attemptSeq = await input.responseLog.nextAttemptSeq(input.learnerStateRef);
  const row: NewResponseLogRow = {
    responseId: randomUUID(),
    learnerStateRef: input.learnerStateRef,
    studyItemId: input.studyItem.studyItemId,
    derivedNodeId: input.studyItem.derivedNodeId,
    signalType: "graded",
    selfReportRating: null,
    judgedOutcome: judgment.outcome,
    gradedScore: judgment.score,
    evidenceWeight: GRADED_EVIDENCE_WEIGHT,
    responseSource: input.responseSource,
    graderIdentity: input.judge.model,
    batchId: null,
    attemptSeq,
    submittedAnswer: input.submittedAnswer
  };
  await input.responseLog.append([row]);
  return { row, judgment };
}
