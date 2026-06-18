export interface DagLayoutNode {
  id: string;
  label: string;
}

export interface DagLayoutEdge {
  source: string;
  target: string;
}

export interface DagLayoutPosition {
  x: number;
  y: number;
}

export interface DagLayoutOptions {
  nodeHorizontalSpacing?: number;
  levelVerticalSpacing?: number;
  componentHorizontalGap?: number;
  componentVerticalGap?: number;
  outerPadding?: number;
}

export const DEFAULT_DAG_LAYOUT = {
  nodeHorizontalSpacing: 190,
  levelVerticalSpacing: 125,
  componentHorizontalGap: 360,
  componentVerticalGap: 240,
  outerPadding: 80
} as const;

interface ComponentLayout {
  nodeIds: string[];
  positions: Map<string, DagLayoutPosition>;
  width: number;
  height: number;
  sortKey: string;
}

function sortNodesByLabel(nodesById: Map<string, DagLayoutNode>, nodeIds: string[]): string[] {
  return [...nodeIds].sort((a, b) => {
    const labelComparison = (nodesById.get(a)?.label ?? a).localeCompare(nodesById.get(b)?.label ?? b);
    return labelComparison === 0 ? a.localeCompare(b) : labelComparison;
  });
}

function connectedComponents(nodes: DagLayoutNode[], edges: DagLayoutEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) neighbors.set(node.id, new Set());
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const component: string[] = [];
    const queue = [node.id];
    seen.add(node.id);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      component.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function levelsForComponent(nodesById: Map<string, DagLayoutNode>, componentNodeIds: string[], edges: DagLayoutEdge[]): string[][] {
  const componentNodeIdSet = new Set(componentNodeIds);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const nodeId of componentNodeIds) {
    outgoing.set(nodeId, []);
    indegree.set(nodeId, 0);
  }
  for (const edge of edges) {
    if (!componentNodeIdSet.has(edge.source) || !componentNodeIdSet.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  for (const targets of outgoing.values()) {
    targets.sort((a, b) => {
      const labelComparison = (nodesById.get(a)?.label ?? a).localeCompare(nodesById.get(b)?.label ?? b);
      return labelComparison === 0 ? a.localeCompare(b) : labelComparison;
    });
  }

  const depthByNode = new Map<string, number>();
  const visited = new Set<string>();
  let frontier = sortNodesByLabel(nodesById, componentNodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0));

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const sourceDepth = depthByNode.get(nodeId) ?? 0;
      for (const target of outgoing.get(nodeId) ?? []) {
        depthByNode.set(target, Math.max(depthByNode.get(target) ?? 0, sourceDepth + 1));
        indegree.set(target, (indegree.get(target) ?? 0) - 1);
        if ((indegree.get(target) ?? 0) === 0) nextFrontier.push(target);
      }
    }
    frontier = sortNodesByLabel(nodesById, nextFrontier);
  }

  // A persisted enrichment should be a DAG, but keep rendering deterministic if
  // bad data slips through so the operator can still inspect it.
  for (const nodeId of sortNodesByLabel(nodesById, componentNodeIds)) {
    if (!visited.has(nodeId)) depthByNode.set(nodeId, depthByNode.get(nodeId) ?? 0);
  }

  const levels = new Map<number, string[]>();
  for (const nodeId of componentNodeIds) {
    const depth = depthByNode.get(nodeId) ?? 0;
    levels.set(depth, [...(levels.get(depth) ?? []), nodeId]);
  }
  return [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, nodeIds]) => sortNodesByLabel(nodesById, nodeIds));
}

function layoutComponent(
  nodesById: Map<string, DagLayoutNode>,
  componentNodeIds: string[],
  edges: DagLayoutEdge[],
  options: Required<DagLayoutOptions>
): ComponentLayout {
  const levels = levelsForComponent(nodesById, componentNodeIds, edges);
  const widestLevel = Math.max(...levels.map((level) => level.length), 1);
  const width = Math.max(0, (widestLevel - 1) * options.nodeHorizontalSpacing);
  const height = Math.max(0, (levels.length - 1) * options.levelVerticalSpacing);
  const positions = new Map<string, DagLayoutPosition>();

  levels.forEach((level, depth) => {
    const levelWidth = Math.max(0, (level.length - 1) * options.nodeHorizontalSpacing);
    const xOffset = (width - levelWidth) / 2;
    level.forEach((nodeId, index) => {
      positions.set(nodeId, {
        x: xOffset + index * options.nodeHorizontalSpacing,
        y: depth * options.levelVerticalSpacing
      });
    });
  });

  const sortedComponentNodes = sortNodesByLabel(nodesById, componentNodeIds);
  return {
    nodeIds: sortedComponentNodes,
    positions,
    width,
    height,
    sortKey: sortedComponentNodes.map((nodeId) => `${nodesById.get(nodeId)?.label ?? nodeId}\u0000${nodeId}`).join("\u0001")
  };
}

export function buildComponentAwareDagLayout(
  nodes: DagLayoutNode[],
  edges: DagLayoutEdge[],
  options: DagLayoutOptions = {}
): Map<string, DagLayoutPosition> {
  const resolvedOptions = { ...DEFAULT_DAG_LAYOUT, ...options };
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const components = connectedComponents(nodes, edges)
    .map((componentNodeIds) => layoutComponent(nodesById, componentNodeIds, edges, resolvedOptions))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const columns = Math.max(1, Math.ceil(Math.sqrt(components.length)));
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowCount = Math.max(1, Math.ceil(components.length / columns));
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  components.forEach((component, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column], component.width);
    rowHeights[row] = Math.max(rowHeights[row], component.height);
  });

  const columnOrigins = columnWidths.map((_, column) => {
    let origin = resolvedOptions.outerPadding;
    for (let index = 0; index < column; index += 1) {
      origin += columnWidths[index] + resolvedOptions.componentHorizontalGap;
    }
    return origin;
  });
  const rowOrigins = rowHeights.map((_, row) => {
    let origin = resolvedOptions.outerPadding;
    for (let index = 0; index < row; index += 1) {
      origin += rowHeights[index] + resolvedOptions.componentVerticalGap;
    }
    return origin;
  });

  const positions = new Map<string, DagLayoutPosition>();
  components.forEach((component, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const originX = columnOrigins[column] + (columnWidths[column] - component.width) / 2;
    const originY = rowOrigins[row] + (rowHeights[row] - component.height) / 2;
    for (const [nodeId, position] of component.positions) {
      positions.set(nodeId, { x: originX + position.x, y: originY + position.y });
    }
  });

  return positions;
}
