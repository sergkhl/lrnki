import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDerivedGraphView, type DerivedGraphDetail } from "../lib/derivedGraph";

// The DerivedGraphExplorer renders a Derived Graph Layer (ADR-0019) independently
// of learner paths (U6 scenario 5) and must carry an equivalent textual
// node-and-edge representation of the Cytoscape graph (U6 scenario 8). The
// view-model builder is pure.

const detail: DerivedGraphDetail = {
  summary: {
    enrichmentId: "en-1",
    graphVersionId: "gv-1",
    enrichmentConfigHash: "cfg",
    judgeModel: "kg-independent-judge",
    difficultyMethod: "dag-depth-mock",
    status: "succeeded",
    edgeCount: 2,
    certainEdgeCount: 1,
    uncertainEdgeCount: 1,
    conceptCount: 3,
    startedAt: "2026-06-15T10:00:00.000Z",
    completedAt: "2026-06-15T10:05:00.000Z"
  },
  nodes: [
    { conceptId: "scope", label: "Variable scope", declaredDomain: "rust", difficulty: 0 },
    { conceptId: "ownership", label: "Ownership", declaredDomain: "rust", difficulty: 1 },
    { conceptId: "move", label: "Move semantics", declaredDomain: "rust", difficulty: 2 }
  ],
  edges: [
    { prerequisiteConceptId: "scope", dependentConceptId: "ownership", confidence: 0.9, uncertain: false },
    { prerequisiteConceptId: "ownership", dependentConceptId: "move", confidence: 0.5, uncertain: true }
  ]
};

test("cytoscape and textual views describe the same nodes and edges", () => {
  const view = buildDerivedGraphView(detail);
  assert.equal(view.cytoscape.nodes.length, view.textual.nodes.length);
  assert.equal(view.cytoscape.edges.length, view.textual.edges.length);
  // Cytoscape edges reference concept ids; textual edges resolve them to labels.
  assert.deepEqual(view.cytoscape.edges.map((e) => [e.source, e.target]), [
    ["scope", "ownership"],
    ["ownership", "move"]
  ]);
  assert.deepEqual(view.textual.edges.map((e) => [e.prerequisiteLabel, e.dependentLabel]), [
    ["Variable scope", "Ownership"],
    ["Ownership", "Move semantics"]
  ]);
});

test("uncertain edges are flagged in both representations", () => {
  const view = buildDerivedGraphView(detail);
  assert.equal(view.cytoscape.edges[1].uncertain, "yes");
  assert.equal(view.textual.edges[1].uncertain, true);
  assert.equal(view.cytoscape.edges[0].uncertain, "no");
  assert.equal(view.textual.edges[0].uncertain, false);
});

test("difficulty is carried into the textual node list", () => {
  const view = buildDerivedGraphView(detail);
  assert.deepEqual(view.textual.nodes.map((n) => n.difficulty), [0, 1, 2]);
  assert.deepEqual(view.textual.nodes.map((n) => n.label), ["Variable scope", "Ownership", "Move semantics"]);
});
