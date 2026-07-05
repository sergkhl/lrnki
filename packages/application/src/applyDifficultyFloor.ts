import type { DerivedGraphEdge } from "@lrnki/ports";

// The consensus band at (and below) which a node is too trivial to be a trail stop.
export const TRAIL_DIFFICULTY_FLOOR_BAND = 1;

// The difficulty fields the floor reads off a detail node (nullable: a node without a
// difficulty row carries nulls and is never floored — fail-open, rule 16's spirit).
export type DifficultyFloorNode = {
  derivedNodeId: string;
  difficultyBand: number | null;
  difficultyContested: boolean | null;
};

// The minimal trail-inclusion difficulty floor (ADR-0024 consumer; ADR-0032 projection
// policy — NEVER a veto on graph content). A node whose consensus band is 1 AND
// uncontested is excluded as a trail stop: it contributes no steps or activity
// segments. Its prerequisite gating survives by EDGE CONTRACTION — every prerequisite
// of a floored node wires directly to every dependent (uncertain flag OR-ed, the more
// conservative confidence kept), so a dependent stays locked until the contracted
// prerequisite chain is mastered. Exempt: the learner's chosen target (always
// playable), contested nodes, and nodes without a difficulty row — only a CONFIDENT
// signal gates. Pure and deterministic; applied by the Study Session projection before
// path/segment composition, so floored nodes simply never reach the views.
export function applyDifficultyFloor(input: {
  nodes: DifficultyFloorNode[];
  edges: DerivedGraphEdge[];
  targetDerivedNodeId: string;
}): { includedNodeIds: Set<string>; contractedEdges: DerivedGraphEdge[]; flooredNodeIds: string[] } {
  const flooredNodeIds = input.nodes
    .filter((node) =>
      node.derivedNodeId !== input.targetDerivedNodeId &&
      node.difficultyBand !== null &&
      node.difficultyBand <= TRAIL_DIFFICULTY_FLOOR_BAND &&
      node.difficultyContested === false)
    .map((node) => node.derivedNodeId)
    .sort((a, b) => a.localeCompare(b));

  let edges = [...input.edges];
  for (const floored of flooredNodeIds) {
    const incoming = edges.filter((edge) => edge.dependentDerivedNodeId === floored);
    const outgoing = edges.filter((edge) => edge.prerequisiteDerivedNodeId === floored);
    edges = edges.filter((edge) => edge.dependentDerivedNodeId !== floored && edge.prerequisiteDerivedNodeId !== floored);
    for (const into of incoming) {
      for (const outOf of outgoing) {
        if (into.prerequisiteDerivedNodeId === outOf.dependentDerivedNodeId) continue;
        // A surviving DIRECT edge between the endpoints is a direct judgment; it
        // dominates the contracted composition and is kept as-is.
        const exists = edges.some((edge) =>
          edge.prerequisiteDerivedNodeId === into.prerequisiteDerivedNodeId &&
          edge.dependentDerivedNodeId === outOf.dependentDerivedNodeId);
        if (exists) continue;
        edges.push({
          prerequisiteDerivedNodeId: into.prerequisiteDerivedNodeId,
          dependentDerivedNodeId: outOf.dependentDerivedNodeId,
          confidence: Math.min(into.confidence, outOf.confidence),
          uncertain: into.uncertain || outOf.uncertain,
          judgeModel: into.judgeModel
        });
      }
    }
  }
  edges.sort((a, b) =>
    a.prerequisiteDerivedNodeId.localeCompare(b.prerequisiteDerivedNodeId) ||
    a.dependentDerivedNodeId.localeCompare(b.dependentDerivedNodeId));

  const floored = new Set(flooredNodeIds);
  const includedNodeIds = new Set(input.nodes.map((node) => node.derivedNodeId).filter((id) => !floored.has(id)));
  return { includedNodeIds, contractedEdges: edges, flooredNodeIds };
}
