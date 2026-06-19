import type { JudgedOutcome, ResponseLogRow, SelfReportRating } from "@lrnki/domain-core";
import type { LearnerStatePort, ResponseLogStorePort } from "@lrnki/ports";

// Mastery estimator (U6, R11/R12). Deliberately simple, carried at EXPERIMENT_ONLY
// trust: no IRT/BKT/Bradley-Terry calibrated precision this milestone (R12). It folds
// the append-only Response Log into a mastery score per asserted concept, then
// resolves each concept to the active enrichment's derived node so the pure
// projection can read it unchanged. Real IRT/KT later implements the SAME
// LearnerStatePort over the SAME log without re-collecting responses (R6).

// Anki ratings and graded outcomes map to mastery in [0,1] (origin: Key Decisions).
// No decay curve — deferred tuning, not this milestone.
export function ratingToMastery(rating: SelfReportRating): number {
  switch (rating) {
    case "again": return 0;
    case "hard": return 0.33;
    case "good": return 0.7;
    case "easy": return 1.0;
  }
}

export function outcomeToMastery(outcome: JudgedOutcome): number {
  switch (outcome) {
    case "incorrect": return 0;
    case "partial": return 0.5;
    case "correct": return 1.0;
  }
}

// The fold for ONE concept's rows. Graded ALWAYS outranks self-report on conflict
// (a graded row, even if older, beats a later self-report — AE1, R11); among graded
// rows the latest wins. With only self-report rows, recency selects the active prior
// (R11). Rows are assumed ordered by attempt_seq (the store returns them so).
export function foldConceptMastery(rows: ResponseLogRow[]): number {
  const graded = rows.filter((row) => row.signalType === "graded");
  if (graded.length > 0) {
    const latest = graded[graded.length - 1];
    return outcomeToMastery(latest.judgedOutcome as JudgedOutcome);
  }
  const selfReports = rows.filter((row) => row.signalType === "self_report");
  if (selfReports.length > 0) {
    const latest = selfReports[selfReports.length - 1];
    return ratingToMastery(latest.selfReportRating as SelfReportRating);
  }
  return 0;
}

// Build a synchronous LearnerStatePort from the log. Preloads all rows for the
// learner, folds per concept, and resolves each concept_id to the active
// enrichment's derived_node_id (the key the projection uses, KTD). A concept with no
// anchor in the active enrichment is simply absent (defaults to 0 / unmastered).
export async function loadResponseLogLearnerState(input: {
  responseLog: ResponseLogStorePort;
  learnerStateRef: string;
  conceptToNodeResolver: (conceptId: string) => string | undefined;
}): Promise<LearnerStatePort> {
  const rows = await input.responseLog.listForLearner(input.learnerStateRef);
  const byConcept = new Map<string, ResponseLogRow[]>();
  for (const row of rows) {
    byConcept.set(row.conceptId, [...(byConcept.get(row.conceptId) ?? []), row]);
  }

  const masteryByNode = new Map<string, number>();
  for (const [conceptId, conceptRows] of byConcept) {
    const derivedNodeId = input.conceptToNodeResolver(conceptId);
    if (!derivedNodeId) continue; // concept not anchored in this enrichment → unmastered
    masteryByNode.set(derivedNodeId, foldConceptMastery(conceptRows));
  }

  return {
    learnerStateRef: input.learnerStateRef,
    mastery: (derivedNodeId: string) => masteryByNode.get(derivedNodeId) ?? 0
  };
}
