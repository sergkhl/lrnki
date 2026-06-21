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

// The minimal edge shape readiness depends on: a directed prerequisite→dependent pair
// and whether it is uncertain. Both `InferredPrerequisiteEdge` (domain-core) and the
// loader-facing `DerivedGraphEdge` (admin-lab) satisfy this structurally, so the same
// readiness helper serves the projection core and the adapted-graph overlay (KTD1).
export type ReadinessEdge = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  uncertain: boolean;
};

// The SINGLE definition of "what is ready" (AGENTS rule 18). It filters uncertain
// edges, builds the direct-prerequisite map, and derives `isMastered` / `isReady`
// predicates from the learner state at the given threshold. `selectFrontierTarget` and
// `classifyAdaptedNodes` both consume this, so readiness can never drift between the
// path the learner walks and the overlay an operator reads.
function buildReadiness(input: {
  prerequisiteEdges: ReadinessEdge[];
  learnerState: LearnerStatePort;
  threshold: number;
  excludeUncertain: boolean;
}): {
  directPrerequisitesOf: Map<string, string[]>;
  isMastered: (nodeId: string) => boolean;
  isReady: (nodeId: string) => boolean;
} {
  const edges = input.excludeUncertain ? input.prerequisiteEdges.filter((edge) => !edge.uncertain) : input.prerequisiteEdges;
  const directPrerequisitesOf = new Map<string, string[]>();
  for (const edge of edges) {
    directPrerequisitesOf.set(edge.dependentDerivedNodeId, [...(directPrerequisitesOf.get(edge.dependentDerivedNodeId) ?? []), edge.prerequisiteDerivedNodeId]);
  }
  const isMastered = (nodeId: string): boolean => input.learnerState.mastery(nodeId) >= input.threshold;
  // A node with no inbound prerequisite edges has the predicate vacuously true (AE1).
  const isReady = (nodeId: string): boolean => (directPrerequisitesOf.get(nodeId) ?? []).every(isMastered);
  return { directPrerequisitesOf, isMastered, isReady };
}

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
  const difficultyOf = difficultyMap(input.difficulties);

  const scope = prerequisiteAncestors(input.targetNodeId, edges);
  scope.add(input.targetNodeId);

  const { isMastered, isReady } = buildReadiness({ prerequisiteEdges: input.prerequisiteEdges, learnerState: input.learnerState, threshold, excludeUncertain });
  const ready = [...scope].filter((nodeId) => !isMastered(nodeId) && isReady(nodeId));
  if (ready.length === 0) return input.targetNodeId;

  return rankFrontier(ready, difficultyOf)[0];
}

// The learner state of each derived node in an enrichment, for the adapted-graph
// overlay (R2). "mastered" = at/above threshold; "frontier" = unmastered but every
// direct prerequisite mastered (ready to take on now); "locked" = a direct
// prerequisite is still unmastered.
export type AdaptedNodeState = "mastered" | "frontier" | "locked";

export interface AdaptedNodeClassification {
  // Every node in `nodeIds` maps to exactly one state.
  stateByNode: Record<string, AdaptedNodeState>;
  // The single hardest ready+unmastered node — the one the adaptive path is working
  // toward, marked distinctly in the overlay. `null` when nothing is ready+unmastered
  // (e.g. everything mastered, or an empty layer).
  selectedFrontierTarget: string | null;
}

// Classify EVERY derived node of an enrichment for one learner state (R2). Unlike
// `selectFrontierTarget`, this is not scoped to a single target's ancestor cone — the
// adapted-graph view renders the whole layer, so it classifies all `nodeIds`. It shares
// `buildReadiness` and the `rankFrontier` tie-break with the selector, so the overlay's
// "frontier" and the path's frontier are the same notion (KTD1, AGENTS rule 18).
export function classifyAdaptedNodes(input: {
  nodeIds: string[];
  prerequisiteEdges: ReadinessEdge[];
  difficulties: { derivedNodeId: string; score: number | null }[];
  learnerState: LearnerStatePort;
  masteryThreshold?: number;
  excludeUncertain?: boolean;
}): AdaptedNodeClassification {
  const threshold = input.masteryThreshold ?? ADAPTIVE_MASTERY_THRESHOLD;
  const excludeUncertain = input.excludeUncertain ?? true;
  const { isMastered, isReady } = buildReadiness({ prerequisiteEdges: input.prerequisiteEdges, learnerState: input.learnerState, threshold, excludeUncertain });
  const difficultyOf = difficultyMap(input.difficulties);

  const stateByNode: Record<string, AdaptedNodeState> = {};
  const readyUnmastered: string[] = [];
  for (const nodeId of input.nodeIds) {
    if (isMastered(nodeId)) {
      stateByNode[nodeId] = "mastered";
    } else if (isReady(nodeId)) {
      stateByNode[nodeId] = "frontier";
      readyUnmastered.push(nodeId);
    } else {
      stateByNode[nodeId] = "locked";
    }
  }

  const selectedFrontierTarget = readyUnmastered.length === 0 ? null : rankFrontier(readyUnmastered, difficultyOf)[0];
  return { stateByNode, selectedFrontierTarget };
}

// Hardest-first ordering of ready+unmastered nodes: descending difficulty, ties broken
// by id so the selection is deterministic. Shared by the selector and the classifier.
function rankFrontier(nodeIds: string[], difficultyOf: Map<string, number>): string[] {
  return [...nodeIds].sort((a, b) => (difficultyOf.get(b) ?? 0) - (difficultyOf.get(a) ?? 0) || a.localeCompare(b));
}

function difficultyMap(difficulties: { derivedNodeId: string; score: number | null }[]): Map<string, number> {
  return new Map(difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty.score ?? 0] as const));
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
    targetDerivedNodeId: frontierTarget,
    prerequisiteEdges: input.prerequisiteEdges,
    difficulties: input.difficulties,
    learnerState: input.learnerState,
    masteryThreshold,
    excludeUncertain: input.excludeUncertain
  });
  return { targetNodeId: frontierTarget, steps };
}
