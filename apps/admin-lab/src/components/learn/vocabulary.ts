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
  groundedBadge: "Grounded in your source",
  topicDoor: "Chart course",
  progress: "Charting progress",
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

export function encodeLearnerStateRef(rawRef: string): string {
  const compact = rawRef.trim().replace(/\s+/g, " ");
  return encodeURIComponent(compact);
}
