import type { MatchingAttemptTrace } from "@lrnki/application/projection";
import type { Verdict } from "@lrnki/domain-core";
import { api, queryClient } from "./api";
import type { LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult } from "./api";

export type { LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult };

// The SPA replacement for the deleted server actions: same names and result shapes, but
// every call is a typed API request and identity comes from the bearer token (R2) — no
// learnerStateRef leaves the client. `refreshLearnerExpedition` becomes Query
// invalidation, the SPA's `revalidatePath`.

export async function refreshLearnerExpedition(input: { enrichmentId: string }): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["expedition", input.enrichmentId] }),
    queryClient.invalidateQueries({ queryKey: ["journal"] })
  ]);
}

export async function refreshJournal(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["journal"] });
}

export async function chooseCandidateExpedition(input: { enrichmentId: string; title: string; declaredDomain: string }): Promise<void> {
  await api.expedition.choose.$post({ json: input });
  await refreshJournal();
}

export async function setActiveExpedition(input: { learnerExpeditionId: string; enrichmentId?: string | null }): Promise<void> {
  await api.expedition.activate.$post({ json: { learnerExpeditionId: input.learnerExpeditionId, enrichmentId: input.enrichmentId } });
  await refreshJournal();
}

export async function startTopicExpedition(input: { topic: string }): Promise<void> {
  await api.expedition.start.$post({ json: input });
  await refreshJournal();
}

export async function retryTopicExpedition(input: { learnerExpeditionId: string }): Promise<void> {
  await api.expedition.retry.$post({ json: input });
  await refreshJournal();
}

export async function submitLearnerOptionSelect(input: { enrichmentId: string; studyItemId: string; chosenOptionId: string }): Promise<LearnerGradingResult> {
  const res = await api.study["option-select"].$post({ json: input });
  return (await res.json()) as LearnerGradingResult;
}

export async function submitLearnerImpostor(input: { enrichmentId: string; studyItemId: string; chosenStatementId: string }): Promise<LearnerGradingResult> {
  const res = await api.study.impostor.$post({ json: input });
  return (await res.json()) as LearnerGradingResult;
}

export async function submitLearnerMatching(input: { enrichmentId: string; studyItemId: string; trace: MatchingAttemptTrace }): Promise<LearnerMatchingResult> {
  const res = await api.study.matching.$post({ json: input });
  return (await res.json()) as LearnerMatchingResult;
}

export async function validateLearnerMatchingAttempt(input: { enrichmentId: string; studyItemId: string; promptId: string; matchId: string }): Promise<LearnerMatchingAttemptResult> {
  const res = await api.study["matching-attempt"].$post({ json: input });
  return (await res.json()) as LearnerMatchingAttemptResult;
}

export async function setLearnerVerdict(input: { enrichmentId: string; derivedNodeId: string; verdict: Verdict }): Promise<void> {
  await api.study.verdict.$post({ json: input });
}

// Clearing a verdict IS recording "learn" — same route, same semantics as before.
export async function clearLearnerVerdict(input: { enrichmentId: string; derivedNodeId: string }): Promise<void> {
  await api.study.verdict.$post({ json: { ...input, verdict: "learn" } });
}

export async function markLearnerLessonRead(input: { enrichmentId: string; derivedNodeId: string }): Promise<void> {
  await api.study["lesson-read"].$post({ json: input });
}

export async function gradeDuelAnswerAction(input: {
  studyItemId: string;
  submission: { itemType: "option_select"; chosenOptionId: string } | { itemType: "impostor"; chosenStatementId: string };
}) {
  const res = await api.duel.grade.$post({ json: input });
  return (await res.json()) as import("@lrnki/application/projection").GradeDuelAnswerResult;
}

export async function recordDuelWinAction(input: { duelId: string }): Promise<void> {
  await api.duel.win.$post({ json: input });
}

// --- Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U5) ----------------------------
// A term source is a lesson section (keyed by its node) or a question stem (keyed by the item);
// both resolve to the parent Concept Marker server-side. Identity comes from the bearer token.
export type ScaffoldTermSource =
  | { kind: "lesson"; derivedNodeId: string }
  | { kind: "study_item"; studyItemId: string };

export type RequestScaffoldOutcome =
  | { created: true; detourId: string; status: "generating" | "ready" | "failed" | "hidden" }
  | { created: false; reason: string };

export async function requestScaffoldDetour(input: { enrichmentId: string; source: ScaffoldTermSource; term: string }): Promise<RequestScaffoldOutcome> {
  const res = await api.scaffold.request.$post({ json: input });
  const body = (await res.json()) as RequestScaffoldOutcome;
  if (res.ok && body.created) await refreshLearnerExpedition({ enrichmentId: input.enrichmentId });
  return body;
}

export async function retryScaffoldDetour(input: { enrichmentId: string; detourId: string }): Promise<void> {
  await api.scaffold.retry.$post({ json: { detourId: input.detourId } });
  await refreshLearnerExpedition({ enrichmentId: input.enrichmentId });
}

export async function hideScaffoldDetour(input: { enrichmentId: string; detourId: string }): Promise<void> {
  await api.scaffold.hide.$post({ json: { detourId: input.detourId } });
  await refreshLearnerExpedition({ enrichmentId: input.enrichmentId });
}

export async function submitScaffoldOptionSelect(input: { enrichmentId: string; scaffoldStepId: string; chosenOptionId: string }): Promise<LearnerGradingResult> {
  const res = await api.scaffold["option-select"].$post({ json: { scaffoldStepId: input.scaffoldStepId, chosenOptionId: input.chosenOptionId } });
  const result = (await res.json()) as LearnerGradingResult;
  await refreshLearnerExpedition({ enrichmentId: input.enrichmentId });
  return result;
}

export async function markScaffoldLessonRead(input: { enrichmentId: string; scaffoldStepId: string }): Promise<void> {
  await api.scaffold["lesson-read"].$post({ json: { scaffoldStepId: input.scaffoldStepId } });
  await refreshLearnerExpedition({ enrichmentId: input.enrichmentId });
}
