import type { ExpeditionView } from "@/lib/queries";

type Stop = ExpeditionView["expedition"]["legs"][number]["stops"][number];
export type LearningStep = Readonly<{
  key: string;
  stopKey: string;
  label: string;
  lesson: Stop["lesson"];
  activities: Stop["activities"];
  locked: boolean;
  settled: boolean;
  lessonRead: boolean;
  correctActivityKeys: readonly string[];
  source: { kind: "trail" } | { kind: "support"; supportPathKey: string };
}>;

export type LearningCursor = Readonly<{
  stepKey: string;
  kind: "theory" | "question" | "complete";
  itemKey: string;
  /** The device's open detour; its own section/question pointer uses the Support scope. */
  supportPathKey?: string;
}>;

export type LearningMemoryScope = Readonly<{
  learnerRef: string;
  expeditionKey: string;
  contentRevision: string;
  supportPathKey?: string;
}>;

export function stepCards(step: LearningStep): LearningCursor[] {
  return [
    ...step.lesson.sections.map(section => ({ stepKey: step.key, kind: "theory" as const, itemKey: section.key })),
    ...step.activities.map(activity => ({ stepKey: step.key, kind: "question" as const, itemKey: activity.key })),
    { stepKey: step.key, kind: "complete", itemKey: step.key }
  ];
}

export function cursorKey(cursor: LearningCursor): string {
  return JSON.stringify([cursor.stepKey, cursor.kind, cursor.itemKey]);
}

export function firstUnfinishedCard(step: LearningStep): LearningCursor {
  const cards = stepCards(step);
  if (step.settled) return cards[cards.length - 1];
  if (step.source.kind === "support") return cards[0];
  if (!step.lessonRead) return cards[0];
  return cards.find(card => card.kind === "question" && !step.correctActivityKeys.includes(card.itemKey)) ?? cards[cards.length - 1];
}

export function resumeLearningCursor(steps: readonly LearningStep[], saved: LearningCursor | null): LearningCursor | null {
  const step = steps.find(candidate => candidate.key === saved?.stepKey && !candidate.locked);
  if (step && saved && stepCards(step).some(card => cursorKey(card) === cursorKey(saved))) {
    if (saved.kind === "theory" && !step.settled) return saved;
    if (saved.kind === "question" && step.lessonRead && !step.settled && !step.correctActivityKeys.includes(saved.itemKey)) return saved;
    if (saved.kind === "complete" && (step.settled || step.source.kind === "support")) return saved;
  }
  const next = steps.find(candidate => !candidate.locked && !candidate.settled) ?? step ?? steps.find(candidate => !candidate.locked);
  return next ? firstUnfinishedCard(next) : null;
}

// During a visit, completing an answer must not replace its card before Continue.
export function retainLearningCursor(steps: readonly LearningStep[], cursor: LearningCursor | null): LearningCursor | null {
  const step = steps.find(candidate => candidate.key === cursor?.stepKey && !candidate.locked);
  if (step && cursor && stepCards(step).some(card => cursorKey(card) === cursorKey(cursor))) {
    if (cursor.kind === "complete" && !step.settled && step.source.kind === "trail") return firstUnfinishedCard(step);
    if (cursor.kind !== "question" || step.lessonRead || step.settled) return cursor;
  }
  return resumeLearningCursor(steps, null);
}

export function learningScopeKey(scope: LearningMemoryScope): string {
  return JSON.stringify([scope.learnerRef, scope.expeditionKey, scope.contentRevision, scope.supportPathKey ?? null]);
}
