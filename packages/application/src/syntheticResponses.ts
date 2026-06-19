import type { Card, DerivedGraphLayer, SelfReportRating } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, LearnerAnswerSimulatorPort, ResponseLogStorePort } from "@lrnki/ports";
import { appendSelfReportBatch, buildCalibrationSet, type SelfReportInput } from "./calibration";
import { gradeAndAppend } from "./measurement";

// Synthetic prefill (U7, R14). Seeds BOTH recall modes with `synthetic` rows so the
// end-to-end loop is inspectable pre-launch (the milestone's rule-14 artifact). It is
// EXPERIMENT_ONLY scaffolding that lives OUTSIDE the authoritative core. Crucially it
// routes self-report through U4's appendSelfReportBatch and graded answers through
// U5's gradeAndAppend with the REAL judge — one code path, not a parallel writer.

export type SyntheticLearnerProfile = {
  // A learner who masters concepts below `difficultyCutoff` and struggles at/above it.
  difficultyCutoff: number;
  // How many cards to actually answer-and-grade (bounds LLM calls). Hardest-first.
  gradedSampleSize: number;
};

// Deterministic self-rating from a concept's difficulty (pure, testable). Below the
// cutoff the learner reports recall ("good"/"easy"); at/above it they struggle
// ("hard"/"again"). The exact split is a fixed, domain-neutral mapping.
export function rateByDifficulty(difficulty: number, cutoff: number): SelfReportRating {
  if (difficulty < cutoff) return difficulty < cutoff / 2 ? "easy" : "good";
  return difficulty >= (cutoff + 1) / 2 ? "again" : "hard";
}

export async function synthesizeResponses(input: {
  learnerStateRef: string;
  layer: DerivedGraphLayer;
  targetConceptId: string;
  declaredDomain: string;
  cards: Card[];
  profile: SyntheticLearnerProfile;
  simulator: LearnerAnswerSimulatorPort;
  judge: AnswerGradingJudgePort;
  responseLog: ResponseLogStorePort;
}): Promise<{ calibrationBatchId: string; selfReportCount: number; gradedCount: number }> {
  const cardByConcept = new Map(input.cards.map((card) => [card.conceptId, card] as const));
  const calibration = buildCalibrationSet({ layer: input.layer, targetConceptId: input.targetConceptId, cards: input.cards });

  // 1. Calibration: deterministically rate every set item, then append ONE batch via
  //    U4's single append path (self-report rows tagged synthetic).
  const ratings: SelfReportInput[] = calibration.map((item) => ({
    conceptId: item.conceptId,
    cardId: item.cardId,
    rating: rateByDifficulty(item.difficulty, input.profile.difficultyCutoff)
  }));
  const { batchId } = await appendSelfReportBatch({
    learnerStateRef: input.learnerStateRef,
    responseLog: input.responseLog,
    ratings,
    responseSource: "synthetic"
  });

  // 2. Measurement: answer-and-grade a hardest-first sample, including the target's
  //    own card. Each answer is simulated then graded by the REAL judge through U5's
  //    gradeAndAppend — exercising the true measurement path, not a stub.
  const gradeOrder = [
    ...(cardByConcept.has(input.targetConceptId) ? [{ conceptId: input.targetConceptId, difficulty: difficultyOfConcept(input.layer, input.targetConceptId) }] : []),
    ...calibration.map((item) => ({ conceptId: item.conceptId, difficulty: item.difficulty }))
  ];
  const seen = new Set<string>();
  let gradedCount = 0;
  for (const candidate of gradeOrder) {
    if (gradedCount >= input.profile.gradedSampleSize) break;
    if (seen.has(candidate.conceptId)) continue;
    seen.add(candidate.conceptId);
    const card = cardByConcept.get(candidate.conceptId);
    if (!card) continue;
    const competence: "strong" | "weak" = candidate.difficulty < input.profile.difficultyCutoff ? "strong" : "weak";
    const { answer } = await input.simulator.simulateAnswer({ declaredDomain: input.declaredDomain, question: card.question, competence });
    await gradeAndAppend({
      learnerStateRef: input.learnerStateRef,
      card: { cardId: card.cardId, conceptId: card.conceptId, question: card.question, answerKey: card.answerKey },
      declaredDomain: input.declaredDomain,
      submittedAnswer: answer,
      judge: input.judge,
      responseLog: input.responseLog,
      responseSource: "synthetic"
    });
    gradedCount++;
  }

  return { calibrationBatchId: batchId, selfReportCount: ratings.length, gradedCount };
}

// The target anchor's difficulty is keyed by its derived_node_id; resolve via the
// anchor bridge. Returns 1 (treated hardest) when not found so the target is graded.
function difficultyOfConcept(layer: DerivedGraphLayer, conceptId: string): number {
  const node = layer.derivedNodes.find((candidate) => candidate.nodeKind === "anchor" && candidate.conceptId === conceptId);
  if (!node) return 1;
  return layer.difficulties.find((difficulty) => difficulty.conceptId === node.derivedNodeId)?.score ?? 1;
}
