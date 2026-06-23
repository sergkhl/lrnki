import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDerivedGraphView, distinctDomains, nodeRenderAttrs, summarizeOriginCounts, type DerivedGraphDetail } from "../lib/derivedGraph";

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
    { derivedNodeId: "scope", label: "Variable scope", aliases: [], declaredDomain: "rust", difficulty: 0, difficultyRationale: "Foundational, concrete, low background load.", nodeKind: "enrichment", groundingOrigin: "source_mentioned", role: "prerequisite", hasStudyItem: true, grounding: { generatingModel: null, rationale: null, passages: [{ passageType: "mention", text: "Variable scope is mentioned in prose.", groundingOrigin: "source_mentioned" }], verbatimDisposition: "verified" } },
    { derivedNodeId: "ownership", label: "Ownership", aliases: ["owning"], declaredDomain: "rust", difficulty: 1, difficultyRationale: "Abstract, composes several prior mechanics.", nodeKind: "anchor", groundingOrigin: "document_anchored", role: "anchor", hasStudyItem: true, grounding: null },
    { derivedNodeId: "move", label: "Move semantics", aliases: [], declaredDomain: "rust", difficulty: 2, difficultyRationale: "Builds directly on ownership transfer.", nodeKind: "enrichment", groundingOrigin: "llm_grounded", role: "prerequisite", hasStudyItem: false, grounding: { generatingModel: "mock-gen", rationale: "scaffolds Ownership", passages: [{ passageType: "definition", text: "Move semantics transfer ownership.", groundingOrigin: "llm_grounded" }], verbatimDisposition: "not_applicable_by_grounding" } }
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
  ],
  merges: [
    { declaredDomain: "rust", canonicalDerivedNodeId: "ownership", canonicalLabel: "Ownership", absorbedLabel: "Ownership (Rust)", absorbedAliases: ["owning"], proposingSignal: "embedding_cosine", proposingScore: 0.97, rationale: "two surface forms of one concept", canonicalSelectionReason: "anchor_over_enrichment" }
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

// U5: each semantic merge is surfaced in the equivalent textual readout with canonical
// label, absorbed label, proposing signal, and score, so a non-visual reader sees it.
test("semantic merges appear in the textual output", () => {
  const view = buildDerivedGraphView(detail);
  assert.equal(view.textual.merges.length, 1);
  const merge = view.textual.merges[0];
  assert.equal(merge.canonicalLabel, "Ownership");
  assert.equal(merge.absorbedLabel, "Ownership (Rust)");
  assert.equal(merge.proposingSignal, "embedding_cosine");
  assert.ok(Math.abs(merge.proposingScore - 0.97) < 1e-9);
  assert.equal(merge.canonicalSelectionReason, "anchor_over_enrichment");
});

test("an empty merges list yields an empty textual merges array", () => {
  const view = buildDerivedGraphView({ ...detail, merges: [] });
  assert.deepEqual(view.textual.merges, []);
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

// U4/AE4: the generated difficulty rationale follows the same path as `difficulty`
// through both the cytoscape and textual node shapes.
test("the difficulty rationale is carried onto every node in both representations", () => {
  const view = buildDerivedGraphView(detail);
  assert.deepEqual(view.textual.nodes.map((n) => n.difficultyRationale), [
    "Foundational, concrete, low background load.",
    "Abstract, composes several prior mechanics.",
    "Builds directly on ownership transfer."
  ]);
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.difficultyRationale), view.textual.nodes.map((n) => n.difficultyRationale));
});

// A node with no persisted difficulty row carries `null`, never coerced to "".
test("a null difficulty rationale is preserved, not coerced to an empty string", () => {
  const withNullRationale: DerivedGraphDetail = {
    ...detail,
    nodes: [{ ...detail.nodes[0], derivedNodeId: "nd", label: "No rationale", difficultyRationale: null }]
  };
  const view = buildDerivedGraphView(withNullRationale);
  assert.equal(view.cytoscape.nodes[0].difficultyRationale, null);
  assert.equal(view.textual.nodes[0].difficultyRationale, null);
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

// --- Region grouping (U3, R2): each declared domain → one compound-parent region ---

test("distinctDomains groups nodes into one sorted region per declared domain", () => {
  const nodes = [{ domain: "rust" }, { domain: "biology" }, { domain: "rust" }, { domain: "economics" }];
  assert.deepEqual(distinctDomains(nodes), ["biology", "economics", "rust"]);
});

test("a single-domain graph yields exactly one region", () => {
  const view = buildDerivedGraphView(detail); // detail is all-rust
  assert.deepEqual(distinctDomains(view.cytoscape.nodes), ["rust"]);
});

// --- U3 adapted overlay view-model (R4/R5/R6/R7) ---------------------------

const classification = {
  stateByNode: { scope: "mastered", ownership: "frontier", move: "locked" } as const,
  selectedFrontierTarget: "ownership"
};

test("neutral mode (no adapted arg) leaves every node unclassified and untargeted", () => {
  const view = buildDerivedGraphView(detail);
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.adaptedState), [null, null, null]);
  assert.deepEqual(view.textual.nodes.map((n) => n.adaptedState), [null, null, null]);
  assert.equal(view.cytoscape.nodes.every((n) => n.isFrontierTarget === false), true);
  // Existing neutral assertions still hold (edges unchanged).
  assert.deepEqual(view.cytoscape.edges.map((e) => [e.source, e.target]), [["scope", "ownership"], ["ownership", "move"]]);
});

test("adapted mode tags each node with its classification and marks the single frontier target", () => {
  const view = buildDerivedGraphView(detail, classification);
  const byId = new Map(view.cytoscape.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get("scope")?.adaptedState, "mastered");
  assert.equal(byId.get("ownership")?.adaptedState, "frontier");
  assert.equal(byId.get("move")?.adaptedState, "locked");
  // Exactly one node is the frontier target, and it is the selected one.
  const targets = view.cytoscape.nodes.filter((n) => n.isFrontierTarget).map((n) => n.id);
  assert.deepEqual(targets, ["ownership"]);
});

test("a itemless node carries cardless:true in both cytoscape and textual representations (R6)", () => {
  const view = buildDerivedGraphView(detail, classification);
  assert.equal(view.cytoscape.nodes.find((n) => n.id === "move")?.cardless, true);
  assert.equal(view.textual.nodes.find((n) => n.label === "Move semantics")?.cardless, true);
  // Itemed nodes are not flagged.
  assert.equal(view.cytoscape.nodes.find((n) => n.id === "ownership")?.cardless, false);
});

test("difficulty is present on every node for size mapping; null difficulty is preserved, not coerced to 0", () => {
  const withNull: DerivedGraphDetail = {
    ...detail,
    nodes: [{ ...detail.nodes[0], derivedNodeId: "nd", label: "No difficulty", difficulty: null, hasStudyItem: true }]
  };
  const view = buildDerivedGraphView(withNull);
  assert.equal(view.cytoscape.nodes[0].difficulty, null);
  assert.equal(view.textual.nodes[0].difficulty, null);
});

// Covers R5: cytoscape and textual node sets stay equal in length and describe the same
// nodes in adapted mode.
test("cytoscape and textual node sets stay equal and describe the same nodes in adapted mode", () => {
  const view = buildDerivedGraphView(detail, classification);
  assert.equal(view.cytoscape.nodes.length, view.textual.nodes.length);
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.label), view.textual.nodes.map((n) => n.label));
  assert.deepEqual(view.cytoscape.nodes.map((n) => n.adaptedState), view.textual.nodes.map((n) => n.adaptedState));
});

// --- U2 single-canvas restyle attrs (R10/R11/R13) --------------------------
// `nodeRenderAttrs` is the pure source of the two mode-dependent Cytoscape `data`
// attributes the restyle effect writes. The one-time layout owns positions; these
// attrs are the ONLY thing a mode swap changes, so the helper fully captures the swap.

test("neutral mode yields the baseline 'none'/'no' for every node, ignoring any classification", () => {
  for (const id of ["scope", "ownership", "move", "absent"]) {
    assert.deepEqual(nodeRenderAttrs("neutral", classification, id), { adaptedState: "none", frontierTarget: "no" });
  }
});

test("adapted mode yields each node's mastered/frontier/locked state and marks only the frontier target", () => {
  assert.deepEqual(nodeRenderAttrs("adapted", classification, "scope"), { adaptedState: "mastered", frontierTarget: "no" });
  assert.deepEqual(nodeRenderAttrs("adapted", classification, "ownership"), { adaptedState: "frontier", frontierTarget: "yes" });
  assert.deepEqual(nodeRenderAttrs("adapted", classification, "move"), { adaptedState: "locked", frontierTarget: "no" });
});

test("adapted mode with no classification falls back to the neutral baseline", () => {
  assert.deepEqual(nodeRenderAttrs("adapted", undefined, "scope"), { adaptedState: "none", frontierTarget: "no" });
});

test("a node absent from the classification gets 'none' rather than throwing", () => {
  assert.deepEqual(nodeRenderAttrs("adapted", classification, "absent"), { adaptedState: "none", frontierTarget: "no" });
});

// Covers R11/R13 regression guard: neutral-mode view-model is byte-equivalent to the
// pre-reshape enrichment render (no classification overlay), so the enrichment page is
// unaffected by the reshape. A itemless node stays flagged in this neutral view (R13).
test("neutral-mode view-model equals the no-classification render (enrichment-page regression guard)", () => {
  assert.deepEqual(buildDerivedGraphView(detail, undefined), buildDerivedGraphView(detail));
  assert.equal(buildDerivedGraphView(detail).cytoscape.nodes.find((n) => n.id === "move")?.cardless, true);
});
