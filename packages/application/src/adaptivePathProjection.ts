import type { LearnerStatePort } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";

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
// predicates from the learner state at the given threshold. The whole-layer classifier
// and the goal-scoped selector both consume this, so readiness cannot drift between the
// quest ladder and the map overlay.
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
// `selectScopedFrontierTarget`, this is not scoped to a single target's ancestor cone.
// The adapted graph renders the whole layer, so it classifies all `nodeIds`. It shares
// `buildReadiness` and the `rankFrontier` tie-break with the scoped selector, so the
// overlay's "frontier" and the quest ladder's frontier are the same notion.
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
// by id so the selection is deterministic. Shared by the selector, the classifier, and
// the study projection's goal-scoped selector — exported so no surface re-inlines the
// tie-break (KTD5, AGENTS rule 18). The path a learner walks and the ring an operator
// sees rank the frontier the SAME way.
export function rankFrontier(nodeIds: string[], difficultyOf: Map<string, number>): string[] {
  return [...nodeIds].sort((a, b) => (difficultyOf.get(b) ?? 0) - (difficultyOf.get(a) ?? 0) || a.localeCompare(b));
}

// The node within the goal's ancestor cone (∪ the goal itself) the learner advances to
// NEXT — the hardest "frontier" (ready+unmastered) node in scope (KTD5). Unlike
// `classifyAdaptedNodes`'s whole-layer `selectedFrontierTarget`, this is scoped to "teach
// me Z", so a calibrated learner is routed only through what Z still needs. It CONSUMES the
// whole-layer classification's already-computed states (frontier = ready+unmastered) and
// shares `rankFrontier`, so the overlay ring and the projected path cannot drift. Returns
// `null` when nothing in scope is frontier (the goal cone is fully mastered). Scope is taken
// on CERTAIN edges only, matching the readiness classifier's trust model.
export function selectScopedFrontierTarget(input: {
  targetNodeId: string;
  prerequisiteEdges: ReadinessEdge[];
  classification: AdaptedNodeClassification;
  difficulties: { derivedNodeId: string; score: number | null }[];
}): string | null {
  const certainEdges = input.prerequisiteEdges.filter((edge) => !edge.uncertain);
  const scope = prerequisiteAncestors(input.targetNodeId, certainEdges);
  scope.add(input.targetNodeId);
  const frontier = [...scope].filter((nodeId) => input.classification.stateByNode[nodeId] === "frontier");
  if (frontier.length === 0) return null;
  return rankFrontier(frontier, difficultyMap(input.difficulties))[0];
}

function difficultyMap(difficulties: { derivedNodeId: string; score: number | null }[]): Map<string, number> {
  return new Map(difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty.score ?? 0] as const));
}
