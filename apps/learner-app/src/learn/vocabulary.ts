import type { ConceptLessonSectionView } from "@lrnki/application/projection";

export const LEARNER_VOCABULARY = {
  routeName: "Expedition Journal",
  learnerRefLabel: "Explorer name",
  learnerRefPlaceholder: "Ada Lovelace",
  enterAction: "Open expedition",
  theoryStop: "Field notes",
  question: "Question",
  matching: "Match the pairs",
  spotTheFake: "Spot the fake",
  capstone: "Crystal",
  nextStop: "Next stop",
  mastered: "Collected",
  frontier: "Ready",
  locked: "Fogged",
  known: "Known ground",
  examine: "Examine",
  continueAction: "Continue",
  returnToTrail: "Return to trail",
  skipKnown: "I already know this ground",
  unskipKnown: "Un-mark known",
  groundedBadge: "Grounded in your source",
  topicDoor: "Plan expedition",
  generating: "Scouting",
  queued: "Waiting for a scout",
  queuedDescription: "Your expedition is in line. Scouting starts as soon as a scout is free.",
  generatingStopped: "Scouting stopped",
  generatingProgress: "Planning progress",
  generatingStoppedDescription: "Scouting has stopped reporting progress.",
  generatingFailedDescription: "Scouting failed.",
  retryGeneration: "Retry",
  beginExpedition: "Begin",
  resumeExpedition: "Resume",
  summit: "Summit reached",
  // Goal gradient surfaces (plan 2026-07-10-001 U2).
  summitPrefix: "Summit",
  summitPushEyebrow: "Summit push",
  legGuardVerb: "guard",
  legGuardVerbSingular: "guards",
  legSecured: "secured",
  terminusRemainingTemplate: "{count} crystals still guard the summit.",
  terminusRemainingSingular: "1 crystal still guards the summit.",
  terminusReached: "Every crystal is grown. The summit is yours.",
  section: "Leg",
  sectionPlural: "Legs",
  sectionOverview: "Trail map",
  sectionOverviewHint: "Jump to any open leg. Fogged legs unlock as you clear what they need.",
  gems: "Crystals",
  gatedBy: "Clears after",
  vistaTitle: "Crystal formation",
  vistaHint: "Every concept you master grows a crystal here. Fogged shapes still wait in the rock. Tap a crystal to remember it.",
  vistaFusedTemplate: "Leg {n} fused into the formation!",
  vistaGuardedTemplate: "Guarded by Leg {n}.",
  vistaEmpty: "No crystals on this trail yet.",
  vistaOpen: "Open the crystal formation",
  // Registry gate.
  gateTitle: "Choose your explorer",
  gateDescription: "Pick up where you left off, or set out as a new explorer.",
  gateNameHint: "Use the same name to return later.",
  gatePinHint: "A 4-8 digit PIN unlocks this explorer.",
  pinLabel: "PIN",
  pinPlaceholder: "4–8 digits",
  createAction: "Set out",
  enterExplorerAction: "Enter",
  logoutAction: "Log out",
  nameTakenMessage: "That name is already taken. Pick it from the list, or choose another.",
  wrongPinMessage: "That PIN doesn’t match. Try again.",
  invalidPinMessage: "A PIN must be 4–8 digits.",
  invalidNameMessage: "Enter a name for your explorer.",
  rateLimitedMessage: "Too many attempts. Catch your breath and try again in a minute.",
  // Weekly leaderboard (plan 2026-07-07-005, R3/R6).
  leaderboardTitle: "This week’s climbers",
  leaderboardHint: "Every crystal you grow this week lifts your rank. Rivals are fellow explorers on the same trails.",
  leaderboardWeek: "Week",
  leaderboardYou: "You",
  leaderboardPoints: "pts",
  divisionCrystals: "crystals",
  leaderboardEmpty: "No points yet this week — grow a crystal to climb.",
  chaseAheadTemplate: "{name} is {gap} ahead — {crystals} closes the gap.",
  chaseBehindTemplate: "You lead {name} by {gap}. Keep climbing.",
  chaseCrystalSingular: "1 crystal",
  chaseCrystalPlural: "a few crystals",
  splashRankUpTitle: "You climbed the board!",
  splashRankDownTitle: "The board shifted",
  splashNewWeekTitle: "A new week begins",
  splashNewWeekBody: "Last week’s standings are in. A fresh climb starts now.",
  podiumTitle: "Podium finish!",
  podiumBody: "You finished last week in the top three.",
  splashDismiss: "To the trail",
  viewBoard: "View the board",
  // Crystal Duel (plan 2026-07-07-005, R7).
  duelEntry: "Crystal Duel",
  duelTagline: "A five-question retrieval sprint against a fellow explorer, drawn from crystals you’ve already grown.",
  duelLockedTitle: "Crystal Duel — locked",
  duelLockedProgress: "Grow {have} of {need} duel-ready crystals to unlock.",
  duelStart: "Start the duel",
  duelVersus: "vs",
  duelQuestionProgress: "Question {index} of {total}",
  duelTimeLeft: "s",
  duelYouLabel: "You",
  duelRivalLabel: "Rival",
  duelCorrect: "Correct!",
  duelIncorrect: "Missed it",
  duelRivalCorrect: "Your rival got it",
  duelRivalMissed: "Your rival missed",
  duelNext: "Next",
  duelReveal: "Reveal",
  duelWinTitle: "Victory!",
  duelLossTitle: "Defeat",
  duelDrawTitle: "Dead heat",
  duelWinBody: "You out-answered your rival. A duel-win crest joins your board.",
  duelLossBody: "No stakes lost — your crystals are untouched. Run it back anytime.",
  duelDrawBody: "Matched point for point. Nothing lost, nothing crested.",
  duelAgain: "Back to the trail",
  duelUnlockTitle: "Crystal Duel unlocked!",
  duelUnlockBody: "You’ve grown enough crystals to challenge a rival. Enter the arena whenever you like.",
  // Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U6). Quiet, optional support the learner
  // requests for an unfamiliar term. The three broad phases theme the projection's stable ids
  // (KTD8, ADR-0033); the UI never shows counts or raw stage names.
  exploreTermAction: "Explore",
  termRequestFailed: "Couldn’t start that support. Try again.",
  // Contextual discovery + the state-aware Support Path dialog (plan 2026-07-13-002 U3).
  supportPanelTitle: "Support paths",
  supportAddAction: "Add support path",
  supportOpenAction: "Open support path",
  supportAvailableBody: "Build a short side path of easier steps for this term. Your trail and crystals stay untouched.",
  supportGeneratingBody: "You can keep exploring — the path lands on your trail when it’s ready.",
  supportPreparingTitle: "Building support",
  supportPhasePreparing: "Finding the right footing…",
  supportPhaseBuilding: "Building your support steps…",
  supportPhaseChecking: "Checking the ground…",
  supportProgressClose: "Keep exploring",
  supportReadyTitle: "Support ready",
  supportReadyBody: "Your support steps are on the trail, just below this stop.",
  supportFailedTitle: "Support didn’t build",
  supportFailedBody: "Nothing was added to your trail. You can try again or dismiss it.",
  supportSectionLabel: "Support",
  supportRetry: "Retry",
  supportDismiss: "Dismiss",
  supportHide: "Hide this support",
  supportGeneratedBadge: "Extra support",
  supportStepDone: "Done",
  supportViewProgress: "View progress"
} as const;

export type LearnerVocabularyKey = keyof typeof LEARNER_VOCABULARY;

export function learnerTerm(key: LearnerVocabularyKey): string {
  return LEARNER_VOCABULARY[key];
}

// The accessible name every term-support affordance announces (R6/R8): button semantics
// plus the EXACT term, shared by inline theory highlights and the panel's icon actions.
export function termSupportActionLabel(term: string): string {
  return `${learnerTerm("supportPanelTitle")}: “${term}”`;
}

// Theme the projection's broad Scaffold Detour phase ids into learner copy (KTD8, ADR-0033).
// The projection owns the phase; the UI only themes it.
export function scaffoldPhaseCopy(phase: "preparing" | "building" | "checking" | null): string {
  if (phase === "building") return learnerTerm("supportPhaseBuilding");
  if (phase === "checking") return learnerTerm("supportPhaseChecking");
  return learnerTerm("supportPhasePreparing");
}

export function expeditionStatusLabel(status: "generating" | "ready" | "failed"): string {
  if (status === "ready") return "Ready";
  if (status === "generating") return learnerTerm("generating");
  return learnerTerm("generatingStopped");
}

export const LESSON_SECTION_HEADINGS = {
  gist: "In a nutshell",
  intuition: "Intuition",
  definition: "Definition",
  examples: "Examples",
  applications: "Where it applies",
  formulas: "Formulas"
} satisfies Record<ConceptLessonSectionView["kind"], string>;

export function lessonSectionHeading(kind: ConceptLessonSectionView["kind"]): string {
  return LESSON_SECTION_HEADINGS[kind];
}
