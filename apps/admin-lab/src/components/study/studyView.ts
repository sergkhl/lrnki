import type { CardGroundingProvenance, SelfReportRating } from "@lrnki/domain-core";

// Pure presentation contract for the transfer-ready study modules (U4, R15). These
// types and helpers carry NO Admin-Lab coupling — they import only `@lrnki/domain-core`
// types — so the modules (and the Admin-Lab loader that produces data matching this
// contract) share ONE definition (AGENTS rule 18). A later Learner app extracts this
// folder and writes its own loader against the SAME contract.

export type StudyCardView = {
  cardId: string;
  derivedNodeId: string;
  question: string;
  answerKey: string;
  selfReportPrompt: string;
  groundingProvenance: CardGroundingProvenance;
};

// Side-sheet content gated by the node's learner state (R9). A frontier node opens its
// recall card; a frontier node with no card is flagged, never dropped (R13); a locked node
// names its unmet direct prerequisites and shows NO card; a mastered node opens its card as
// a read-only review.
export type SheetContent =
  | { kind: "frontier_card"; card: StudyCardView }
  | { kind: "cardless" }
  | { kind: "locked"; unmetPrerequisiteLabels: string[] }
  | { kind: "mastered_review"; card: StudyCardView | null };

// A learner's per-item calibration choice (R2): "I know it" claims prior mastery (a
// positive recall that propagates DOWN the DAG); "not sure" leaves the concept in the gap.
export type CalibrationChoice = "know_it" | "not_sure";

// "I know it" maps to a positive `good` rating (≥ threshold, propagates to ancestors);
// "not sure" maps to `hard` (below threshold, never propagates). Pure — the action maps the
// emitted ratings into self-report rows.
export function calibrationRatingFor(choice: CalibrationChoice): SelfReportRating {
  return choice === "know_it" ? "good" : "hard";
}

// The recall-card assess controls ("Got it" / "Missed it") are disabled until the learner
// reveals the answer, so a self-assessment always follows an actual recall attempt (R6).
export function assessmentDisabled(revealed: boolean): boolean {
  return !revealed;
}
