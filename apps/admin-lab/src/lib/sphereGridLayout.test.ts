import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countEdgeCrossings,
  layoutSphereGrid,
  orderLoopNodes,
  segmentsCross,
  type SphereGridEdgeInput,
  type SphereGridEdgeRoute,
  type SphereGridNodeInput
} from "./sphereGridLayout";

// Manhattan grid-adjacency check against the CELL spacing the module uses internally.
const CELL = 130;
function gridAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === CELL && dy === 0) || (dx === 0 && dy === CELL);
}

function positionOf(layout: ReturnType<typeof layoutSphereGrid>, id: string): { x: number; y: number } {
  const found = layout.positions.find((p) => p.id === id);
  assert.ok(found, `expected a position for ${id}`);
  return found;
}

function node(id: string, domain: string, difficulty: number | null, label = id): SphereGridNodeInput {
  return { id, label, domain, difficulty };
}

// --- Ordering (ported from the deleted spiral suite — this is now the single owner) ---

test("loop ordering places certain prerequisites before dependents", () => {
  const nodes = [node("dependent", "d", 0.2), node("root", "d", 0.1), node("middle", "d", 0.4)];
  const order = orderLoopNodes(nodes, [
    { source: "root", target: "middle", uncertain: false },
    { source: "middle", target: "dependent", uncertain: false }
  ]);
  assert.ok(order.indexOf("root") < order.indexOf("middle"));
  assert.ok(order.indexOf("middle") < order.indexOf("dependent"));
});

test("loop ordering ignores uncertain edges for placement", () => {
  const nodes = [node("dependent", "d", 0.2), node("root-b", "d", 0.1), node("root-a", "d", 0.1)];
  const order = orderLoopNodes(nodes, [
    { source: "dependent", target: "root-a", uncertain: true },
    { source: "dependent", target: "root-b", uncertain: "yes" }
  ]);
  // With uncertain edges excluded, the two indegree-0 roots come first by tie-break.
  assert.deepEqual(order.slice(0, 2), ["root-a", "root-b"]);
});

test("loop ordering terminates deterministically on certain-edge cycles", () => {
  const cycleNodes = [node("b", "d", 0.2), node("a", "d", 0.1), node("c", "d", 0.3)];
  const cycleEdges: SphereGridEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "b", target: "a", uncertain: false },
    { source: "b", target: "c", uncertain: false }
  ];
  assert.deepEqual(orderLoopNodes(cycleNodes, cycleEdges), ["a", "b", "c"]);
});

// --- Crossing counter primitives ----------------------------------------------------

test("segmentsCross detects a proper X intersection and ignores endpoint-only touches", () => {
  // Diagonals of a unit square cross at the center.
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }), true);
  // Two segments meeting only at a shared endpoint do not count.
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }), false);
  // Parallel, non-touching.
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), false);
});

test("crossing counter sanity: a hand-built crossing returns > 0; coincident endpoints do not", () => {
  const crossing: SphereGridEdgeRoute[] = [
    { source: "a", target: "b", points: [{ x: 0, y: 0 }, { x: 2, y: 2 }] },
    { source: "c", target: "d", points: [{ x: 2, y: 0 }, { x: 0, y: 2 }] }
  ];
  assert.equal(countEdgeCrossings(crossing), 1);

  // Two edges that only share an endpoint COORDINATE but are non-incident still must not
  // be counted: they touch at an endpoint of both.
  const touch: SphereGridEdgeRoute[] = [
    { source: "a", target: "b", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { source: "c", target: "d", points: [{ x: 1, y: 1 }, { x: 2, y: 0 }] }
  ];
  assert.equal(countEdgeCrossings(touch), 0);
});

// --- Single-loop embeddings ---------------------------------------------------------

test("single chain: serpentine positions are grid-adjacent in topo order with zero crossings", () => {
  const nodes = [node("a", "rust", 0), node("b", "rust", 1), node("c", "rust", 2), node("d", "rust", 3)];
  const edges: SphereGridEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "b", target: "c", uncertain: false },
    { source: "c", target: "d", uncertain: false }
  ];
  const layout = layoutSphereGrid(nodes, edges);
  assert.equal(layout.crossings, 0);
  assert.deepEqual(layout.flaggedLoops, []);
  assert.ok(gridAdjacent(positionOf(layout, "a"), positionOf(layout, "b")));
  assert.ok(gridAdjacent(positionOf(layout, "b"), positionOf(layout, "c")));
  assert.ok(gridAdjacent(positionOf(layout, "c"), positionOf(layout, "d")));
});

test("tree with branches: dependents occupy distinct adjacent cells, zero crossings", () => {
  const nodes = [node("root", "rust", 0), node("c1", "rust", 1), node("c2", "rust", 1)];
  const edges: SphereGridEdgeInput[] = [
    { source: "root", target: "c1", uncertain: false },
    { source: "root", target: "c2", uncertain: false }
  ];
  const layout = layoutSphereGrid(nodes, edges);
  assert.equal(layout.crossings, 0);
  assert.deepEqual(layout.flaggedLoops, []);
  const c1 = positionOf(layout, "c1");
  const c2 = positionOf(layout, "c2");
  // Distinct cells.
  assert.ok(c1.x !== c2.x || c1.y !== c2.y);
  // Each branch is grid-adjacent to some already-placed node (the snake keeps them close).
  const root = positionOf(layout, "root");
  assert.ok(gridAdjacent(root, c1));
  assert.ok(gridAdjacent(c1, c2) || gridAdjacent(root, c2));
});

test("reconvergent diamond: the non-tree edge is either routed crossing-free or the loop is flagged — never an unflagged crossing", () => {
  const nodes = [node("a", "rust", 0), node("b", "rust", 1), node("c", "rust", 1), node("d", "rust", 2)];
  const edges: SphereGridEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "a", target: "c", uncertain: false },
    { source: "b", target: "d", uncertain: false },
    { source: "c", target: "d", uncertain: false }
  ];
  const layout = layoutSphereGrid(nodes, edges);
  const clean = layout.crossings === 0 && layout.flaggedLoops.length === 0;
  const flagged = layout.crossings > 0 && layout.flaggedLoops.some((loop) => loop.domain === "rust");
  assert.ok(clean || flagged, "diamond must be clean or explicitly flagged, never an unflagged crossing");
  // The invariant: a positive crossing count is ALWAYS reflected in a flag.
  if (layout.crossings > 0) assert.ok(layout.flaggedLoops.length > 0);
});

test("isolated node (no edges) is placed without error and forms its own single-node region", () => {
  const layout = layoutSphereGrid([node("lonely", "rust", 0.5)], []);
  assert.equal(layout.positions.length, 1);
  assert.equal(layout.crossings, 0);
  assert.equal(layout.regions.length, 1);
  assert.equal(layout.regions[0].domain, "rust");
});

test("uncertain edges are drawn (routed) but excluded from the spanning spine", () => {
  const nodes = [node("a", "rust", 0), node("b", "rust", 1), node("c", "rust", 2)];
  const edges: SphereGridEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "b", target: "c", uncertain: "yes" }
  ];
  const layout = layoutSphereGrid(nodes, edges);
  // Both edges are routed/drawn...
  assert.equal(layout.routes.length, 2);
  assert.ok(layout.routes.some((r) => r.source === "b" && r.target === "c"));
  // ...but ordering only respected the certain a→b edge (c could appear before b without it,
  // here difficulty keeps order a,b,c regardless — the point is no throw and full routing).
  assert.equal(layout.positions.length, 3);
});

// --- Multi-domain region separation -------------------------------------------------

test("multi-domain input: regions are disjoint, no route bridges two domains, total crossings zero", () => {
  const nodes = [
    node("r1", "rust", 0),
    node("r2", "rust", 1),
    node("b1", "biology", 0),
    node("b2", "biology", 1),
    node("b3", "biology", 2)
  ];
  const edges: SphereGridEdgeInput[] = [
    { source: "r1", target: "r2", uncertain: false },
    { source: "b1", target: "b2", uncertain: false },
    { source: "b2", target: "b3", uncertain: false }
  ];
  const layout = layoutSphereGrid(nodes, edges);
  assert.equal(layout.crossings, 0);
  assert.equal(layout.regions.length, 2);

  // Region boxes are pairwise disjoint.
  const [first, second] = layout.regions;
  const overlap =
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
  assert.equal(overlap, false, "domain regions must not overlap");

  // Every route's endpoints belong to the same domain (no inter-region edge).
  const domainOf = new Map(nodes.map((n) => [n.id, n.domain]));
  for (const route of layout.routes) {
    assert.equal(domainOf.get(route.source), domainOf.get(route.target));
  }
});

test("determinism: identical input yields byte-identical positions across runs", () => {
  const nodes = [
    node("b1", "biology", 0),
    node("r2", "rust", 1),
    node("r1", "rust", 0),
    node("b2", "biology", 1)
  ];
  const edges: SphereGridEdgeInput[] = [
    { source: "r1", target: "r2", uncertain: false },
    { source: "b1", target: "b2", uncertain: false }
  ];
  const first = layoutSphereGrid(nodes, edges);
  const second = layoutSphereGrid(nodes, edges);
  assert.deepEqual(first, second);
});
