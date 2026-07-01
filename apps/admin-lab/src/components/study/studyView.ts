// Pure sheet-interaction helpers for the study modules. The presentation contract — the
// `SheetContent` discriminated union, `StudyOptionSelectView`, and the item-type → sheet
// mapping — now lives in `@lrnki/application` with the Study Session projection (KTD6), so
// one definition serves the Admin Lab and the forthcoming Learner App (AGENTS rule
// 18). These two helpers stay here: they are Admin-Lab sheet-interaction concerns (the
// short-lived auto-advance guard window and the next-target read), free of any application
// import. Components keep importing the contract types through this module.
export type { SheetContent, StudyItemView, StudyOptionSelectView, StudyImpostorView, ConceptLessonView, ConceptLessonSectionView } from "@lrnki/application";

// Radix/Base sheet primitives can emit `open=false` while focus/animation state is
// settling. During answer-triggered retargeting that dismiss signal is stale: the user's
// intent was "advance", not "close". The caller owns the short-lived guard window.
export function shouldAcceptSheetOpenChange(nextOpen: boolean, autoAdvanceDismissGuarded: boolean): boolean {
  return nextOpen || !autoAdvanceDismissGuarded;
}

// The next node to study after a frontier item is answered. The server re-folds mastery and
// re-classifies after each answer; this reads the freshly-advanced frontier target so the
// open sheet can retarget to it. `null` means the goal is reached (nothing ready+unmastered)
// — the caller closes the sheet and shows a completion state. Accepts a minimal structural
// shape so this module stays free of any Admin-Lab / application import.
export function nextStudyTarget(classification: { selectedFrontierTarget: string | null }): string | null {
  return classification.selectedFrontierTarget;
}

// A frontier node stacks its ordered study segments (option-select, then impostor). The sheet
// holds the open node until EVERY segment is answered, then advances (KTD7). True only when
// there is at least one segment and the learner has answered all of them this open-session.
export function allSegmentsAnswered(
  segments: ReadonlyArray<{ item: { studyItemId: string } }>,
  answeredIds: ReadonlySet<string>
): boolean {
  return segments.length > 0 && segments.every((segment) => answeredIds.has(segment.item.studyItemId));
}
