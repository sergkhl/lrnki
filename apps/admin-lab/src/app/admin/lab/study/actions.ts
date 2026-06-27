"use server";

import { revalidatePath } from "next/cache";
import { appendOptionSelectOutcome } from "@lrnki/application";
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

export async function submitOptionSelect(input: {
  learnerStateRef: string;
  studyItemId: string;
  chosenOptionId: string;
}): Promise<void> {
  const { learnerStateRef, studyItemId, chosenOptionId } = input;
  if (!learnerStateRef || !studyItemId || !chosenOptionId) return;

  const sql = createDatabaseClient();
  try {
    const rows = await sql<{ derived_node_id: string; correct_option_id: string }[]>`
      SELECT si.derived_node_id, sio.option_id AS correct_option_id
      FROM study_items si
      JOIN study_item_options sio ON sio.study_item_id = si.study_item_id AND sio.is_correct
      WHERE si.study_item_id = ${studyItemId} AND si.item_type = 'option_select'
      LIMIT 1`;
    if (rows.length === 0) return;
    await appendOptionSelectOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: rows[0].derived_node_id },
      chosenOptionId,
      correctOptionId: rows[0].correct_option_id,
      responseSource: "human",
      responseLog: new PostgresResponseLogStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidateLearnerStudyRoutes(learnerStateRef);
}

// Calibration verdict write (R5/R7). Upserts the learner's `known`/`learn` intent for one
// node into the MUTABLE verdict store. "I knew it" (`known`) prunes the node's trusted
// prerequisite down-closure on the next re-derive; "I forgot" (`learn`) keeps it in the gap.
export async function setVerdict(input: { learnerStateRef: string; derivedNodeId: string; verdict: Verdict }): Promise<void> {
  const { learnerStateRef, derivedNodeId, verdict } = input;
  if (!learnerStateRef || !derivedNodeId) return;
  const sql = createDatabaseClient();
  try {
    await new PostgresCalibrationVerdictStore(sql).upsert({ learnerStateRef, derivedNodeId, verdict });
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidateLearnerStudyRoutes(learnerStateRef);
}

// Clear a verdict (R7 reversal; also the U7 restoration restore). Deletes the single
// (learner, node) row, returning the node to the study gap. Mutable store; no log mutation.
export async function clearVerdict(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void> {
  const { learnerStateRef, derivedNodeId } = input;
  if (!learnerStateRef || !derivedNodeId) return;
  const sql = createDatabaseClient();
  try {
    await new PostgresCalibrationVerdictStore(sql).delete({ learnerStateRef, derivedNodeId });
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidateLearnerStudyRoutes(learnerStateRef);
}

// Per-learner reset (R16, AE5): an explicit operator nuke of ALL the learner's verdicts AND
// graded rows. Verdicts go through the mutable store; the graded rows are deleted directly —
// the append-only Response Log has no store-port delete, so the structural append-only
// guarantee is never weakened; this direct DELETE is the explicit, operator-only exception.
export async function resetLearner(input: { learnerStateRef: string }): Promise<void> {
  const { learnerStateRef } = input;
  if (!learnerStateRef) return;
  const sql = createDatabaseClient();
  try {
    await new PostgresCalibrationVerdictStore(sql).clearLearner(learnerStateRef);
    await sql`DELETE FROM response_log WHERE learner_state_ref = ${learnerStateRef}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidateLearnerStudyRoutes(learnerStateRef);
}
