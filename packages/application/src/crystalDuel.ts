import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  EnrichmentInspectionReadPort,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { composeStudySession, type StudyItemView } from "./studySessionProjection";
import { difficultyBand } from "./weeklyLeaderboard";

// The Crystal Duel setup + grading use-cases (plan 2026-07-07-005, R7, KTD3). The duel is a
// retrieval sprint over the learner's ALREADY-MASTERED crystals, so it can never race acquisition
// and — critically — it NEVER writes learner mastery state: grading here reuses the pure keyed-
// selection logic behind a grade-only path that persists nothing (no `response_log` row, so a duel
// cannot corrupt the completion rule that reads latest-correct off that log, KTD3).

// Unlock thresholds (R7): six duel-ready crystals, guarded by a pooled floor of ten eligible items
// so a first duel always has enough material to draw five distinct questions from.
export const DUEL_REQUIRED_CRYSTALS = 6;
export const DUEL_REQUIRED_ITEMS = 10;
export const DUEL_QUESTION_COUNT = 5;

// One eligible duel question: a mastered-crystal study item (option_select or impostor only —
// matching is a multi-gesture puzzle that tests dexterity under a timer, excluded by R7). The
// `view` hides the answer key exactly as the Study Session does; grading resolves it server-side.
export type DuelPoolItem = { view: StudyItemView; band: number; derivedNodeId: string };

export type DuelSetup = {
  unlocked: boolean;
  duelReadyCrystalCount: number;
  eligibleItemCount: number;
  requiredCrystals: number;
  requiredItems: number;
  questionCount: number;
  pool: DuelPoolItem[];
};

type DuelSetupPorts = {
  expeditionStore: LearnerExpeditionStorePort;
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
  lessonReadStore: LessonReadStorePort;
};

// Compute unlock state and the eligible item pool from the learner's mastered crystals across their
// expeditions. Reuses the SAME Study Session projection every other surface reads (the one mastery
// rule): only nodes it calls `mastered` (and that the learner actually studied — not calibration
// known-skips) contribute, so the duel pool can never drift from the trail.
export async function getDuelSetup(input: { learnerStateRef: string }, ports: DuelSetupPorts): Promise<DuelSetup> {
  const [responses, lessonReads, verdicts, expeditions] = await Promise.all([
    ports.responseLog.listForLearner(input.learnerStateRef),
    ports.lessonReadStore.listForLearner(input.learnerStateRef),
    ports.verdictStore.listForLearner(input.learnerStateRef),
    ports.expeditionStore.listForLearner(input.learnerStateRef)
  ]);
  const knownNodes = new Set(verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId));
  const lessonReadIds = lessonReads.map((read) => read.derivedNodeId);
  const readyExpeditions = expeditions.filter((expedition) => expedition.status === "ready" && expedition.enrichmentId);

  const pool: DuelPoolItem[] = [];
  let duelReadyCrystalCount = 0;
  for (const expedition of readyExpeditions) {
    const enrichmentId = expedition.enrichmentId as string;
    const detail = await ports.enrichmentRead.getDerivedGraphDetail(enrichmentId);
    if (!detail) continue;
    const [studyItems, lessons, lessonAbsent] = await Promise.all([
      ports.studyItemStore.listStudyItemsForEnrichment(enrichmentId),
      ports.conceptLessonStore.listLessonsForEnrichment(enrichmentId),
      ports.conceptLessonStore.listAbsentForEnrichment(enrichmentId)
    ]);
    const session = composeStudySession({
      enrichmentId,
      learnerStateRef: input.learnerStateRef,
      detail,
      studyItems,
      lessons,
      lessonAbsent,
      lessonReads: lessonReadIds,
      rows: responses,
      verdicts
    });
    const difficultyByNode = new Map(detail.nodes.map((node) => [node.derivedNodeId, node.difficulty] as const));
    for (const [derivedNodeId, state] of Object.entries(session.classification.stateByNode)) {
      if (state !== "mastered" || knownNodes.has(derivedNodeId)) continue;
      const segments = (session.studySegmentsByNode[derivedNodeId] ?? []).filter((view) => view.kind === "option_select" || view.kind === "impostor");
      if (segments.length === 0) continue;
      duelReadyCrystalCount += 1;
      const band = difficultyBand(difficultyByNode.get(derivedNodeId) ?? null);
      for (const view of segments) pool.push({ view, band, derivedNodeId });
    }
  }

  return {
    unlocked: duelReadyCrystalCount >= DUEL_REQUIRED_CRYSTALS && pool.length >= DUEL_REQUIRED_ITEMS,
    duelReadyCrystalCount,
    eligibleItemCount: pool.length,
    requiredCrystals: DUEL_REQUIRED_CRYSTALS,
    requiredItems: DUEL_REQUIRED_ITEMS,
    questionCount: DUEL_QUESTION_COUNT,
    pool
  };
}

export type DuelAnswerSubmission =
  | { itemType: "option_select"; chosenOptionId: string }
  | { itemType: "impostor"; chosenStatementId: string };

export type GradeDuelAnswerResult =
  | { graded: true; correct: boolean; keyedCorrectId: string }
  | { graded: false; refused: "invalid_input" | "item_not_found" | "item_type_mismatch" };

// Grade one duel answer WITHOUT persisting anything (KTD3). It resolves the keyed-correct id
// server-side (never trusting a client key) and returns only a boolean — no `response_log` write,
// so a duel outcome can never un-master a crystal or enter the graded log (AE4). This is the
// deliberate grade-only twin of `gradeStudyResponse`; a future `signal_type = 'duel'` is the named
// deferred upgrade, taken only when a spaced-repetition consumer exists.
export async function gradeDuelAnswer(
  input: { studyItemId: string; submission: DuelAnswerSubmission },
  ports: { studyItemStore: StudyItemBankStorePort }
): Promise<GradeDuelAnswerResult> {
  if (!input.studyItemId) return { graded: false, refused: "invalid_input" };
  const item = await ports.studyItemStore.getStudyItemById(input.studyItemId);
  if (!item) return { graded: false, refused: "item_not_found" };

  if (item.itemType === "option_select" && input.submission.itemType === "option_select") {
    if (!input.submission.chosenOptionId) return { graded: false, refused: "invalid_input" };
    const keyed = item.options.find((option) => option.isCorrect);
    if (!keyed) return { graded: false, refused: "item_not_found" };
    return { graded: true, correct: input.submission.chosenOptionId === keyed.optionId, keyedCorrectId: keyed.optionId };
  }
  if (item.itemType === "impostor" && input.submission.itemType === "impostor") {
    if (!input.submission.chosenStatementId) return { graded: false, refused: "invalid_input" };
    const keyed = item.statements.find((statement) => statement.isImpostor);
    if (!keyed) return { graded: false, refused: "item_not_found" };
    return { graded: true, correct: input.submission.chosenStatementId === keyed.statementId, keyedCorrectId: keyed.statementId };
  }
  return { graded: false, refused: "item_type_mismatch" };
}
