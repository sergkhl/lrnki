"use server";

import { revalidatePath } from "next/cache";
import {
  appendSelfAssessedGrade,
  appendSelfReportBatch,
  propagateSelfReport,
  type SelfAssessmentOutcome,
  type SelfReportInput
} from "@lrnki/application";
import type { SelfReportRating } from "@lrnki/domain-core";
import {
  PostgresCardBankStore,
  PostgresEnrichmentRunStore,
  PostgresResponseLogStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// The Study surface's two write paths (U3, R6/R4). Both mutate LEARNER STATE ONLY — they
// append `responseSource: "human"` rows to the append-only Response Log and never open a
// graph-version or enrichment write port, so they cannot touch a published graph or the
// Derived Graph Layer (R16, AGENTS rule 12). Self-assessment is judge-free (KTD1): there is
// no LLM call in either action.

function sessionPath(learnerStateRef: string): string {
  return `/admin/lab/study/${encodeURIComponent(learnerStateRef)}`;
}

// Self-assessed recall on a card (R6, R7). The card's node is re-derived from the DB by
// cardId — the client never supplies the node mapping — then the binary outcome is appended
// as one graded(self) row. `revalidatePath` re-loads the folded classification and the next
// frontier so the adapted graph updates immediately.
export async function selfAssessCard(input: {
  learnerStateRef: string;
  cardId: string;
  outcome: SelfAssessmentOutcome;
}): Promise<void> {
  const { learnerStateRef, cardId, outcome } = input;
  if (!learnerStateRef || !cardId) return;

  const sql = createDatabaseClient();
  try {
    const cardRows = await sql<{ derived_node_id: string }[]>`
      SELECT derived_node_id FROM cards WHERE card_id = ${cardId} LIMIT 1`;
    if (cardRows.length === 0) return;
    await appendSelfAssessedGrade({
      learnerStateRef,
      card: { cardId, derivedNodeId: cardRows[0].derived_node_id },
      outcome,
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
  ratings: { derivedNodeId: string; cardId: string; rating: SelfReportRating }[];
}): Promise<void> {
  const { learnerStateRef, enrichmentId, ratings } = input;
  if (!learnerStateRef || !enrichmentId || ratings.length === 0) return;

  const sql = createDatabaseClient();
  try {
    const layer = await new PostgresEnrichmentRunStore(sql).getLayer(enrichmentId);
    if (!layer) return;
    const cards = await new PostgresCardBankStore(sql).listCardsForEnrichment(enrichmentId);
    const cardLike = cards.map((card) => ({ derivedNodeId: card.derivedNodeId, cardId: card.cardId }));

    const directRatings: SelfReportInput[] = ratings.map((rating) => ({
      derivedNodeId: rating.derivedNodeId,
      cardId: rating.cardId,
      rating: rating.rating
    }));
    const seeded = propagateSelfReport({ layer, directRatings, cards: cardLike });

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
