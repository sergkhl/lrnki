import type { DerivedGraphLayer, Verdict } from "@lrnki/domain-core";
import type { CalibrationVerdictStorePort } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";

// Synthetic prefill (R14, EXPERIMENT_ONLY scaffolding that lives OUTSIDE the
// authoritative core). Seeds BOTH halves of the graph-dissolved loop so the end-to-end
// study surface is inspectable pre-launch (the milestone's rule-14 artifact):
// Calibration VERDICTS over the goal's trusted prerequisite cone, seeded deterministically
// from each node's difficulty (mutable store, not the log). The old answer-graded sample
// depended on self-assessment cards and is intentionally gone.

export type SyntheticLearnerProfile = {
  // A learner who already knows concepts below `difficultyCutoff` and must study at/above it.
  difficultyCutoff: number;
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
  profile: SyntheticLearnerProfile;
  verdictStore: CalibrationVerdictStorePort;
}): Promise<{ knownCount: number; learnCount: number }> {
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

  return { knownCount, learnCount };
}
