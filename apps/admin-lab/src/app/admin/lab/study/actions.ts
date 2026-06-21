"use server";

import { revalidatePath } from "next/cache";
import {
  appendOptionSelectOutcome,
  appendSelfReportBatch,
  propagateSelfReport,
  type SelfReportInput
} from "@lrnki/application";
import type { SelfReportRating } from "@lrnki/domain-core";
import {
  PostgresStudyItemBankStore,
  PostgresEnrichmentRunStore,
  PostgresResponseLogStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// The Study surface's two write paths. Both mutate LEARNER STATE ONLY — they
// append `responseSource: "human"` rows to the append-only Response Log and never open a
// graph-version or enrichment write port, so they cannot touch a published graph or the
// Derived Graph Layer. There is no LLM call in either action.

function sessionPath(learnerStateRef: string): string {
  return `/admin/lab/study/${encodeURIComponent(learnerStateRef)}`;
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
  revalidatePath(sessionPath(learnerStateRef));
}

// Calibration sweep submit (R2, R3, R4). The learner's per-item ratings seed prior mastery;
// an "I know it" (`good`) propagates DOWN the prerequisite DAG to its ancestors so they are
// not separately asked (R3, AE1). Direct + propagated rows are appended in ONE batch through
// the same source-agnostic path the synthetic simulator uses.
export async function submitCalibration(input: {
  learnerStateRef: string;
  enrichmentId: string;
  ratings: { derivedNodeId: string; studyItemId: string; rating: SelfReportRating }[];
}): Promise<void> {
  const { learnerStateRef, enrichmentId, ratings } = input;
  if (!learnerStateRef || !enrichmentId || ratings.length === 0) return;

  const sql = createDatabaseClient();
  try {
    const layer = await new PostgresEnrichmentRunStore(sql).getLayer(enrichmentId);
    if (!layer) return;
    const studyItems = (await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(enrichmentId))
      .filter((item) => item.itemType === "self_assessment")
      .map((item) => ({ derivedNodeId: item.derivedNodeId, studyItemId: item.studyItemId }));

    const directRatings: SelfReportInput[] = ratings.map((rating) => ({
      derivedNodeId: rating.derivedNodeId,
      studyItemId: rating.studyItemId,
      rating: rating.rating
    }));
    const seeded = propagateSelfReport({ layer, directRatings, studyItems });

    await appendSelfReportBatch({
      learnerStateRef,
      responseLog: new PostgresResponseLogStore(sql),
      ratings: [...directRatings, ...seeded],
      responseSource: "human"
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidatePath(sessionPath(learnerStateRef));
}
