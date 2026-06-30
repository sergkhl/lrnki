"use server";

import { revalidatePath } from "next/cache";
import { appendGradedSelectionOutcome } from "@lrnki/application";
import type { Verdict } from "@lrnki/domain-core";
import {
  PostgresCalibrationVerdictStore,
  PostgresResponseLogStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// The Study surface's write paths. All mutate LEARNER STATE ONLY — calibration verdicts in
// the mutable verdict store and graded rows in the append-only Response Log — and never open
// a graph-version or enrichment write port, so they cannot touch a published graph or the
// Derived Graph Layer (AGENTS rule 12). There is no LLM call in any of them. Each
// `revalidatePath`s the session route so the server re-derives the prune closure, recomposes
// mastery, and re-classifies, and the driver re-renders in place.

function sessionPath(learnerStateRef: string): string {
  return `/admin/lab/study/${encodeURIComponent(learnerStateRef)}`;
}

function calibrationPath(learnerStateRef: string): string {
  return `/admin/lab/study/${encodeURIComponent(learnerStateRef)}/calibrate`;
}

function revalidateLearnerStudyRoutes(learnerStateRef: string): void {
  revalidatePath(sessionPath(learnerStateRef));
  revalidatePath(calibrationPath(learnerStateRef));
}

async function withSqlClient<T>(fn: (sql: ReturnType<typeof createDatabaseClient>) => Promise<T>): Promise<T> {
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function submitOptionSelect(input: {
  learnerStateRef: string;
  studyItemId: string;
  chosenOptionId: string;
}): Promise<void> {
  const { learnerStateRef, studyItemId, chosenOptionId } = input;
  if (!learnerStateRef || !studyItemId || !chosenOptionId) return;

  await withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string; correct_option_id: string }[]>`
      SELECT si.derived_node_id, sio.option_id AS correct_option_id
      FROM study_items si
      JOIN study_item_options sio ON sio.study_item_id = si.study_item_id AND sio.is_correct
      WHERE si.study_item_id = ${studyItemId} AND si.item_type = 'option_select'
      LIMIT 1`;
    if (rows.length === 0) return;
    await appendGradedSelectionOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: rows[0].derived_node_id },
      chosenId: chosenOptionId,
      keyedCorrectId: rows[0].correct_option_id,
      responseSource: "human",
      responseLog: new PostgresResponseLogStore(sql)
    });
  });
  revalidatePath(sessionPath(learnerStateRef));
}

// Impostor grading (R12, AE4). The keyed-correct answer is the impostor statement id, looked
// up SERVER-SIDE here and never trusted from the client — a client-sent statement id cannot
// change the key. Reuses the shared keyed-selection grader: a chosen id equal to the impostor
// statement scores 1, any truth scores 0. Mirrors submitOptionSelect's correct-option lookup.
export async function submitImpostor(input: {
  learnerStateRef: string;
  studyItemId: string;
  chosenStatementId: string;
}): Promise<void> {
  const { learnerStateRef, studyItemId, chosenStatementId } = input;
  if (!learnerStateRef || !studyItemId || !chosenStatementId) return;

  await withSqlClient(async (sql) => {
    const rows = await sql<{ derived_node_id: string; impostor_statement_id: string }[]>`
      SELECT si.derived_node_id, ist.impostor_statement_id
      FROM study_items si
      JOIN impostor_statements ist ON ist.study_item_id = si.study_item_id AND ist.is_impostor
      WHERE si.study_item_id = ${studyItemId} AND si.item_type = 'impostor'
      LIMIT 1`;
    if (rows.length === 0) return;
    await appendGradedSelectionOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: rows[0].derived_node_id },
      chosenId: chosenStatementId,
      keyedCorrectId: rows[0].impostor_statement_id,
      responseSource: "human",
      responseLog: new PostgresResponseLogStore(sql)
    });
  });
  revalidatePath(sessionPath(learnerStateRef));
}

// Calibration verdict write (R5/R7). Upserts the learner's `known`/`learn` intent for one
// node into the MUTABLE verdict store. Calibration toggles and "skip as known" write
// `known`, which prunes the node's trusted prerequisite down-closure on the next re-derive.
export async function setVerdict(input: { learnerStateRef: string; derivedNodeId: string; verdict: Verdict }): Promise<void> {
  const { learnerStateRef, derivedNodeId, verdict } = input;
  if (!learnerStateRef || !derivedNodeId) return;
  await withSqlClient(async (sql) => {
    await new PostgresCalibrationVerdictStore(sql).upsert({ learnerStateRef, derivedNodeId, verdict });
  });
  revalidateLearnerStudyRoutes(learnerStateRef);
}

// Clear a verdict (R7 reversal; also the U7 restoration restore). Deletes the single
// (learner, node) row, returning the node to the study gap. Mutable store; no log mutation.
export async function clearVerdict(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void> {
  const { learnerStateRef, derivedNodeId } = input;
  if (!learnerStateRef || !derivedNodeId) return;
  await withSqlClient(async (sql) => {
    await new PostgresCalibrationVerdictStore(sql).delete({ learnerStateRef, derivedNodeId });
  });
  revalidateLearnerStudyRoutes(learnerStateRef);
}

// Per-learner reset (R16, AE5): an explicit operator nuke of ALL the learner's verdicts AND
// graded rows. Verdicts go through the mutable store; the graded rows are deleted directly —
// the append-only Response Log has no store-port delete, so the structural append-only
// guarantee is never weakened; this direct DELETE is the explicit, operator-only exception.
export async function resetLearner(input: { learnerStateRef: string }): Promise<void> {
  const { learnerStateRef } = input;
  if (!learnerStateRef) return;
  await withSqlClient(async (sql) => {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM calibration_verdicts WHERE learner_state_ref = ${learnerStateRef}`;
      await tx`DELETE FROM response_log WHERE learner_state_ref = ${learnerStateRef}`;
    });
  });
  revalidateLearnerStudyRoutes(learnerStateRef);
}
