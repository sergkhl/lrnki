import { randomUUID } from "node:crypto";
import type { JudgedOutcome, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { GRADED_EVIDENCE_WEIGHT } from "./measurement";

// Self-assessed recall (KTD1, R6). A learner reveals a card's answer and marks "got
// it" / "missed it" — a deterministic, JUDGE-FREE append that records the outcome as
// one `graded` row under the `self` grader identity. It mirrors `gradeAndAppend`'s row
// shape minus the LLM call: there is no submitted answer to grade, so the outcome maps
// straight to a judged outcome + score. This is the rule-11 deterministic envelope (the
// only thing tests assert). Self-grades reuse `GRADED_EVIDENCE_WEIGHT` and are
// distinguished from judge-grades by `graderIdentity` alone, so the mastery fold stays
// uniform (graded outranks self-report; latest graded wins). No graph write port is
// imported — this cannot mutate a published graph or the Derived Graph Layer (R16).

export const SELF_GRADER_IDENTITY = "self";

export type SelfAssessmentOutcome = "got_it" | "missed_it";

// "Got it" is a clean recall (correct / 1.0); "missed it" is a miss (incorrect / 0).
// There is no partial outcome for self-assessment — the learner reports a binary recall.
function outcomeFor(outcome: SelfAssessmentOutcome): { judgedOutcome: JudgedOutcome; gradedScore: number } {
  return outcome === "got_it"
    ? { judgedOutcome: "correct", gradedScore: 1 }
    : { judgedOutcome: "incorrect", gradedScore: 0 };
}

export async function appendSelfAssessedGrade(input: {
  learnerStateRef: string;
  card: { cardId: string; derivedNodeId: string };
  outcome: SelfAssessmentOutcome;
  responseSource: ResponseSource;
  responseLog: ResponseLogStorePort;
}): Promise<{ row: NewResponseLogRow }> {
  const { judgedOutcome, gradedScore } = outcomeFor(input.outcome);
  const attemptSeq = await input.responseLog.nextAttemptSeq(input.learnerStateRef);
  const row: NewResponseLogRow = {
    responseId: randomUUID(),
    learnerStateRef: input.learnerStateRef,
    cardId: input.card.cardId,
    derivedNodeId: input.card.derivedNodeId,
    signalType: "graded",
    selfReportRating: null,
    judgedOutcome,
    gradedScore,
    evidenceWeight: GRADED_EVIDENCE_WEIGHT,
    responseSource: input.responseSource,
    graderIdentity: SELF_GRADER_IDENTITY,
    batchId: null,
    attemptSeq,
    submittedAnswer: null
  };
  await input.responseLog.append([row]);
  return { row };
}
