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
  nameGateTitle: "Name your explorer",
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
  viewBoard: "View the board"
} as const;

export type LearnerVocabularyKey = keyof typeof LEARNER_VOCABULARY;

export function learnerTerm(key: LearnerVocabularyKey): string {
  return LEARNER_VOCABULARY[key];
}

export function termSupportActionLabel(term: string): string {
  return `Open the authored Support Path for ${term}`;
}
