import type { DerivedGraphLayer, DerivedGraphNode } from "@lrnki/domain-core";
import { nodeGroundingSnippet } from "./selectSiblingContext";

// Graph-aware neighbor selection for the lesson's applications section (U3, R5). Pure:
// partitions a node's same-domain Derived Graph Layer neighbors into directional roles
// so the applications section can BRIDGE the concept to what comes before it, what builds
// on it, and what sits beside it:
//   - parents:  prerequisites a learner understands BEFORE this node (this node is the
//               dependent end of the edge),
//   - children: dependents that BUILD ON this node (this node is the prerequisite end),
//   - siblings: other same-domain nodes with no direct prerequisite adjacency to it.
// Prompt-context only — a neighbor-poor node still produces a lesson, just with a thinner
// applications section (R5, KTD/Risks). Cross-domain nodes are excluded; ordering is
// stable layer order (partition, never sort) so a given layer yields a deterministic
// neighborhood, and each partition is capped.

export type LessonNeighbor = { derivedNodeId: string; label: string; snippet: string };

export type LessonNeighborhood = {
  parents: LessonNeighbor[];
  children: LessonNeighbor[];
  siblings: LessonNeighbor[];
};

export const DEFAULT_MAX_LESSON_NEIGHBORS = 4;

function toNeighbor(node: DerivedGraphNode): LessonNeighbor {
  return { derivedNodeId: node.derivedNodeId, label: node.canonicalLabel, snippet: nodeGroundingSnippet(node) };
}

export function selectLessonNeighborhood(
  node: DerivedGraphNode,
  layer: DerivedGraphLayer,
  maxPerPartition: number = DEFAULT_MAX_LESSON_NEIGHBORS
): LessonNeighborhood {
  // Directional adjacency from the inferred prerequisite edges. A node's PARENTS are the
  // prerequisites of the edges it depends on; its CHILDREN are the dependents of the edges
  // it is a prerequisite for. Uncertain edges still count as adjacency context here — the
  // applications section is prompt context, not the path-traversal DAG.
  const parentIds = new Set<string>();
  const childIds = new Set<string>();
  for (const edge of layer.prerequisiteEdges) {
    if (edge.dependentDerivedNodeId === node.derivedNodeId) parentIds.add(edge.prerequisiteDerivedNodeId);
    if (edge.prerequisiteDerivedNodeId === node.derivedNodeId) childIds.add(edge.dependentDerivedNodeId);
  }

  // Walk the layer once in its stable order, classifying each same-domain neighbor. A node
  // that is both a parent and a child (a back-and-forth pair) is treated as a parent — the
  // tighter "understand first" relationship — and never duplicated into siblings.
  const parents: LessonNeighbor[] = [];
  const children: LessonNeighbor[] = [];
  const siblings: LessonNeighbor[] = [];
  for (const candidate of layer.derivedNodes) {
    if (candidate.derivedNodeId === node.derivedNodeId) continue;
    if (candidate.declaredDomain !== node.declaredDomain) continue;
    if (parentIds.has(candidate.derivedNodeId)) parents.push(toNeighbor(candidate));
    else if (childIds.has(candidate.derivedNodeId)) children.push(toNeighbor(candidate));
    else siblings.push(toNeighbor(candidate));
  }

  return {
    parents: parents.slice(0, maxPerPartition),
    children: children.slice(0, maxPerPartition),
    siblings: siblings.slice(0, maxPerPartition)
  };
}
