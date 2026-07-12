// Client-safe barrel for learner-facing bundlers (plan 2026-07-09-001 U1). Every module in
// this entry's runtime import closure is pure TS with no Node builtins, so web/native bundles
// never resolve `node:crypto`; server consumers keep the full "." barrel. Adding an export
// here means its transitive runtime imports must stay Node-builtin-free — a reachable
// `node:` import fails the Expo web export.
export {
  NON_LLM_STAGES,
  operationTimelineLlmSpendStageTags,
  stageBelongsToOperation,
  spendStageBelongsToOperation
} from "./operationTimelineCatalog";
export {
  layoutSphereGrid,
  type SphereGridEdgeInput,
  type SphereGridFlaggedLoop,
  type SphereGridLayout,
  type SphereGridNodeInput
} from "./sphereGridLayout";
export {
  DUEL_REQUIRED_CRYSTALS,
  DUEL_REQUIRED_ITEMS,
  DUEL_QUESTION_COUNT,
  type DuelSetup,
  type DuelPoolItem,
  type DuelAnswerSubmission,
  type GradeDuelAnswerResult
} from "./crystalDuel";
export {
  labelFor,
  type ConceptLessonSectionView,
  type ConceptLessonView,
  type SheetContent,
  type StudyImpostorView,
  type StudyItemView,
  type StudyMatchingView,
  type StudyOptionSelectView,
  type StudySession
} from "./studySessionProjection";
// Type-only: the defining module pulls node:crypto at runtime, but type re-exports are erased.
export type { MatchingAttemptTrace } from "./gradedSelectionOutcome";
