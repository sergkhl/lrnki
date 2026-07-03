import type { AdaptedNodeState } from "./adaptivePathProjection";
import type { DerivedGraphDetail, DerivedGraphEdge } from "@lrnki/ports";
import { prerequisiteAncestors, topologicalDepth, topologicalOrder } from "./prerequisiteDag";

export type StatefulLearnerPathStep = {
  position: number;
  derivedNodeId: string;
  difficulty: number;
  topologicalDepth: number;
  state: AdaptedNodeState;
  isTarget: boolean;
};

type StatefulPathInput = {
  targetDerivedNodeId: string;
  detail: Pick<DerivedGraphDetail, "nodes" | "edges">;
  stateByNode: Record<string, AdaptedNodeState>;
};

function trustedEdges(edges: DerivedGraphEdge[]): DerivedGraphEdge[] {
  return edges.filter((edge) => !edge.uncertain);
}

export function projectStatefulLearnerPath(input: StatefulPathInput): StatefulLearnerPathStep[] {
  const edges = trustedEdges(input.detail.edges);
  const scope = prerequisiteAncestors(input.targetDerivedNodeId, edges);
  scope.add(input.targetDerivedNodeId);
  const scopedEdges = edges.filter((edge) => scope.has(edge.prerequisiteDerivedNodeId) && scope.has(edge.dependentDerivedNodeId));
  const difficultyOf = new Map(input.detail.nodes.map((node) => [node.derivedNodeId, node.difficulty ?? 0] as const));
  const byDifficultyThenId = (a: string, b: string): number =>
    (difficultyOf.get(a) ?? 0) - (difficultyOf.get(b) ?? 0) || a.localeCompare(b);
  const depthByNode = topologicalDepth([...scope], scopedEdges);
  const order = topologicalOrder([...scope], scopedEdges, byDifficultyThenId);

  return order.map((derivedNodeId, position) => ({
    position,
    derivedNodeId,
    difficulty: difficultyOf.get(derivedNodeId) ?? 0,
    topologicalDepth: depthByNode.get(derivedNodeId) ?? 0,
    state: input.stateByNode[derivedNodeId] ?? "locked",
    isTarget: derivedNodeId === input.targetDerivedNodeId
  }));
}
