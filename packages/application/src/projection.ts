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
  labelFor,
  type ConceptLessonSectionView,
  type ConceptLessonView,
  type ExplorableTermSupport,
  type ExplorableTermSupportLookup,
  type ExplorableTermView,
  type SheetContent,
  type StudyImpostorView,
  type StudyItemView,
  type StudyMatchingView,
  type NeutralReferenceAssets,
  type StudyOptionSelectView,
  type StudySession
} from "./studySessionProjection";
// The learner-scoped Scaffold Detour composition AND the finished neutral trail/activity
// composition (plan 2026-07-12-002 U4, KTD5): the Study Session projection is the single
// trail/completion authority, so the Learner App consumes these read-only instead of
// reconstructing mastery maps client-side. Runtime-pure (no node: builtins).
export {
  buildTrailView,
  resolveStopActivity,
  sectionAnchorId,
  type ScaffoldDetourView,
  type ScaffoldGeneratingPhase,
  type ScaffoldReferenceDestination,
  type ScaffoldStepItemView,
  type ScaffoldStepView,
  type StopActivity,
  type TrailCluster,
  type TrailSectionView,
  type TrailStop,
  type TrailStopKind,
  type TrailStopState,
  type TrailView
} from "./studySessionTrail";
// The one difficulty→band mapping (ADR-0024): the learner app's mineral tiers and
// difficulty markers read the SAME banding the weekly score uses. Runtime-pure.
export { difficultyBand } from "./weeklyLeaderboard";
// Type-only: the defining module pulls node:crypto at runtime, but type re-exports are erased.
export type { MatchingAttemptTrace } from "./gradedSelectionOutcome";
export type {
  RecallAnswerFeedback,
  RecallChallengeView,
  RecallMatchingProgressView,
  RecallScopeStatus
} from "./recallChallenge";
