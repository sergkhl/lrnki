"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { appendGradedSelectionOutcome } from "@lrnki/application";
import type { Verdict } from "@lrnki/domain-core";
import {
  PostgresCalibrationVerdictStore,
  PostgresLessonReadStore,
  PostgresLearnerExpeditionStore,
  PostgresResponseLogStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { inferDeclaredDomain, startTopicChart } from "@/lib/learnerCharting";

export type LearnerGradingResult =
  | { graded: true; chosenId: string; keyedCorrectId: string; correct: boolean }
  | { graded: false; message: string };

function learnerPath(learnerStateRef: string): string {
  return `/learn/${encodeURIComponent(learnerStateRef)}`;
}

function expeditionPath(learnerStateRef: string, enrichmentId: string): string {
  return `${learnerPath(learnerStateRef)}/expedition/${encodeURIComponent(enrichmentId)}`;
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
  targetDerivedNodeId: string;
  title: string;
  declaredDomain: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.enrichmentId || !input.targetDerivedNodeId) return;
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
      targetDerivedNodeId: input.targetDerivedNodeId,
      active: true
    });
  });
  revalidatePath(learnerPath(input.learnerStateRef));
  redirect(expeditionPath(input.learnerStateRef, input.enrichmentId) as Route);
}

export async function setActiveExpedition(input: {
  learnerStateRef: string;
  learnerExpeditionId: string;
  enrichmentId?: string | null;
}): Promise<void> {
  if (!input.learnerStateRef || !input.learnerExpeditionId) return;
  await withExpeditionStore((store) => store.setActive(input));
  revalidatePath(learnerPath(input.learnerStateRef));
  if (input.enrichmentId) redirect(expeditionPath(input.learnerStateRef, input.enrichmentId) as Route);
}

export async function submitLearnerOptionSelect(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  chosenOptionId: string;
}): Promise<LearnerGradingResult> {
  const { learnerStateRef, enrichmentId, studyItemId, chosenOptionId } = input;
  if (!learnerStateRef || !enrichmentId || !studyItemId || !chosenOptionId) {
    return { graded: false, message: "This answer could not be recorded." };
  }

  return withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string; correct_option_id: string }[]>`
      SELECT si.derived_node_id, sio.option_id AS correct_option_id
      FROM study_items si
      JOIN learner_expeditions le
        ON le.learner_state_ref = ${learnerStateRef}
       AND le.enrichment_id = si.enrichment_id
       AND le.status = 'ready'
       AND le.active
      JOIN study_item_options chosen
        ON chosen.study_item_id = si.study_item_id
       AND chosen.option_id = ${chosenOptionId}
      JOIN study_item_options sio ON sio.study_item_id = si.study_item_id AND sio.is_correct
      WHERE si.study_item_id = ${studyItemId}
        AND si.enrichment_id = ${enrichmentId}
        AND si.item_type = 'option_select'
        AND si.superseded_at IS NULL
      LIMIT 1`;
    if (rows.length === 0) {
      return { graded: false, message: "This expedition is no longer active. Return to the expedition list and reopen it." };
    }
    await appendGradedSelectionOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: rows[0].derived_node_id },
      chosenId: chosenOptionId,
      keyedCorrectId: rows[0].correct_option_id,
      responseSource: "human",
      responseLog: new PostgresResponseLogStore(sql)
    });
    return {
      graded: true,
      chosenId: chosenOptionId,
      keyedCorrectId: rows[0].correct_option_id,
      correct: chosenOptionId === rows[0].correct_option_id
    };
  });
}

export async function submitLearnerImpostor(input: {
  learnerStateRef: string;
  enrichmentId: string;
  studyItemId: string;
  chosenStatementId: string;
}): Promise<LearnerGradingResult> {
  const { learnerStateRef, enrichmentId, studyItemId, chosenStatementId } = input;
  if (!learnerStateRef || !enrichmentId || !studyItemId || !chosenStatementId) {
    return { graded: false, message: "This answer could not be recorded." };
  }

  return withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string; impostor_statement_id: string }[]>`
      SELECT si.derived_node_id, ist.impostor_statement_id
      FROM study_items si
      JOIN learner_expeditions le
        ON le.learner_state_ref = ${learnerStateRef}
       AND le.enrichment_id = si.enrichment_id
       AND le.status = 'ready'
       AND le.active
      JOIN impostor_statements chosen
        ON chosen.study_item_id = si.study_item_id
       AND chosen.impostor_statement_id = ${chosenStatementId}
      JOIN impostor_statements ist ON ist.study_item_id = si.study_item_id AND ist.is_impostor
      WHERE si.study_item_id = ${studyItemId}
        AND si.enrichment_id = ${enrichmentId}
        AND si.item_type = 'impostor'
        AND si.superseded_at IS NULL
      LIMIT 1`;
    if (rows.length === 0) {
      return { graded: false, message: "This expedition is no longer active. Return to the expedition list and reopen it." };
    }
    await appendGradedSelectionOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: rows[0].derived_node_id },
      chosenId: chosenStatementId,
      keyedCorrectId: rows[0].impostor_statement_id,
      responseSource: "human",
      responseLog: new PostgresResponseLogStore(sql)
    });
    return {
      graded: true,
      chosenId: chosenStatementId,
      keyedCorrectId: rows[0].impostor_statement_id,
      correct: chosenStatementId === rows[0].impostor_statement_id
    };
  });
}

export async function setLearnerVerdict(input: {
  learnerStateRef: string;
  enrichmentId: string;
  derivedNodeId: string;
  verdict: Verdict;
}): Promise<void> {
  if (!input.learnerStateRef || !input.derivedNodeId) return;
  await withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string }[]>`
      SELECT dgn.derived_node_id
      FROM derived_graph_nodes dgn
      JOIN learner_expeditions le
        ON le.learner_state_ref = ${input.learnerStateRef}
       AND le.enrichment_id = dgn.enrichment_id
       AND le.status = 'ready'
       AND le.active
      WHERE dgn.derived_node_id = ${input.derivedNodeId}
        AND dgn.enrichment_id = ${input.enrichmentId}
      LIMIT 1`;
    if (rows.length === 0) return;
    await new PostgresCalibrationVerdictStore(sql).upsert({
      learnerStateRef: input.learnerStateRef,
      derivedNodeId: input.derivedNodeId,
      verdict: input.verdict
    });
  });
  revalidatePath(expeditionPath(input.learnerStateRef, input.enrichmentId));
}

export async function markLearnerLessonRead(input: {
  learnerStateRef: string;
  enrichmentId: string;
  derivedNodeId: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.enrichmentId || !input.derivedNodeId) return;
  await withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string }[]>`
      SELECT dgn.derived_node_id
      FROM derived_graph_nodes dgn
      JOIN learner_expeditions le
        ON le.learner_state_ref = ${input.learnerStateRef}
       AND le.enrichment_id = dgn.enrichment_id
       AND le.status = 'ready'
       AND le.active
      WHERE dgn.derived_node_id = ${input.derivedNodeId}
        AND dgn.enrichment_id = ${input.enrichmentId}
      LIMIT 1`;
    if (rows.length === 0) return;
    await new PostgresLessonReadStore(sql).markRead({
      learnerStateRef: input.learnerStateRef,
      derivedNodeId: input.derivedNodeId
    });
  });
  revalidatePath(expeditionPath(input.learnerStateRef, input.enrichmentId));
}

export async function refreshLearnerExpedition(input: {
  learnerStateRef: string;
  enrichmentId: string;
}): Promise<void> {
  if (!input.learnerStateRef || !input.enrichmentId) return;
  revalidatePath(expeditionPath(input.learnerStateRef, input.enrichmentId));
}

export async function startTopicExpedition(formData: FormData): Promise<void> {
  const learnerStateRef = String(formData.get("learnerStateRef") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const declaredDomain = String(formData.get("declaredDomain") ?? "").trim();
  if (!learnerStateRef || !topic || !declaredDomain) return;
  const learnerExpeditionId = randomUUID();
  await withExpeditionStore((store) => store.upsert({
    learnerExpeditionId,
    learnerStateRef,
    kind: "topic",
    title: topic,
    declaredDomain,
    status: "charting",
    active: true
  }));
  startTopicChart({ learnerExpeditionId, topic, declaredDomain });
  revalidatePath(learnerPath(learnerStateRef));
}

export async function inferExpeditionDomain(input: { topic: string }): Promise<{ ok: true; declaredDomain: string } | { ok: false; message: string }> {
  const topic = input.topic.trim();
  if (!topic) return { ok: false, message: "Add a topic first." };
  try {
    const result = await inferDeclaredDomain({ topic });
    return { ok: true, declaredDomain: result.declaredDomain };
  } catch (error) {
    console.error("Declared Domain inference failed.", error);
    return { ok: false, message: "Name the field before charting." };
  }
}
