import type { ConceptLessonSectionView, RecallScopeStatus } from "@lrnki/application/projection";

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
  // The cavern replaced the ascent spine and its islands (plan 2026-07-30-001), so the hint
  // names what the learner can actually see and do now.
  vistaHint: "One panel per leg, one crystal per concept. Tap a named crystal to remember it.",
  // The summit strip that closes the panel stack. The first two lines are the strings the
  // deleted summit peak carried inline; the count mirrors the panel captions' exact numbers.
  keystoneSeated: "Keystone seated",
  keystoneAwaits: "Keystone awaits",
  keystoneLegsSealedTemplate: "{sealed} of {total} legs sealed",
  vistaBoundTemplate: "Leg {n} settles into the Crystal Formation.",
  vistaKeystoneJoined: "The summit keystone locks into the Crystal Formation.",
  vistaGuardedTemplate: "Guarded by Leg {n}.",
  vistaEmpty: "No crystals on this trail yet.",
  vistaOpen: "Open the crystal formation",
  // Async route states (plan 2026-07-14-001 U2, R6). One presentational RouteStatus surface
  // renders these; the copy and recovery actions stay at each route boundary (KTD4). No
  // query-driven route returns a blank frame — every pending/error/unavailable branch names
  // its state and offers a way forward.
  bootstrapLoading: "Starting up…",
  sessionValidating: "Checking your explorer…",
  sessionErrorTitle: "Couldn’t verify your explorer",
  sessionErrorBody: "We couldn’t reach the trail to confirm your session. Check your connection and try again.",
  retryAction: "Retry",
  journalLoading: "Loading your journal…",
  journalErrorTitle: "Your journal didn’t load",
  journalErrorBody: "You’re still signed in. Retry, or log out to start fresh.",
  catalogLoading: "Loading expeditions…",
  catalogErrorTitle: "Couldn’t load expeditions",
  catalogErrorBody: "The catalog is out of reach right now. Try again.",
  expeditionLoading: "Loading your trail…",
  expeditionErrorTitle: "This trail didn’t load",
  expeditionErrorBody: "We couldn’t reach this expedition. Try again.",
  expeditionUnavailable: "This expedition isn’t available.",
  // Sign-in gate (ADR-0041). Google is the primary route; email + password is the fallback
  // and the path the rigs drive.
  gateTitle: "Choose your explorer",
  gateDescription: "Pick up where you left off, or set out as a new explorer.",
  googleAction: "Continue with Google",
  gateEmailDivider: "or use an email",
  emailLabel: "Email",
  emailPlaceholder: "explorer@example.com",
  gateEmailHint: "Only used to find your explorer again — nothing is sent to it.",
  passwordLabel: "Password",
  passwordPlaceholder: "At least 8 characters",
  gatePasswordHint: "At least 8 characters.",
  gateNameHint: "The name fellow explorers see on the weekly board.",
  createAction: "Set out",
  enterExplorerAction: "Enter",
  logoutAction: "Log out",
  toCreateAction: "New here? Set out as a new explorer.",
  toEnterAction: "Already have an explorer? Enter.",
  invalidCredentialsMessage: "That email and password don’t match an explorer. Try again.",
  emailTakenMessage: "An explorer already uses that email. Enter instead.",
  invalidEmailMessage: "Enter a valid email address.",
  weakPasswordMessage: "Choose a password of at least 8 characters.",
  invalidNameMessage: "Enter a name for your explorer.",
  rateLimitedMessage: "Too many attempts. Catch your breath and try again in a minute.",
  authUnavailableMessage: "We couldn’t reach the trailhead. Check your connection and try again.",
  // First-run explorer naming (D7), shown once after a Google sign-in.
  nameGateTitle: "Name your explorer",
  nameGateDescription: "This is the name fellow explorers see on the weekly board. Choose freely — it needn’t be your own.",
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
  // Crystal Guardian Challenges (plan 2026-07-13-003 U5/U6). The ONLY place the neutral
  // recall-challenge vocabulary (`section|enrichment` scope, `active|recovery|won`,
  // miss buffer, unresolved items) becomes Guardian, Leg/Expedition, ward, shield, and
  // Last Stand language (KTD1, ADR-0033).
  guardianTitle: "Crystal Guardian",
  guardianSummitTitle: "Expedition Guardian",
  guardianNode: "Guardian",
  guardianNodeWon: "Guardian bested",
  guardianFace: "Face the Guardian",
  guardianResume: "Return to the fight",
  guardianRematch: "Rematch",
  guardianUnavailable: "This Guardian has nothing to test yet — master more of this leg first.",
  guardianSummitLocked: "Best every leg's Guardian to reach the summit Guardian.",
  guardianArrivalTitle: "A Guardian stirs",
  guardianArrivalBody: "You’ve mastered this leg. Its Crystal Guardian now tests what you remember — best it to fuse the leg’s formation.",
  guardianArrivalSummitBody: "Every leg formation is fused. The Expedition Guardian waits at the summit.",
  guardianArrivalLater: "Return to trail",
  guardianWards: "Wards",
  guardianWardsRemainingTemplate: "{count} wards left",
  guardianWardsRemainingSingular: "Final ward",
  guardianShield: "Shield",
  guardianLastStand: "Last Stand",
  guardianLastStandBody: "Your shield is down. One clean answer restores a segment — a miss just gives you another try.",
  guardianRecoveryReshuffle: "The ward holds. The board reshuffles — match every pair cleanly to break it.",
  guardianWardBroken: "Ward broken!",
  guardianWardHolds: "The ward holds",
  guardianRetreat: "Retreat to trail",
  guardianRetreatHint: "The fight waits exactly as you left it.",
  guardianAbandonAction: "Start fresh",
  guardianAbandonTitle: "Abandon this fight?",
  guardianAbandonBody: "This challenge ends and a new Guardian rises with a fresh lineup. Nothing you’ve mastered is lost.",
  guardianAbandonConfirm: "Abandon and start fresh",
  guardianAbandonCancel: "Keep fighting",
  guardianVictoryCommitted: "The Guardian is bested. Your formation is ready.",
  guardianSeeFormation: "See your formation",
  guardianOverTitle: "This fight is over",
  guardianOverBody: "The challenge has ended or belongs to another explorer.",
  guardianLoadError: "The Guardian is out of reach right now.",
  guardianAnswerError: "That answer didn’t reach the Guardian.",
  guardianRetry: "Retry",
  guardianContinue: "Continue",
  guardianRewardFirstLegTitle: "Leg bound!",
  guardianRewardFirstSummitTitle: "Keystone seated!",
  guardianRewardRematchTitle: "Formation holds strong",
  // The cavern has no spine to join: a won Leg's own panel is what seals (plan 2026-07-30-001).
  guardianRewardFirstLegBody: "The Guardian falls and this leg's panel seals with its gold seal.",
  guardianRewardFirstSummitBody: "The keystone locks into the summit. Your Crystal Formation is complete.",
  guardianRewardRematchBody: "You bested this Guardian again. Your permanent formation stays exactly as earned.",
  guardianRewardLoading: "Your victory is secure. Reading the formation…",
  guardianRewardError: "Your victory is secure, but the formation preview didn’t load.",
  guardianRewardInconsistent: "Your victory is secure, but the trail has not recorded this formation reward yet.",
  guardianRewardRetry: "Retry preview",
  guardianRewardContinue: "Continue expedition",
  guardianRewardExplore: "Explore formation",
  // Crystal Formation reward system (plan 2026-07-15-002 U3). The four Leg structural
  // states plus the honest Guardian substates, announced as text everywhere the geode
  // renders — color, glow, and animation are never the sole signal (R31).
  legFuture: "Fogged leg",
  legCollecting: "Collecting crystals",
  legGuardianAwaits: "Guardian awaits",
  legGuardianEngaged: "Guardian engaged",
  legGuardianUnavailable: "Guardian has nothing to test yet",
  legBound: "Bound formation",
  capstoneCollected: "Crystal collected",
  // Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U6). Quiet, optional support the learner
  // requests for an unfamiliar term. The three broad phases theme the projection's stable ids
  // (KTD8, ADR-0033); the UI never shows counts or raw stage names.
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
  // Visual Support Path nodes + the full-screen path flow (plan 2026-07-13-002 U4/U5).
  supportPathNode: "Support path",
  supportPathComplete: "Path complete",
  supportOverviewAction: "Overview",
  supportOverviewHint: "Revisit any step, or hide this path.",
  supportReferenceTitle: "Continue on the trail",
  supportReferenceBody: "This step is a real stop on your trail. Study it there — finishing it completes this step too.",
  supportReferenceAction: "Go to the trail stop",
  // A pinned reference the learner can't reach on the trail right now (kept below their current
  // reach, re-locked, or its lesson refreshed): the SAME real concept is studied here, in place,
  // and finishing it completes this step. Never generated content — no "Extra support" badge.
  supportReferencePinnedNote: "From your map — study it here to finish this step."
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

// The steps-progress copy every Support Path surface announces (R12/AE6): visible as `1/3`,
// spoken as words so the a11y name never reads a bare fraction.
export function supportStepsDoneCopy(done: number, total: number): string {
  return `${done} of ${total} steps done`;
}

// Theme the projection's broad Scaffold Detour phase ids into learner copy (KTD8, ADR-0033).
// The projection owns the phase; the UI only themes it.
export function scaffoldPhaseCopy(phase: "preparing" | "building" | "checking" | null): string {
  if (phase === "building") return learnerTerm("supportPhaseBuilding");
  if (phase === "checking") return learnerTerm("supportPhaseChecking");
  return learnerTerm("supportPhasePreparing");
}

// One Guardian affordance presentation for every surface that offers entry (plan 2026-07-30-001
// U4, KTD9): the parchment trail node and the cavern panel row differ only in styling, so the
// state → copy/shape/inertness mapping is defined exactly once. State comes from the
// server-projected scope; the client formats but never decides availability.
export type GuardianScopePresentation = {
  title: string;
  subline: string;
  // A shape name, so every surface reads state as shape plus text and never colour alone.
  icon: "won" | "resume" | "face" | "locked" | "unavailable";
  // Locked and unavailable are honest dead ends, not entry points.
  disabled: boolean;
};

// What a Guardian of this scope is CALLED — one owner, so the visible title, the trail node and
// the figure's accessible label can never disagree about which Guardian the learner is facing.
export function guardianScopeTitle(scopeKind: RecallScopeStatus["scopeKind"]): string {
  return scopeKind === "enrichment" ? learnerTerm("guardianSummitTitle") : learnerTerm("guardianTitle");
}

export function guardianScopeCopy(scope: Pick<RecallScopeStatus, "scopeKind" | "state">): GuardianScopePresentation {
  const title = guardianScopeTitle(scope.scopeKind);
  if (scope.state === "won") {
    return { title, subline: `${learnerTerm("guardianNodeWon")} · ${learnerTerm("guardianRematch")}`, icon: "won", disabled: false };
  }
  if (scope.state === "active") return { title, subline: learnerTerm("guardianResume"), icon: "resume", disabled: false };
  if (scope.state === "available") return { title, subline: learnerTerm("guardianFace"), icon: "face", disabled: false };
  if (scope.state === "locked") return { title, subline: learnerTerm("guardianSummitLocked"), icon: "locked", disabled: true };
  return { title, subline: learnerTerm("guardianUnavailable"), icon: "unavailable", disabled: true };
}

// Theme a Leg's structural state + Guardian substate into one announced line (R7/R31).
// The formation model owns the state; the UI only themes it (ADR-0033).
export function legStateCopy(
  state: "future" | "collecting" | "guardian_ready" | "bound",
  substate: "available" | "engaged" | "unavailable" | null
): string {
  if (state === "future") return learnerTerm("legFuture");
  if (state === "collecting") return learnerTerm("legCollecting");
  if (state === "bound") return learnerTerm("legBound");
  if (substate === "engaged") return learnerTerm("legGuardianEngaged");
  if (substate === "unavailable") return learnerTerm("legGuardianUnavailable");
  return learnerTerm("legGuardianAwaits");
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
