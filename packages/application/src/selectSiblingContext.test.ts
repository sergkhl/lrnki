import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphLayer, DerivedGraphNode, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import { selectSiblingContext } from "./selectSiblingContext";

function anchor(id: string, domain = "software engineering"): DerivedGraphNode {
  return {
    nodeKind: "anchor",
    derivedNodeId: id,
    conceptId: `concept-${id}`,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: id,
    normalizedLabel: id.toLowerCase(),
    declaredDomain: domain,
    aliases: []
  };
}

function edge(prereq: string, dependent: string): InferredPrerequisiteEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence: 0.9,
    uncertain: false,
    provenance: { judgmentRationale: "test" }
  };
}

function layerOf(nodes: DerivedGraphNode[], edges: InferredPrerequisiteEdge[] = []): DerivedGraphLayer {
  return {
    enrichmentId: "enr-1",
    graphVersionId: "gv-1",
    enrichmentConfigHash: "cfg",
    judgeModel: "mock",
    derivedNodes: nodes,
    prerequisiteEdges: edges,
    difficulties: []
  };
}

test("returns same-domain neighbors only and excludes the target node", () => {
  const target = anchor("Move");
  const layer = layerOf([target, anchor("Ownership"), anchor("Bond pricing", "economics")]);
  const siblings = selectSiblingContext(target, layer);
  assert.deepEqual(siblings.map((s) => s.label), ["Ownership"]);
});

test("ranks prerequisite-adjacent siblings ahead of other same-domain nodes", () => {
  const target = anchor("Move");
  const adjacent = anchor("Ownership");
  const other = anchor("Lifetime");
  // declaration order puts `other` before `adjacent`; adjacency must reorder it ahead.
  const layer = layerOf([target, other, adjacent], [edge("Ownership", "Move")]);
  const siblings = selectSiblingContext(target, layer);
  assert.deepEqual(siblings.map((s) => s.label), ["Ownership", "Lifetime"]);
});

test("caps at N", () => {
  const target = anchor("Move");
  const others = Array.from({ length: 10 }, (_, i) => anchor(`Sib${i}`));
  const siblings = selectSiblingContext(target, layerOf([target, ...others]), 3);
  assert.equal(siblings.length, 3);
});

test("a node whose domain has no other members returns an empty sibling set (sibling-poor, no throw)", () => {
  const target = anchor("Lonely", "economics");
  const layer = layerOf([target, anchor("Ownership"), anchor("Move")]);
  assert.deepEqual(selectSiblingContext(target, layer), []);
});

test("source-mentioned sibling contributes its mention text as a snippet", () => {
  const target = anchor("Move");
  const mentioned: DerivedGraphNode = {
    nodeKind: "enrichment",
    derivedNodeId: "Borrowing",
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: "Borrowing",
    normalizedLabel: "borrowing",
    declaredDomain: "software engineering",
    aliases: [],
    groundingPassages: [
      {
        passageType: "mention",
        text: "Borrowing lends a reference without moving ownership.",
        groundingOrigin: "source_mentioned",
        sourceResourceId: "res-1",
        sourceBlockId: "b1",
        evidenceQuote: "Borrowing lends a reference",
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "verified", sourceResourceId: "res-1", sourceBlockId: "b1" }
      }
    ]
  };
  const siblings = selectSiblingContext(target, layerOf([target, mentioned]));
  assert.equal(siblings[0].snippet, "Borrowing lends a reference without moving ownership.");
});
