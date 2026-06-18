import assert from "node:assert/strict";
import { test } from "node:test";
import { buildComponentAwareDagLayout, DEFAULT_DAG_LAYOUT, type DagLayoutEdge, type DagLayoutNode } from "./cytoscapeDagLayout";

const nodes: DagLayoutNode[] = [
  { id: "a1", label: "Alpha prerequisite" },
  { id: "a2", label: "Alpha dependent" },
  { id: "b1", label: "Beta prerequisite" },
  { id: "b2", label: "Beta dependent" }
];

const edges: DagLayoutEdge[] = [
  { source: "a1", target: "a2" },
  { source: "b1", target: "b2" }
];

test("disconnected DAG components are separated by the configured gutter", () => {
  const positions = buildComponentAwareDagLayout(nodes, edges);
  const firstComponentRight = Math.max(positions.get("a1")!.x, positions.get("a2")!.x);
  const secondComponentLeft = Math.min(positions.get("b1")!.x, positions.get("b2")!.x);

  assert.ok(secondComponentLeft - firstComponentRight >= DEFAULT_DAG_LAYOUT.componentHorizontalGap);
});

test("prerequisites are positioned above dependents inside a component", () => {
  const positions = buildComponentAwareDagLayout(nodes, edges);

  assert.ok(positions.get("a1")!.y < positions.get("a2")!.y);
  assert.ok(positions.get("b1")!.y < positions.get("b2")!.y);
});

test("positions are stable regardless of input order", () => {
  const forward = buildComponentAwareDagLayout(nodes, edges);
  const reversed = buildComponentAwareDagLayout([...nodes].reverse(), [...edges].reverse());

  assert.deepEqual([...forward.entries()].sort(), [...reversed.entries()].sort());
});

test("isolated nodes are treated as their own separated components", () => {
  const positions = buildComponentAwareDagLayout(
    [
      { id: "chain-a", label: "Chain A" },
      { id: "chain-b", label: "Chain B" },
      { id: "solo", label: "Solo" }
    ],
    [{ source: "chain-a", target: "chain-b" }]
  );

  const chainRight = Math.max(positions.get("chain-a")!.x, positions.get("chain-b")!.x);
  assert.ok(positions.get("solo")!.x - chainRight >= DEFAULT_DAG_LAYOUT.componentHorizontalGap);
});
