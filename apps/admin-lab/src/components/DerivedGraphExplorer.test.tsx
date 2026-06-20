import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDerivedGraphView, summarizeOriginCounts, type DerivedGraphDetail } from "../lib/derivedGraph";

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
    { derivedNodeId: "scope", label: "Variable scope", declaredDomain: "rust", difficulty: 0, nodeKind: "enrichment", groundingOrigin: "source_mentioned", role: "prerequisite", grounding: { generatingModel: null, rationale: null, passages: [{ passageType: "mention", text: "Variable scope is mentioned in prose.", groundingOrigin: "source_mentioned" }], verbatimDisposition: "verified" } },
    { derivedNodeId: "ownership", label: "Ownership", declaredDomain: "rust", difficulty: 1, nodeKind: "anchor", groundingOrigin: "document_anchored", role: "anchor", grounding: null },
    { derivedNodeId: "move", label: "Move semantics", declaredDomain: "rust", difficulty: 2, nodeKind: "enrichment", groundingOrigin: "llm_grounded", role: "prerequisite", grounding: { generatingModel: "mock-gen", rationale: "scaffolds Ownership", passages: [{ passageType: "definition", text: "Move semantics transfer ownership.", groundingOrigin: "llm_grounded" }], verbatimDisposition: "not_applicable_by_grounding" } }
  ],
  edges: [
    { prerequisiteDerivedNodeId: "scope", dependentDerivedNodeId: "ownership", confidence: 0.9, uncertain: false, judgeModel: "kg-prerequisite-judgment" },
    { prerequisiteDerivedNodeId: "ownership", dependentDerivedNodeId: "move", confidence: 0.5, uncertain: true, judgeModel: "kg-generated-prerequisite-judgment" }
  ],
  originCounts: summarizeOriginCounts([
    { declaredDomain: "rust", groundingOrigin: "source_mentioned" },
    { declaredDomain: "rust", groundingOrigin: "document_anchored" },
    { declaredDomain: "rust", groundingOrigin: "llm_grounded" }
  ]),
  rescueDispositions: [
    { derivedNodeId: "scope", canonicalLabel: "Variable scope", declaredDomain: "rust", disposition: "accepted", rationale: "durable prerequisite", groundingSpan: "" },
    { derivedNodeId: "ablation", canonicalLabel: "Table 3 Ablation", declaredDomain: "rust", disposition: "dropped", rationale: "incidental artifact", groundingSpan: "Table 3" }
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

// U8: the view model distinguishes anchors from enrichment nodes (R15) and surfaces
// each enrichment node's grounding bundle + recorded verbatim disposition (R15, AE3).
test("anchors and enrichment nodes are distinguished, with grounding exposed", () => {
  const view = buildDerivedGraphView(detail);
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.nodeKind), ["enrichment", "anchor", "enrichment"]);
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.groundingOrigin), ["source_mentioned", "document_anchored", "llm_grounded"]);
  // The anchor carries no grounding bundle; both enrichment nodes do.
  const anchor = view.textual.nodes.find((n) => n.nodeKind === "anchor");
  assert.equal(anchor?.grounding, null);
  const minted = view.textual.nodes.find((n) => n.groundingOrigin === "llm_grounded");
  assert.equal(minted?.grounding?.verbatimDisposition, "not_applicable_by_grounding");
  assert.equal(minted?.grounding?.passages[0].text, "Move semantics transfer ownership.");
  const rescued = view.textual.nodes.find((n) => n.groundingOrigin === "source_mentioned");
  assert.equal(rescued?.grounding?.verbatimDisposition, "verified");
});

// AE5: a rescued source_mentioned node relates to an anchor via a prerequisite EDGE,
// never a node attribute.
test("a rescued node's relationship to an anchor is an edge, not an attribute", () => {
  const view = buildDerivedGraphView(detail);
  const edge = view.textual.edges.find((e) => e.prerequisiteLabel === "Variable scope" && e.dependentLabel === "Ownership");
  assert.ok(edge, "the rescued node precedes the anchor via an inferred edge");
});

// U5/AE1: the per-domain origin counts aggregate anchor / source_mentioned / llm_grounded.
test("origin counts aggregate the derived node space per domain", () => {
  assert.deepEqual(detail.originCounts, [{ domain: "rust", anchor: 1, sourceMentioned: 1, llmGrounded: 1 }]);
});

// U5: each textual edge carries the judge model that ordered the pair — the
// generated-node edge is cross-family, the anchor pair is the DeepSeek alias.
test("per-edge judge model is carried into the textual edge list", () => {
  const view = buildDerivedGraphView(detail);
  assert.equal(view.textual.edges[0].judgeModel, "kg-prerequisite-judgment");
  assert.equal(view.textual.edges[1].judgeModel, "kg-generated-prerequisite-judgment");
});

// U5: rescue dispositions surface accepted vs dropped with rationale.
test("rescue dispositions distinguish accepted and dropped with rationale", () => {
  assert.equal(detail.rescueDispositions.find((d) => d.canonicalLabel === "Variable scope")?.disposition, "accepted");
  const dropped = detail.rescueDispositions.find((d) => d.disposition === "dropped");
  assert.equal(dropped?.canonicalLabel, "Table 3 Ablation");
  assert.equal(dropped?.rationale, "incidental artifact");
});
