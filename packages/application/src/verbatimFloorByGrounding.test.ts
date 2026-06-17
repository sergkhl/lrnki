import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnrichmentNode } from "@lrnki/domain-core";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";

function sourceMentioned(id: string, quote: string, blockId: string): EnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId: id,
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: id,
    normalizedLabel: id,
    declaredDomain: "software engineering",
    aliases: [],
    groundingPassages: [{
      passageType: "mention",
      text: quote,
      groundingOrigin: "source_mentioned",
      sourceResourceId: "src",
      sourceBlockId: blockId,
      evidenceQuote: quote,
      headingPath: [],
      locator: {},
      verbatimCheck: { disposition: "verified", sourceResourceId: "src", sourceBlockId: blockId }
    }]
  };
}

function llmGrounded(id: string): EnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId: id,
    groundingOrigin: "llm_grounded",
    mintingReason: "assumed_prerequisite",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: id,
    normalizedLabel: id,
    declaredDomain: "software engineering",
    aliases: [],
    groundingBundle: {
      derivedNodeId: id,
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: "generated", groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
      mentions: [],
      scaffoldedAnchorConceptIds: [],
      generatingModel: "mock",
      rationale: "r"
    }
  };
}

test("a source_mentioned passage that does not match its cited block is rejected (floor intact)", () => {
  const node = sourceMentioned("borrowing", "Borrowing lets you reference a value.", "b2");
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({
    nodes: [node],
    blockTextById: new Map([["b2", "Some entirely different block text about ownership."]])
  });
  assert.equal(nodes.length, 0, "the node is dropped because its quote fails verbatim verification");
  assert.equal(dispositions[0].outcome, "failed");
});

test("a source_mentioned passage that matches its cited block is kept and recorded verified", () => {
  const node = sourceMentioned("borrowing", "Borrowing lets you reference a value", "b2");
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({
    nodes: [node],
    blockTextById: new Map([["b2", "Borrowing lets you reference a value without taking ownership."]])
  });
  assert.equal(nodes.length, 1);
  assert.equal(dispositions[0].outcome, "verified");
});

test("a llm_grounded passage is exempt with a recorded not_applicable_by_grounding disposition", () => {
  const node = llmGrounded("stack-allocation");
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({ nodes: [node], blockTextById: new Map() });
  assert.equal(nodes.length, 1, "the minted node is accepted, not a run failure");
  assert.equal(dispositions[0].outcome, "not_applicable_by_grounding");
  assert.equal(dispositions[0].derivedNodeId, "stack-allocation");
});

test("the exemption is recorded per node, queryable rather than absent", () => {
  const { dispositions } = applyVerbatimFloorByGrounding({
    nodes: [llmGrounded("a"), sourceMentioned("b", "quote", "blk")],
    blockTextById: new Map([["blk", "the block contains the quote verbatim"]])
  });
  assert.equal(dispositions.length, 2);
  assert.ok(dispositions.every((d) => d.rationale.length > 0));
});
