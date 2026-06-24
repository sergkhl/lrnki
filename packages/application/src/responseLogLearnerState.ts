import type { JudgedOutcome, ResponseLogRow } from "@lrnki/domain-core";
import type { LearnerStatePort, ResponseLogStorePort } from "@lrnki/ports";

// Graded mastery estimator (U6, R11/R12). Deliberately simple, carried at EXPERIMENT_ONLY
// trust: no IRT/BKT/Bradley-Terry calibrated precision this milestone (R12). It folds
// the append-only, graded-only Response Log into a mastery score per derived node so the
// pure projection can read it unchanged. Calibration verdicts live in a SEPARATE mutable
// store (R10) and are composed explicitly in `composeMastery` (U3) — never folded here.
// Real IRT/KT later implements the SAME LearnerStatePort over the SAME log (R6).

export function outcomeToMastery(outcome: JudgedOutcome): number {
  switch (outcome) {
    case "incorrect": return 0;
    case "partial": return 0.5;
    case "correct": return 1.0;
  }
}

// The graded fold for ONE derived node's rows: the latest graded outcome's mastery, or 0
// when the node has no graded rows. The log is graded-only now (R18), so there is no
// self-report branch and no cross-signal precedence rule — calibration is composed
// explicitly upstream (U3). Rows are assumed ordered by attempt_seq (the store returns
// them so).
export function foldConceptMastery(rows: ResponseLogRow[]): number {
  const graded = rows.filter((row) => row.signalType === "graded");
  if (graded.length === 0) return 0;
  const latest = graded[graded.length - 1];
  return outcomeToMastery(latest.judgedOutcome as JudgedOutcome);
}

// Build a synchronous LearnerStatePort from the log. Preloads all rows for the
// learner and folds directly by derived_node_id (the key the projection uses, KTD).
export async function loadResponseLogLearnerState(input: {
  responseLog: ResponseLogStorePort;
  learnerStateRef: string;
}): Promise<LearnerStatePort> {
  const rows = await input.responseLog.listForLearner(input.learnerStateRef);
  const byNode = new Map<string, ResponseLogRow[]>();
  for (const row of rows) {
    byNode.set(row.derivedNodeId, [...(byNode.get(row.derivedNodeId) ?? []), row]);
  }

  const masteryByNode = new Map<string, number>();
  for (const [derivedNodeId, nodeRows] of byNode) {
    masteryByNode.set(derivedNodeId, foldConceptMastery(nodeRows));
  }

  return {
    learnerStateRef: input.learnerStateRef,
    mastery: (derivedNodeId: string) => masteryByNode.get(derivedNodeId) ?? 0
  };
}
