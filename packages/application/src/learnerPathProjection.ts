import type { ConceptDifficulty, InferredPrerequisiteEdge, LearnerPathStep } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { prerequisiteAncestors, topologicalOrder } from "./prerequisiteDag";

// A learner is "known"/masterable out of the path when mastery >= threshold.
// The mock LearnerState returns 0 for everything, so nothing is pruned by default.
export const DEFAULT_MASTERY_THRESHOLD = 1;

// Deterministic projection core (ADR-0019). Pure given the LearnerState: collect
// the target's prerequisite ancestors, prune what the learner has already mastered
// (never the target itself), topologically order the survivors (prerequisites
// first), and break ties by ascending difficulty so easier ready concepts come
// first. No model, no store, no clock — the testable heart of the slice's endpoint.
export function projectLearnerPath(input: {
  targetDerivedNodeId: string;
  prerequisiteEdges: InferredPrerequisiteEdge[];
  difficulties: ConceptDifficulty[];
  learnerState: LearnerStatePort;
  masteryThreshold?: number;
  // Uncertain edges are flagged for review, never traversed into a path (ADR-0019).
  excludeUncertain?: boolean;
}): LearnerPathStep[] {
  const threshold = input.masteryThreshold ?? DEFAULT_MASTERY_THRESHOLD;
  const excludeUncertain = input.excludeUncertain ?? true;
  const edges = excludeUncertain ? input.prerequisiteEdges.filter((e) => !e.uncertain) : input.prerequisiteEdges;
  const difficultyOf = new Map(input.difficulties.map((d) => [d.derivedNodeId, d.score] as const));

  // 1. Scope = the target plus everything that must precede it.
  const inScope = prerequisiteAncestors(input.targetDerivedNodeId, edges);
  inScope.add(input.targetDerivedNodeId);

  // 2. Prune mastered concepts — but the target is always included.
  const included = new Set(
    [...inScope].filter((id) => id === input.targetDerivedNodeId || input.learnerState.mastery(id) < threshold)
  );

  // 3. Restrict edges to surviving nodes, then order them.
  const scopedEdges = edges.filter((e) => included.has(e.prerequisiteDerivedNodeId) && included.has(e.dependentDerivedNodeId));
  const byDifficultyThenId = (a: string, b: string): number =>
    (difficultyOf.get(a) ?? 0) - (difficultyOf.get(b) ?? 0) || a.localeCompare(b);
  const order = topologicalOrder([...included], scopedEdges, byDifficultyThenId);

  return order.map((derivedNodeId, position) => ({
    position,
    derivedNodeId,
    difficulty: difficultyOf.get(derivedNodeId) ?? 0,
    includedReason: derivedNodeId === input.targetDerivedNodeId ? "target" : "prerequisite"
  }));
}

// The MVP LearnerState: a learner who knows nothing. Real IRT/KT (ADR-0014)
// implements the same port; the projection above never changes.
export const emptyLearnerState: LearnerStatePort = {
  learnerStateRef: "mock:empty",
  mastery: () => 0
};
