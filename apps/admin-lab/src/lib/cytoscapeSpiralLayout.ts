import type { Core } from "cytoscape";

export interface SpiralLayoutNodeInput {
  id: string;
  label: string;
  difficulty: number | null;
}

export interface SpiralLayoutEdgeInput {
  source: string;
  target: string;
  uncertain: boolean | "yes" | "no";
}

export interface SpiralLayoutPosition {
  id: string;
  x: number;
  y: number;
}

const CENTER_X = 0;
const CENTER_Y = 0;
const SPIRAL_STEP = 84;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// The closest the focus-fit will zoom (KTD2): a sparse 1-2 node neighborhood would
// otherwise fit-to-fill at an absurd zoom. When the fit exceeds this, clamp the level and
// re-center on the focus so the working region stays framed without filling the viewport.
export const MAX_FOCUS_ZOOM = 1.3;

function certain(edge: SpiralLayoutEdgeInput): boolean {
  return edge.uncertain === false || edge.uncertain === "no";
}

function compareNodes(a: SpiralLayoutNodeInput, b: SpiralLayoutNodeInput): number {
  const difficultyA = a.difficulty ?? Number.POSITIVE_INFINITY;
  const difficultyB = b.difficulty ?? Number.POSITIVE_INFINITY;
  if (difficultyA !== difficultyB) return difficultyA - difficultyB;
  const labelOrder = a.label.localeCompare(b.label);
  if (labelOrder !== 0) return labelOrder;
  return a.id.localeCompare(b.id);
}

// Deterministic prerequisite order over the trusted graph only. Uncertain edges remain
// visible on the canvas but do not control placement. If certain edges contain a cycle,
// Kahn's queue empties; we break the cycle by picking the lowest tie-break node still
// remaining, then continue removing its outgoing edges.
export function orderNodesForSpiral(nodes: SpiralLayoutNodeInput[], edges: SpiralLayoutEdgeInput[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(byId.keys());
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const node of nodes) indegree.set(node.id, 0);

  for (const edge of edges) {
    if (!certain(edge) || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    const targets = outgoing.get(edge.source) ?? new Set<string>();
    if (!targets.has(edge.target)) {
      targets.add(edge.target);
      outgoing.set(edge.source, targets);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }

  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .map((id) => byId.get(id)!)
      .sort(compareNodes);
    const next = ready[0] ?? [...remaining].map((id) => byId.get(id)!).sort(compareNodes)[0];

    ordered.push(next.id);
    remaining.delete(next.id);
    for (const target of outgoing.get(next.id) ?? []) {
      indegree.set(target, Math.max(0, (indegree.get(target) ?? 0) - 1));
    }
  }

  return ordered;
}

export function spiralPositions(nodes: SpiralLayoutNodeInput[], edges: SpiralLayoutEdgeInput[]): SpiralLayoutPosition[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return orderNodesForSpiral(nodes, edges).map((id, index) => {
    if (index === 0) return { id, x: CENTER_X, y: CENTER_Y };
    const radius = SPIRAL_STEP * Math.sqrt(index);
    const angle = index * GOLDEN_ANGLE;
    return {
      id: byId.get(id)?.id ?? id,
      x: CENTER_X + radius * Math.cos(angle),
      y: CENTER_Y + radius * Math.sin(angle)
    };
  });
}

// Build a Cytoscape collection from node ids, skipping any not present in the graph.
function collect(cy: Core, nodeIds: string[]) {
  let collection = cy.collection();
  for (const id of nodeIds) {
    const node = cy.getElementById(id);
    if (!node.empty()) collection = collection.union(node);
  }
  return collection;
}

// Frame the viewport on a focus collection with a max-zoom clamp (KTD2/KTD3). VIEWPORT-ONLY
// — pan + zoom, never `cy.layout()` — so node positions from the one-time spiral placement
// survive untouched. Falls back to fit-to-all when the focus is empty or unresolvable.
export function recenterOnFocus(cy: Core, focusNodeIds: string[]): void {
  const focus = collect(cy, focusNodeIds);
  if (focus.empty()) {
    cy.fit(cy.elements(), 28);
    return;
  }
  cy.fit(focus, 60);
  if (cy.zoom() > MAX_FOCUS_ZOOM) {
    cy.zoom(MAX_FOCUS_ZOOM);
    cy.center(focus);
  }
}

export function applySpiralLayout(cy: Core, isStale: () => boolean, focusNodeIds?: string[]): void {
  const nodes = cy.nodes().toArray().filter((node) => !node.isParent());
  if (nodes.length === 0) return;

  const positions = spiralPositions(
    nodes.map((node) => ({
      id: node.id(),
      label: String(node.data("label") ?? node.id()),
      difficulty: typeof node.data("difficulty") === "number" ? node.data("difficulty") : null
    })),
    cy.edges().toArray().map((edge) => ({
      source: edge.source().id(),
      target: edge.target().id(),
      uncertain: edge.data("uncertain") === "yes" ? "yes" : "no"
    }))
  );

  if (isStale() || cy.destroyed()) return;

  cy.batch(() => {
    for (const position of positions) {
      const node = cy.getElementById(position.id);
      if (node.empty()) continue;
      node.position({ x: position.x, y: position.y });
    }
  });

  if (isStale() || cy.destroyed()) return;
  if (focusNodeIds && focusNodeIds.length > 0) recenterOnFocus(cy, focusNodeIds);
  else cy.fit(cy.elements(), 28);
}
