import type { ConceptDifficulty, InferredPrerequisiteEdge, LearnerPathStep } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";
import { projectLearnerPath } from "./learnerPathProjection";

// Adaptive frontier projection (U6, R13). A THIN wrapper over the unchanged pure
// projection core: prune mastered concepts at ≈0.7 and advance the target to the
// hardest READY (all prerequisites mastered) unmastered node. No new projection
// logic — the wrapper only re-selects the target, then calls projectLearnerPath.

// Self-reported "good"/"easy" (0.7/1.0) and graded "correct" (1.0) prune; "hard"
// (0.33), partial (0.5), and "again"/incorrect (0) do not (origin: Key Decisions).
export const ADAPTIVE_MASTERY_THRESHOLD = 0.7;

// The hardest READY unmastered node within the goal target's scope (its prerequisite
// ancestors ∪ itself). "Ready" = every DIRECT prerequisite is mastered, so it is the
// next thing a learner can actually take on. Falls back to the goal target itself
// when nothing in scope is both ready and unmastered.
export function selectFrontierTarget(input: {
  targetNodeId: string;
  prerequisiteEdges: InferredPrerequisiteEdge[];
  difficulties: ConceptDifficulty[];
  learnerState: LearnerStatePort;
  masteryThreshold?: number;
  excludeUncertain?: boolean;
}): string {
  const threshold = input.masteryThreshold ?? ADAPTIVE_MASTERY_THRESHOLD;
  const excludeUncertain = input.excludeUncertain ?? true;
  const edges = excludeUncertain ? input.prerequisiteEdges.filter((edge) => !edge.uncertain) : input.prerequisiteEdges;
  const difficultyOf = new Map(input.difficulties.map((difficulty) => [difficulty.conceptId, difficulty.score] as const));

  const scope = prerequisiteAncestors(input.targetNodeId, edges);
  scope.add(input.targetNodeId);

  const directPrerequisitesOf = new Map<string, string[]>();
  for (const edge of edges) {
    directPrerequisitesOf.set(edge.dependentConceptId, [...(directPrerequisitesOf.get(edge.dependentConceptId) ?? []), edge.prerequisiteConceptId]);
  }

  const isMastered = (nodeId: string): boolean => input.learnerState.mastery(nodeId) >= threshold;
  const ready = [...scope].filter(
    (nodeId) => !isMastered(nodeId) && (directPrerequisitesOf.get(nodeId) ?? []).every(isMastered)
  );
  if (ready.length === 0) return input.targetNodeId;

  return ready.sort(
    (a, b) => (difficultyOf.get(b) ?? 0) - (difficultyOf.get(a) ?? 0) || a.localeCompare(b)
  )[0];
}

// Advance the target to the frontier, then project the path to it with the unchanged
// core (R13). Returns the advanced target alongside its steps so the caller persists
// the path under the frontier the learner is actually working toward.
export function projectAdaptivePath(input: {
  targetNodeId: string;
  prerequisiteEdges: InferredPrerequisiteEdge[];
  difficulties: ConceptDifficulty[];
  learnerState: LearnerStatePort;
  masteryThreshold?: number;
  excludeUncertain?: boolean;
}): { targetNodeId: string; steps: LearnerPathStep[] } {
  const masteryThreshold = input.masteryThreshold ?? ADAPTIVE_MASTERY_THRESHOLD;
  const frontierTarget = selectFrontierTarget({ ...input, masteryThreshold });
  const steps = projectLearnerPath({
    targetConceptId: frontierTarget,
    prerequisiteEdges: input.prerequisiteEdges,
    difficulties: input.difficulties,
    learnerState: input.learnerState,
    masteryThreshold,
    excludeUncertain: input.excludeUncertain
  });
  return { targetNodeId: frontierTarget, steps };
}
