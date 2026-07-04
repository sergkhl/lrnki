export const LEARNER_VOCABULARY = {
  routeName: "Expedition Journal",
  learnerRefLabel: "Explorer name",
  learnerRefPlaceholder: "Ada Lovelace",
  enterAction: "Open journal",
  camp: "Camp",
  theoryStop: "Field notes",
  itemStop: "Survey stop",
  capstone: "Gem",
  nextStop: "Next stop",
  mastered: "Collected",
  frontier: "Ready",
  locked: "Fogged",
  known: "Known ground",
  examine: "Examine",
  answer: "Mark finding",
  skipKnown: "I know this ground",
  journal: "Journal",
  gemCollection: "Gem collection",
  surveyMap: "Survey map",
  topicDoor: "Chart course",
  progress: "Charting progress",
  summit: "Summit reached"
} as const;

export type LearnerVocabularyKey = keyof typeof LEARNER_VOCABULARY;

export function learnerTerm(key: LearnerVocabularyKey): string {
  return LEARNER_VOCABULARY[key];
}

export function encodeLearnerStateRef(rawRef: string): string {
  const compact = rawRef.trim().replace(/\s+/g, " ");
  return encodeURIComponent(compact);
}
