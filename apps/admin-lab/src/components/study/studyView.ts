import type { Verdict, StudyItemGroundingProvenance } from "@lrnki/domain-core";

// Pure presentation contract for the transfer-ready study modules (U4, R15). These
// types and helpers carry NO Admin-Lab coupling — they import only `@lrnki/domain-core`
// types — so the modules (and the Admin-Lab loader that produces data matching this
// contract) share ONE definition (AGENTS rule 18). A later Learner app extracts this
// folder and writes its own loader against the SAME contract.

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

// Side-sheet content gated by the node's learner state. Frontier nodes either render an
// option-select study item or a cardless "skip as known" affordance. A locked node names
// its unmet prerequisites; a mastered node opens a cardless review that can CLEAR a
// `known` verdict.
export type SheetContent =
  | { kind: "option_select"; item: StudyOptionSelectView }
  | { kind: "cardless" }
  | { kind: "locked"; unmetPrerequisiteLabels: string[] }
  | { kind: "mastered_review"; verdict: Verdict | null };

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
