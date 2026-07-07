"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  checkMatchingAttempt,
  gradeStudyResponse,
  recordLearnerVerdict,
  recordLessonRead,
  type GradeRefusalReason,
  type MatchingAttemptTrace
} from "@lrnki/application";
import type { Verdict } from "@lrnki/domain-core";
import {
  PostgresCalibrationVerdictStore,
  PostgresEnrichmentInspectionRead,
  PostgresLessonReadStore,
  PostgresLearnerExpeditionStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { wakeTopicGenerationSupervisor } from "@/lib/topicGenerationSupervisor";
import { clearLearnerRefCookie } from "@/lib/learnerSession";

export type LearnerGradingResult =
  | { kind: "selection"; graded: true; chosenId: string; keyedCorrectId: string; correct: boolean }
  | { kind: "selection"; graded: false; message: string };

export type LearnerMatchingResult =
  | { kind: "matching"; graded: true; correct: boolean; correctFirstTry: number; pairCount: number }
  | { kind: "matching"; graded: false; message: string };

export type LearnerMatchingAttemptResult =
  | { checked: true; correct: boolean }
  | { checked: false; message: string };

function learnerPath(): string {
  return "/learn";
}

function expeditionPath(enrichmentId: string): string {
  return `/learn/expedition/${encodeURIComponent(enrichmentId)}`;
}

async function withSqlClient<T>(fn: (sql: ReturnType<typeof createDatabaseClient>) => Promise<T>): Promise<T> {
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function withExpeditionStore<T>(fn: (store: PostgresLearnerExpeditionStore) => Promise<T>): Promise<T> {
  return withSqlClient((sql) => fn(new PostgresLearnerExpeditionStore(sql)));
}

export async function chooseCandidateExpedition(input: {
  learnerStateRef: string;
  enrichmentId: string;
  title: string;
  declaredDomain: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.enrichmentId) return;
  await withExpeditionStore(async (store) => {
    const existing = await store.getByEnrichment({
      learnerStateRef: input.learnerStateRef,
      enrichmentId: input.enrichmentId
    });
    const learnerExpeditionId = existing?.learnerExpeditionId ?? randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef: input.learnerStateRef,
      kind: "topic",
      title: input.title,
      declaredDomain: input.declaredDomain,
      status: "ready",
      enrichmentId: input.enrichmentId,
      active: true
    });
  });
  revalidatePath(learnerPath());
  redirect(expeditionPath(input.enrichmentId) as Route);
}

export async function setActiveExpedition(input: {
  learnerStateRef: string;
  learnerExpeditionId: string;
  enrichmentId?: string | null;
}): Promise<void> {
  if (!input.learnerStateRef || !input.learnerExpeditionId) return;
  await withExpeditionStore((store) => store.setActive(input));
  revalidatePath(learnerPath());
  if (input.enrichmentId) redirect(expeditionPath(input.enrichmentId) as Route);
}

// The two learner-facing copy strings the grading surface renders (ADR-0033 keeps themed copy in
// the UI). The use-case returns reason codes; only `invalid_input` maps to "could not be recorded"
// — every other refusal collapses to the reopen prompt, preserving the pre-refactor messages the
// single-join queries produced.
function gradingMessage(refused: GradeRefusalReason, invalidCopy: string): string {
  return refused === "invalid_input"
    ? invalidCopy
    : "This expedition is no longer active. Return to the expedition list and reopen it.";
}

export async function submitLearnerOptionSelect(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  chosenOptionId: string;
}): Promise<LearnerGradingResult> {
  const result = await withSqlClient((sql) =>
    gradeStudyResponse(
      { learnerStateRef: input.learnerStateRef, enrichmentId: input.enrichmentId, studyItemId: input.studyItemId, submission: { itemType: "option_select", chosenOptionId: input.chosenOptionId } },
      { expeditionStore: new PostgresLearnerExpeditionStore(sql), studyItemStore: new PostgresStudyItemBankStore(sql), responseLog: new PostgresResponseLogStore(sql) }
    )
  );
  if (!result.graded) return { kind: "selection", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") };
  const { outcome } = result;
  if (outcome.kind !== "selection") return { kind: "selection", graded: false, message: "This answer could not be recorded." };
  return { kind: "selection", graded: true, chosenId: outcome.chosenId, keyedCorrectId: outcome.keyedCorrectId, correct: outcome.correct };
}

export async function submitLearnerImpostor(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  chosenStatementId: string;
}): Promise<LearnerGradingResult> {
  const result = await withSqlClient((sql) =>
    gradeStudyResponse(
      { learnerStateRef: input.learnerStateRef, enrichmentId: input.enrichmentId, studyItemId: input.studyItemId, submission: { itemType: "impostor", chosenStatementId: input.chosenStatementId } },
      { expeditionStore: new PostgresLearnerExpeditionStore(sql), studyItemStore: new PostgresStudyItemBankStore(sql), responseLog: new PostgresResponseLogStore(sql) }
    )
  );
  if (!result.graded) return { kind: "selection", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") };
  const { outcome } = result;
  if (outcome.kind !== "selection") return { kind: "selection", graded: false, message: "This answer could not be recorded." };
  return { kind: "selection", graded: true, chosenId: outcome.chosenId, keyedCorrectId: outcome.keyedCorrectId, correct: outcome.correct };
}

export async function submitLearnerMatching(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  trace: MatchingAttemptTrace;
}): Promise<LearnerMatchingResult> {
  const result = await withSqlClient((sql) =>
    gradeStudyResponse(
      { learnerStateRef: input.learnerStateRef, enrichmentId: input.enrichmentId, studyItemId: input.studyItemId, submission: { itemType: "matching", trace: input.trace } },
      { expeditionStore: new PostgresLearnerExpeditionStore(sql), studyItemStore: new PostgresStudyItemBankStore(sql), responseLog: new PostgresResponseLogStore(sql) }
    )
  );
  if (!result.graded) return { kind: "matching", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") };
  const { outcome } = result;
  if (outcome.kind !== "matching") return { kind: "matching", graded: false, message: "This answer could not be recorded." };
  return { kind: "matching", graded: true, correct: outcome.correct, correctFirstTry: outcome.correctFirstTry, pairCount: outcome.pairCount };
}

export async function validateLearnerMatchingAttempt(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  promptId: string;
  matchId: string;
}): Promise<LearnerMatchingAttemptResult> {
  const result = await withSqlClient((sql) =>
    checkMatchingAttempt(input, { expeditionStore: new PostgresLearnerExpeditionStore(sql), studyItemStore: new PostgresStudyItemBankStore(sql) })
  );
  if (!result.checked) {
    return {
      checked: false,
      message: result.refused === "invalid_input"
        ? "This match could not be checked."
        : "This expedition is no longer active. Return to the expedition list and reopen it."
    };
  }
  return { checked: true, correct: result.correct };
}

export async function setLearnerVerdict(input: {
  learnerStateRef: string;
  enrichmentId: string;
  derivedNodeId: string;
  verdict: Verdict;
}): Promise<void> {
  await withSqlClient((sql) =>
    recordLearnerVerdict(input, {
      expeditionStore: new PostgresLearnerExpeditionStore(sql),
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      verdictStore: new PostgresCalibrationVerdictStore(sql)
    })
  );
  revalidatePath(expeditionPath(input.enrichmentId));
}

export async function clearLearnerVerdict(input: {
  learnerStateRef: string;
  enrichmentId: string;
  derivedNodeId: string;
}): Promise<void> {
  await withSqlClient((sql) =>
    recordLearnerVerdict({ ...input, verdict: "learn" }, {
      expeditionStore: new PostgresLearnerExpeditionStore(sql),
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      verdictStore: new PostgresCalibrationVerdictStore(sql)
    })
  );
  revalidatePath(expeditionPath(input.enrichmentId));
}

export async function markLearnerLessonRead(input: {
  learnerStateRef: string;
  enrichmentId: string;
  derivedNodeId: string;
}): Promise<void> {
  await withSqlClient((sql) =>
    recordLessonRead(input, {
      expeditionStore: new PostgresLearnerExpeditionStore(sql),
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      lessonReadStore: new PostgresLessonReadStore(sql)
    })
  );
  revalidatePath(expeditionPath(input.enrichmentId));
}

export async function refreshLearnerExpedition(input: {
  learnerStateRef: string;
  enrichmentId: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.enrichmentId) return;
  revalidatePath(expeditionPath(input.enrichmentId));
}

export async function switchLearner(): Promise<void> {
  await clearLearnerRefCookie();
  revalidatePath(learnerPath());
  redirect("/learn" as Route);
}

export async function startTopicExpedition(formData: FormData): Promise<void> {
  const learnerStateRef = String(formData.get("learnerStateRef") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  if (!learnerStateRef || !topic) return;
  const learnerExpeditionId = randomUUID();
  await withExpeditionStore((store) => store.upsert({
    learnerExpeditionId,
    learnerStateRef,
    kind: "topic",
    title: topic,
    declaredDomain: null,
    status: "generating",
    active: true
  }));
  wakeTopicGenerationSupervisor();
  revalidatePath(learnerPath());
}

export async function retryTopicExpedition(input: {
  learnerStateRef: string;
  learnerExpeditionId: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.learnerExpeditionId) return;
  await withExpeditionStore((store) => store.resetGeneration(input));
  wakeTopicGenerationSupervisor();
  revalidatePath(learnerPath());
}
