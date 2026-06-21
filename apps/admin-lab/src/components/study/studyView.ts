import type { SelfReportRating, StudyItemGroundingProvenance } from "@lrnki/domain-core";

// Pure presentation contract for the transfer-ready study modules (U4, R15). These
// types and helpers carry NO Admin-Lab coupling — they import only `@lrnki/domain-core`
// types — so the modules (and the Admin-Lab loader that produces data matching this
// contract) share ONE definition (AGENTS rule 18). A later Learner app extracts this
// folder and writes its own loader against the SAME contract.

export type StudyCardView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  answerKey: string;
  selfReportPrompt: string;
  groundingProvenance: StudyItemGroundingProvenance;
};

export type StudyOptionSelectView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  groundingProvenance: StudyItemGroundingProvenance;
  options: {
    optionId: string;
    text: string;
    isCorrect: boolean;
    provenance: "source" | "generated";
  }[];
};

// Side-sheet content gated by the node's learner state. A frontier node opens its
// option-select item; a frontier node without one is flagged, never dropped; a locked node
// names its unmet direct prerequisites; a mastered node opens its self-assessment item as
// a read-only review when one exists.
export type SheetContent =
  | { kind: "option_select"; item: StudyOptionSelectView }
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

// Radix/Base sheet primitives can emit `open=false` while focus/animation state is
// settling. During answer-triggered retargeting that dismiss signal is stale: the user's
// intent was "advance", not "close". The caller owns the short-lived guard window.
export function shouldAcceptSheetOpenChange(nextOpen: boolean, autoAdvanceDismissGuarded: boolean): boolean {
  return nextOpen || !autoAdvanceDismissGuarded;
}

// The next node to study after a frontier item is answered (U4, R4). The server re-folds
// mastery and re-classifies after each answer; this reads the freshly-advanced frontier
// target so the open sheet can retarget to it. `null` means the goal is reached (nothing
// ready+unmastered) — the caller closes the sheet and shows a completion state. Accepts a
// minimal structural shape so this module stays free of any Admin-Lab / application import.
export function nextStudyTarget(classification: { selectedFrontierTarget: string | null }): string | null {
  return classification.selectedFrontierTarget;
}
