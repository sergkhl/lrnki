import type { ConceptLessonSectionView } from "@lrnki/application";

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
  generatingProgress: "Scouting progress",
  generatingStoppedDescription: "Scouting has stopped reporting progress.",
  generatingFailedDescription: "Scouting failed.",
  progress: "Scouting progress",
  retryGeneration: "Retry",
  beginExpedition: "Begin",
  resumeExpedition: "Resume",
  summit: "Summit reached",
  section: "Leg",
  sectionPlural: "Legs",
  sectionOverview: "Trail map",
  sectionOverviewHint: "Jump to any open leg. Fogged legs unlock as you clear what they need.",
  gems: "Crystals",
  gatedBy: "Clears after",
  vistaTitle: "Crystal formation",
  vistaHint: "Every concept you master grows a crystal here. Fogged shapes still wait in the rock."
} as const;

export type LearnerVocabularyKey = keyof typeof LEARNER_VOCABULARY;

export function learnerTerm(key: LearnerVocabularyKey): string {
  return LEARNER_VOCABULARY[key];
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
