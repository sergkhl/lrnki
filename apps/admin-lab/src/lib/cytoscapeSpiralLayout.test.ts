import assert from "node:assert/strict";
import { test } from "node:test";
import { orderNodesForSpiral, spiralPositions, type SpiralLayoutEdgeInput, type SpiralLayoutNodeInput } from "./cytoscapeSpiralLayout";

const nodes: SpiralLayoutNodeInput[] = [
  { id: "dependent", label: "Dependent", difficulty: 0.2 },
  { id: "root-b", label: "Beta root", difficulty: 0.1 },
  { id: "root-a", label: "Alpha root", difficulty: 0.1 },
  { id: "middle", label: "Middle", difficulty: 0.4 }
];

test("spiral ordering places certain prerequisites before dependents", () => {
  const order = orderNodesForSpiral(nodes, [
    { source: "root-a", target: "middle", uncertain: false },
    { source: "middle", target: "dependent", uncertain: false }
  ]);

  assert.equal(order.indexOf("root-a") < order.indexOf("middle"), true);
  assert.equal(order.indexOf("middle") < order.indexOf("dependent"), true);
});

test("spiral ordering ignores uncertain edges for placement", () => {
  const order = orderNodesForSpiral(nodes, [
    { source: "dependent", target: "root-a", uncertain: true },
    { source: "dependent", target: "root-b", uncertain: "yes" }
  ]);

  assert.deepEqual(order.slice(0, 2), ["root-a", "root-b"]);
});

test("spiral ordering tie-breaks by difficulty, then label, then id", () => {
  const tied: SpiralLayoutNodeInput[] = [
    { id: "z", label: "Same", difficulty: 0.2 },
    { id: "a", label: "Same", difficulty: 0.2 },
    { id: "easy", label: "Later alphabetically", difficulty: 0.1 },
    { id: "alpha", label: "Alpha", difficulty: 0.2 }
  ];

  assert.deepEqual(orderNodesForSpiral(tied, []), ["easy", "alpha", "a", "z"]);
});

test("spiral ordering terminates deterministically on certain-edge cycles", () => {
  const cycleNodes: SpiralLayoutNodeInput[] = [
    { id: "b", label: "B", difficulty: 0.2 },
    { id: "a", label: "A", difficulty: 0.1 },
    { id: "c", label: "C", difficulty: 0.3 }
  ];
  const cycleEdges: SpiralLayoutEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "b", target: "a", uncertain: false },
    { source: "b", target: "c", uncertain: false }
  ];

  assert.deepEqual(orderNodesForSpiral(cycleNodes, cycleEdges), ["a", "b", "c"]);
});

test("spiral positions start at the center and move outward in prerequisite order", () => {
  const positions = spiralPositions(nodes, [
    { source: "root-a", target: "middle", uncertain: false },
    { source: "middle", target: "dependent", uncertain: false }
  ]);

  assert.deepEqual(positions[0], { id: "root-a", x: 0, y: 0 });
  assert.equal(Math.hypot(positions[2].x, positions[2].y) > Math.hypot(positions[1].x, positions[1].y), true);
});

test("derived graph and learner path shapes can call the shared spiral order helper", () => {
  const derivedNodes = [
    { id: "memory", label: "Memory address", difficulty: 0.2 },
    { id: "variable", label: "Variable", difficulty: 0.3 }
  ];
  const derivedEdges = [{ source: "memory", target: "variable", uncertain: "no" as const }];
  const learnerNodes = [
    { id: "1", label: "1. Memory address", difficulty: 0.2 },
    { id: "2", label: "2. Variable", difficulty: 0.3 }
  ];
  const learnerEdges = [{ source: "1", target: "2", uncertain: false }];

  assert.deepEqual(orderNodesForSpiral(derivedNodes, derivedEdges), ["memory", "variable"]);
  assert.deepEqual(orderNodesForSpiral(learnerNodes, learnerEdges), ["1", "2"]);
});
