export const LEARNER_VOCABULARY = {
  learnerRefLabel: "Explorer name",
  learnerRefPlaceholder: "Ada Lovelace",
  bootstrapLoading: "Starting up…",
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
  createAction: "Create account",
  enterExplorerAction: "Sign in",
  logoutAction: "Log out",
  toCreateAction: "New here? Create an account.",
  toEnterAction: "Already have an account? Sign in.",
  invalidCredentialsMessage: "That email and password don’t match an explorer. Try again.",
  emailTakenMessage: "An explorer already uses that email. Sign in instead.",
  invalidEmailMessage: "Enter a valid email address.",
  weakPasswordMessage: "Choose a password of at least 8 characters.",
  invalidNameMessage: "Enter a name for your explorer.",
  rateLimitedMessage: "Too many attempts. Catch your breath and try again in a minute.",
  authUnavailableMessage: "We couldn’t reach the trailhead. Check your connection and try again.",
  nameGateTitle: "Name your explorer",
  saveExplorerName: "Save explorer name",
  nameGateDescription: "This is the name fellow explorers see on the weekly board. Choose freely — it needn’t be your own.",
  leaderboardTitle: "This week’s climbers",
  leaderboardHint: "Every first graded Stop completion this week lifts your rank.",
  leaderboardWeek: "Week",
  leaderboardYou: "You",
  leaderboardPoints: "pts",
  divisionCrystals: "crystals",
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
  viewBoard: "View the board",
  contentChanged: "This expedition was updated. Your saved progress is currently unavailable. Choose another expedition from your journal to continue.",
  commandUnavailable: "Your progress could not be saved. Check your connection and try again.",
  progressChanged: "Your progress changed elsewhere. It has been refreshed; try again.",
  commandRefused: "This action is no longer available. Your saved progress has been kept.",
  beginExpedition: "Choose your first expedition",
  expeditionReady: "Explore a topic, build understanding, and put it into practice.",
  catalogDescription: "Find a topic you want to understand.",
  resume: "Resume"
} as const;

export type LearnerVocabularyKey = keyof typeof LEARNER_VOCABULARY;

export function learnerTerm(key: LearnerVocabularyKey): string {
  return LEARNER_VOCABULARY[key];
}

export function termSupportActionLabel(term: string): string {
  return `Get help with ${term}`;
}

export function stopStateLabel(state: "locked" | "available" | "mastered" | "known"): string {
  return { locked: "Locked", available: "Ready to learn", mastered: "Mastered", known: "Marked as known" }[state];
}

export function commandFeedback(status: string, reason?: string | null): string {
  if (status === "stale") return learnerTerm("progressChanged");
  if (status === "content_changed") return learnerTerm("contentChanged");
  if (reason === "stop_locked") return "Review the required Stops before continuing here.";
  if (reason === "guardian_locked") return "Complete this part of the trail to unlock its Guardian.";
  if (reason === "guardian_unavailable") return "Answer this Leg’s questions to prepare for its Guardian.";
  if (reason === "guardian_retreated") return "Resume the Guardian before answering.";
  if (reason === "guardian_out_of_turn") return learnerTerm("progressChanged");
  return learnerTerm("commandRefused");
}
