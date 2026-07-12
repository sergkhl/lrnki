import { randomUUID } from "node:crypto";
import type { JudgedOutcome, MatchingItem, NewResponseLogRow, ResponseSource } from "@lrnki/domain-core";
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

// Shared response-log row scaffolding for every auto-graded item type (rule 18): only the
// judged outcome/score and the submitted-answer payload vary by type. `attempt_seq` is
// allocated by the store inside `append`, atomically per learner — the caller never computes
// it, so concurrent same-learner submissions cannot race it.
function buildResponseLogRow(
  common: { learnerStateRef: string; studyItemId: string; derivedNodeId: string; responseSource: ResponseSource },
  outcome: { judgedOutcome: JudgedOutcome; gradedScore: number; submittedAnswer: string | null }
): NewResponseLogRow {
  return {
    responseId: randomUUID(),
    learnerStateRef: common.learnerStateRef,
    scope: "neutral",
    studyItemId: common.studyItemId,
    derivedNodeId: common.derivedNodeId,
    signalType: "graded",
    judgedOutcome: outcome.judgedOutcome,
    gradedScore: outcome.gradedScore,
    responseSource: common.responseSource,
    graderIdentity: AUTO_GRADER_IDENTITY,
    batchId: null,
    submittedAnswer: outcome.submittedAnswer
  };
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
  const row = buildResponseLogRow(
    { learnerStateRef: input.learnerStateRef, studyItemId: input.item.studyItemId, derivedNodeId: input.item.derivedNodeId, responseSource: input.responseSource },
    { judgedOutcome, gradedScore, submittedAnswer: null }
  );
  await input.responseLog.append([row]);
  return { row };
}

export type MatchingAttemptTrace = { promptId: string; chosenMatchId: string }[];

export async function appendGradedMatchingOutcome(input: {
  learnerStateRef: string;
  item: MatchingItem;
  trace: MatchingAttemptTrace;
  responseSource: ResponseSource;
  responseLog: ResponseLogStorePort;
}): Promise<{ row: NewResponseLogRow; correctFirstTry: number; pairCount: number }> {
  const keyed = new Map(input.item.pairs.map((pair) => [pair.pairId, pair.matchId] as const));
  const firstAttemptByPrompt = new Map<string, string>();
  for (const attempt of input.trace) {
    if (!firstAttemptByPrompt.has(attempt.promptId)) firstAttemptByPrompt.set(attempt.promptId, attempt.chosenMatchId);
  }
  let correctFirstTry = 0;
  for (const pair of input.item.pairs) {
    if (firstAttemptByPrompt.get(pair.pairId) === keyed.get(pair.pairId)) correctFirstTry += 1;
  }
  const pairCount = input.item.pairs.length;
  const gradedScore = pairCount === 0 ? 0 : correctFirstTry / pairCount;
  const judgedOutcome: JudgedOutcome = correctFirstTry === pairCount ? "correct" : "partial";
  const row = buildResponseLogRow(
    { learnerStateRef: input.learnerStateRef, studyItemId: input.item.studyItemId, derivedNodeId: input.item.derivedNodeId, responseSource: input.responseSource },
    { judgedOutcome, gradedScore, submittedAnswer: JSON.stringify(input.trace) }
  );
  await input.responseLog.append([row]);
  return { row, correctFirstTry, pairCount };
}
