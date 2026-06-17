import type { DerivedGraphLayer, DerivedGraphNode, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import { prerequisiteAncestors } from "./prerequisiteDag";

export type SparseRegionBounds = {
  maxCandidateGaps: number;
};

export const DEFAULT_SPARSE_REGION_BOUNDS: SparseRegionBounds = {
  maxCandidateGaps: 12
};

export type DeclinedPairDisposition = {
  aConceptId: string;
  bConceptId: string;
  declaredDomain: string;
  outcome: "none";
  rationale: string;
};

export type CandidateBridgeGap = {
  aConceptId: string;
  bConceptId: string;
  declaredDomain: string;
  reason: "cross_component" | "orphan";
  componentIds: [number, number];
  rationale: string;
};

export type SparseRegionDetectionResult = {
  components: string[][];
  orphanConceptIds: string[];
  candidateGaps: CandidateBridgeGap[];
};

export type ConnectivityMetrics = {
  componentCount: number;
  orphanCount: number;
  targetConceptId?: string;
  reachableAncestorCount?: number;
  reachableAncestorIds?: string[];
};

const nodeId = (node: DerivedGraphNode): string => node.derivedNodeId;

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function sortEdges(edges: InferredPrerequisiteEdge[]): InferredPrerequisiteEdge[] {
  return [...edges].sort(
    (a, b) =>
      a.prerequisiteConceptId.localeCompare(b.prerequisiteConceptId) ||
      a.dependentConceptId.localeCompare(b.dependentConceptId)
  );
}

function addUndirected(adjacency: Map<string, Set<string>>, a: string, b: string): void {
  const aSet = adjacency.get(a) ?? new Set<string>();
  aSet.add(b);
  adjacency.set(a, aSet);
  const bSet = adjacency.get(b) ?? new Set<string>();
  bSet.add(a);
  adjacency.set(b, bSet);
}

function componentMap(nodes: DerivedGraphNode[], edges: InferredPrerequisiteEdge[]): {
  components: string[][];
  byNode: Map<string, number>;
  degree: Map<string, number>;
} {
  const ids = sortIds(nodes.map(nodeId));
  const adjacency = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const degree = new Map<string, number>(ids.map((id) => [id, 0]));

  for (const edge of sortEdges(edges.filter((e) => !e.uncertain))) {
    if (!adjacency.has(edge.prerequisiteConceptId) || !adjacency.has(edge.dependentConceptId)) continue;
    addUndirected(adjacency, edge.prerequisiteConceptId, edge.dependentConceptId);
    degree.set(edge.prerequisiteConceptId, (degree.get(edge.prerequisiteConceptId) ?? 0) + 1);
    degree.set(edge.dependentConceptId, (degree.get(edge.dependentConceptId) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const components: string[][] = [];
  const byNode = new Map<string, number>();
  for (const start of ids) {
    if (seen.has(start)) continue;
    const stack = [start];
    const component: string[] = [];
    seen.add(start);
    while (stack.length) {
      const current = stack.pop() as string;
      component.push(current);
      for (const next of sortIds(adjacency.get(current) ?? [])) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    component.sort((a, b) => a.localeCompare(b));
    const componentId = components.length;
    for (const id of component) byNode.set(id, componentId);
    components.push(component);
  }

  return { components, byNode, degree };
}

export function detectSparseRegions(
  layer: Pick<DerivedGraphLayer, "derivedNodes" | "prerequisiteEdges">,
  declinedPairs: DeclinedPairDisposition[],
  bounds: SparseRegionBounds = DEFAULT_SPARSE_REGION_BOUNDS
): SparseRegionDetectionResult {
  const nodeById = new Map(layer.derivedNodes.map((node) => [node.derivedNodeId, node]));
  const { components, byNode, degree } = componentMap(layer.derivedNodes, layer.prerequisiteEdges);
  const orphanSet = new Set([...degree.entries()].filter(([, count]) => count === 0).map(([id]) => id));
  const candidateGaps: CandidateBridgeGap[] = [];

  for (const pair of [...declinedPairs].sort((a, b) => a.aConceptId.localeCompare(b.aConceptId) || a.bConceptId.localeCompare(b.bConceptId))) {
    const a = nodeById.get(pair.aConceptId);
    const b = nodeById.get(pair.bConceptId);
    if (!a || !b) continue;
    if (a.declaredDomain !== b.declaredDomain || a.declaredDomain !== pair.declaredDomain) continue;
    const aComponent = byNode.get(pair.aConceptId);
    const bComponent = byNode.get(pair.bConceptId);
    if (aComponent === undefined || bComponent === undefined) continue;
    const touchesOrphan = orphanSet.has(pair.aConceptId) || orphanSet.has(pair.bConceptId);
    const crossesComponent = aComponent !== bComponent;
    if (!touchesOrphan && !crossesComponent) continue;
    candidateGaps.push({
      aConceptId: pair.aConceptId,
      bConceptId: pair.bConceptId,
      declaredDomain: pair.declaredDomain,
      reason: touchesOrphan ? "orphan" : "cross_component",
      componentIds: [aComponent, bComponent],
      rationale: pair.rationale
    });
    if (candidateGaps.length >= bounds.maxCandidateGaps) break;
  }

  return {
    components,
    orphanConceptIds: sortIds(orphanSet),
    candidateGaps
  };
}

export function connectivityMetrics(
  layer: Pick<DerivedGraphLayer, "derivedNodes" | "prerequisiteEdges">,
  targetConceptId?: string
): ConnectivityMetrics {
  const { components, degree } = componentMap(layer.derivedNodes, layer.prerequisiteEdges);
  const metrics: ConnectivityMetrics = {
    componentCount: components.length,
    orphanCount: [...degree.values()].filter((count) => count === 0).length
  };
  if (targetConceptId) {
    const ancestors = prerequisiteAncestors(targetConceptId, layer.prerequisiteEdges.filter((edge) => !edge.uncertain));
    metrics.targetConceptId = targetConceptId;
    metrics.reachableAncestorIds = sortIds(ancestors);
    metrics.reachableAncestorCount = ancestors.size;
  }
  return metrics;
}
