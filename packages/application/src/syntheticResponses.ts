import type { SelfAssessmentItem, DerivedGraphLayer, Verdict } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, CalibrationVerdictStorePort, LearnerAnswerSimulatorPort, ResponseLogStorePort } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";
import { gradeAndAppend } from "./measurement";

// Synthetic prefill (R14, EXPERIMENT_ONLY scaffolding that lives OUTSIDE the
// authoritative core). Seeds BOTH halves of the graph-dissolved loop so the end-to-end
// study surface is inspectable pre-launch (the milestone's rule-14 artifact):
//   1. Calibration VERDICTS over the goal's trusted prerequisite cone, seeded
//      deterministically from each node's difficulty (mutable store, not the log).
//   2. GRADED answers for a hardest-first sample, routed through the REAL judge via
//      gradeAndAppend — one code path, not a parallel writer.
// The retired weighted self-report sweep (buildCalibrationSet/appendSelfReportBatch) is
// gone (R18); this writes the new verdict store directly.

export type SyntheticLearnerProfile = {
  // A learner who already knows concepts below `difficultyCutoff` and must study at/above it.
  difficultyCutoff: number;
  // How many studyItems to actually answer-and-grade (bounds LLM calls). Hardest-first.
  gradedSampleSize: number;
};

// Deterministic verdict from a concept's difficulty (pure, testable). Below the cutoff
// the learner already knows it (`known`); at/above it they must study it (`learn`). A
// fixed, domain-neutral mapping — never tuned to a fixture (AGENTS rule 17).
export function verdictByDifficulty(difficulty: number, cutoff: number): Verdict {
  return difficulty < cutoff ? "known" : "learn";
}

export async function synthesizeResponses(input: {
  learnerStateRef: string;
  layer: DerivedGraphLayer;
  targetDerivedNodeId: string;
  declaredDomain: string;
  studyItems: SelfAssessmentItem[];
  profile: SyntheticLearnerProfile;
  simulator: LearnerAnswerSimulatorPort;
  judge: AnswerGradingJudgePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
}): Promise<{ knownCount: number; learnCount: number; gradedCount: number }> {
  const studyItemByNode = new Map(input.studyItems.map((studyItem) => [studyItem.derivedNodeId, studyItem] as const));
  const difficultyByNode = new Map(input.layer.difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty.score] as const));

  // 1. Calibration: seed a verdict for every node in the goal's TRUSTED prerequisite cone
  //    (certain edges only — mirroring the down-closure walk, R8), deterministically from
  //    difficulty. Upserts into the mutable verdict store; no log rows, no evidence weights.
  const certainEdges = input.layer.prerequisiteEdges.filter((edge) => !edge.uncertain);
  const cone = prerequisiteAncestors(input.targetDerivedNodeId, certainEdges);
  let knownCount = 0;
  let learnCount = 0;
  for (const derivedNodeId of [...cone].sort()) {
    const verdict = verdictByDifficulty(difficultyByNode.get(derivedNodeId) ?? 1, input.profile.difficultyCutoff);
    await input.verdictStore.upsert({ learnerStateRef: input.learnerStateRef, derivedNodeId, verdict });
    if (verdict === "known") knownCount += 1;
    else learnCount += 1;
  }

  // 2. Measurement: answer-and-grade a hardest-first sample, including the target's own
  //    studyItem. Each answer is simulated then graded by the REAL judge through
  //    gradeAndAppend — exercising the true measurement path, not a stub.
  const gradeOrder = [input.targetDerivedNodeId, ...cone]
    .map((derivedNodeId) => ({ derivedNodeId, difficulty: difficultyByNode.get(derivedNodeId) ?? 1 }))
    .sort((a, b) => b.difficulty - a.difficulty || a.derivedNodeId.localeCompare(b.derivedNodeId));
  const seen = new Set<string>();
  let gradedCount = 0;
  for (const candidate of gradeOrder) {
    if (gradedCount >= input.profile.gradedSampleSize) break;
    if (seen.has(candidate.derivedNodeId)) continue;
    seen.add(candidate.derivedNodeId);
    const studyItem = studyItemByNode.get(candidate.derivedNodeId);
    if (!studyItem) continue;
    const competence: "strong" | "weak" = candidate.difficulty < input.profile.difficultyCutoff ? "strong" : "weak";
    const { answer } = await input.simulator.simulateAnswer({ declaredDomain: input.declaredDomain, question: studyItem.question, competence });
    await gradeAndAppend({
      learnerStateRef: input.learnerStateRef,
      studyItem: { studyItemId: studyItem.studyItemId, derivedNodeId: studyItem.derivedNodeId, question: studyItem.question, answerKey: studyItem.answerKey },
      declaredDomain: input.declaredDomain,
      submittedAnswer: answer,
      judge: input.judge,
      responseLog: input.responseLog,
      responseSource: "synthetic"
    });
    gradedCount++;
  }

  return { knownCount, learnCount, gradedCount };
}
