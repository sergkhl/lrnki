import { useEffect, useMemo, useState } from "react";
import type { ActivityGrade } from "@/components/AuthoredActivityCard";
import { readLearningCursor, writeLearningCursor } from "@/lib/navMemory";
import { cursorKey, firstUnfinishedCard, learningScopeKey, resumeLearningCursor, retainLearningCursor, stepCards,
  type LearningCursor, type LearningMemoryScope, type LearningStep } from "./focusedFlow";

type Visit = {
  scopeKey: string;
  saved: LearningCursor | null;
  cursor: LearningCursor | null;
  grades: Record<string, ActivityGrade>;
  retryKey: string | null;
  attempt: number;
  reviewReturn: LearningCursor | null;
  supportPathKey: string | null;
  supportOriginSteps: readonly LearningStep[] | null;
};

const NO_SUPPORT: readonly string[] = [];

export function useFocusedFlow(currentSteps: readonly LearningStep[], scope: LearningMemoryScope, openSupportKeys: readonly string[] = NO_SUPPORT) {
  const { learnerRef, expeditionKey, contentRevision, supportPathKey } = scope;
  const stableScope = useMemo(() => ({ learnerRef, expeditionKey, contentRevision, supportPathKey }),
    [learnerRef, expeditionKey, contentRevision, supportPathKey]);
  const scopeKey = learningScopeKey(stableScope);
  const [visit, setVisit] = useState<Visit | null>(null);
  const loadedScope = visit?.scopeKey;
  useEffect(() => {
    if (!stableScope.learnerRef || !stableScope.contentRevision || loadedScope === learningScopeKey(stableScope)) return;
    let cancelled = false;
    void readLearningCursor(stableScope).then(saved => {
      if (!cancelled) setVisit({ scopeKey: learningScopeKey(stableScope), saved, cursor: null, grades: {}, retryKey: null, attempt: 0, reviewReturn: null,
        supportPathKey: saved?.supportPathKey ?? null, supportOriginSteps: saved?.supportPathKey ? currentSteps : null });
    });
    return () => { cancelled = true; };
  }, [stableScope, currentSteps, loadedScope]);
  const ready = Boolean(learnerRef && contentRevision) && visit?.scopeKey === scopeKey;
  const activeSupportKey = ready && visit.supportPathKey && openSupportKeys.includes(visit.supportPathKey) ? visit.supportPathKey : null;
  // A detour can temporarily change prerequisite mastery. Keep its covered parent steady until
  // return, then reconcile against the latest server progress.
  const steps = activeSupportKey && visit?.supportOriginSteps ? visit.supportOriginSteps : currentSteps;
  const cursor = !ready ? null : visit.cursor ? retainLearningCursor(steps, visit.cursor) : resumeLearningCursor(steps, visit.saved);
  const serializedCursor = cursor ? cursorKey(cursor) : null;
  // Support has no per-step outcome in its public DTO. Once the server accepts a correct answer,
  // remember the following completion pointer while keeping its feedback in this visit's memory.
  // A reload can then continue without replaying the answer or persisting grading data.
  const rememberedCursor = supportPathKey && cursor?.kind === "question" && visit?.grades[cursorKey(cursor)]?.effect.correct
    ? cursorKey({ stepKey: cursor.stepKey, kind: "complete", itemKey: cursor.stepKey }) : serializedCursor;
  useEffect(() => {
    if (!rememberedCursor) return;
    const [stepKey, kind, itemKey] = JSON.parse(rememberedCursor) as [string, LearningCursor["kind"], string];
    void writeLearningCursor(stableScope, { stepKey, kind, itemKey, ...(activeSupportKey ? { supportPathKey: activeSupportKey } : {}) });
  }, [stableScope, rememberedCursor, activeSupportKey]);

  const setSupportPathKey = (key: string | null) => {
    setVisit(current => current?.scopeKey === scopeKey ? { ...current, cursor,
      supportPathKey: key, supportOriginSteps: key ? currentSteps : null } : current);
  };

  const step = steps.find(candidate => candidate.key === cursor?.stepKey) ?? null;
  const move = (next: LearningCursor, reviewReturn: LearningCursor | null = null) => {
    setVisit(current => current?.scopeKey === scopeKey ? { ...current, cursor: next, reviewReturn, retryKey: null } : current);
  };
  const grade = cursor && ready ? visit.grades[cursorKey(cursor)] ?? null : null;
  const setGrade = (value: ActivityGrade) => {
    if (!cursor) return;
    setVisit(current => current?.scopeKey === scopeKey ? { ...current, cursor, grades: { ...current.grades, [cursorKey(cursor)]: value } } : current);
  };
  const retry = () => {
    if (!cursor) return;
    setVisit(current => {
      if (current?.scopeKey !== scopeKey) return current;
      const grades = { ...current.grades };
      delete grades[cursorKey(cursor)];
      return { ...current, cursor, grades, retryKey: cursorKey(cursor), attempt: current.attempt + 1 };
    });
  };
  const review = () => {
    if (!cursor || !step) return;
    move(stepCards(step)[0], cursor);
  };
  const next = () => {
    if (!cursor || !step) return;
    const cards = stepCards(step);
    const index = cards.findIndex(candidate => cursorKey(candidate) === cursorKey(cursor));
    if (cursor.kind === "theory" && cards[index + 1]?.kind !== "theory" && visit?.reviewReturn) {
      move(visit.reviewReturn);
    } else if (cards[index + 1]) move(cards[index + 1], visit?.reviewReturn ?? null);
  };
  const back = () => {
    if (!cursor || !step) return;
    const cards = stepCards(step);
    const index = cards.findIndex(candidate => cursorKey(candidate) === cursorKey(cursor));
    if (cards[index - 1]) move(cards[index - 1], visit?.reviewReturn ?? null);
  };
  const select = (stepKey: string) => {
    const selected = steps.find(candidate => candidate.key === stepKey && !candidate.locked);
    if (selected) move(firstUnfinishedCard(selected));
  };
  const reviewStep = () => { if (step) move(stepCards(step)[0]); };
  const index = steps.findIndex(candidate => candidate.key === step?.key);
  const nextStep = scope.supportPathKey
    ? steps[index + 1]
    : [...steps.slice(index + 1), ...steps.slice(0, index)].find(candidate => !candidate.locked && !candidate.settled);
  return { ready, cursor, step, grade, setGrade, retry, review, next, back, select, reviewStep, nextStep,
    supportPathKey: activeSupportKey, setSupportPathKey,
    retrying: serializedCursor === visit?.retryKey, attempt: visit?.attempt ?? 0,
    reviewing: visit?.reviewReturn != null };
}

export type FocusedFlow = ReturnType<typeof useFocusedFlow>;
