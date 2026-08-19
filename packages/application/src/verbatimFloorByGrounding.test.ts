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

// A source_mentioned node carrying arbitrary passage types (definition/mention), so the
// floor's passage-type agnosticism over rescued Definition Passages is testable (U3).
function withPassages(id: string, passages: { passageType: "definition" | "mention"; quote: string; blockId: string }[]): EnrichmentNode {
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
    groundingPassages: passages.map((p) => ({
      passageType: p.passageType,
      text: p.quote,
      groundingOrigin: "source_mentioned" as const,
      sourceResourceId: "src",
      sourceBlockId: p.blockId,
      evidenceQuote: p.quote,
      headingPath: [],
      locator: {},
      verbatimCheck: { disposition: "verified" as const, sourceResourceId: "src", sourceBlockId: p.blockId }
    }))
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
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: "generated", groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
      mentions: [],
      groundingAnchorReferences: [],
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

test("a rescued node with a verified DEFINITION passage is kept with the definition retained (U3)", () => {
  const node = withPassages("heap-allocation", [
    { passageType: "definition", quote: "the memory must be requested from the memory allocator at runtime", blockId: "b3" }
  ]);
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({
    nodes: [node],
    blockTextById: new Map([["b3", "Heap allocation means the memory must be requested from the memory allocator at runtime."]])
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].groundingOrigin, "source_mentioned");
  const kept = nodes[0] as Extract<EnrichmentNode, { groundingOrigin: "source_mentioned" }>;
  assert.equal(kept.groundingPassages.length, 1);
  assert.equal(kept.groundingPassages[0].passageType, "definition", "the floor preserves the passage type");
  assert.equal(dispositions[0].outcome, "verified");
});

test("a rescued node whose only DEFINITION passage fails verbatim match is dropped (U3)", () => {
  const node = withPassages("heap-allocation", [
    { passageType: "definition", quote: "a fabricated definition not present in the block", blockId: "b3" }
  ]);
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({
    nodes: [node],
    blockTextById: new Map([["b3", "Heap allocation means the memory must be requested from the memory allocator at runtime."]])
  });
  assert.equal(nodes.length, 0, "a definition that does not verify drops the node (floor is passage-type agnostic)");
  assert.equal(dispositions[0].outcome, "failed");
});

test("a node with a verified mention and a failed definition is kept with only the verified passage (U3)", () => {
  const node = withPassages("heap-allocation", [
    { passageType: "definition", quote: "a fabricated definition", blockId: "b3" },
    { passageType: "mention", quote: "the heap stores values", blockId: "b4" }
  ]);
  const { nodes, dispositions } = applyVerbatimFloorByGrounding({
    nodes: [node],
    blockTextById: new Map([
      ["b3", "Heap allocation means the memory must be requested from the memory allocator at runtime."],
      ["b4", "On the heap, the heap stores values of dynamic size."]
    ])
  });
  assert.equal(nodes.length, 1, "the node survives on its verified mention");
  const kept = nodes[0] as Extract<EnrichmentNode, { groundingOrigin: "source_mentioned" }>;
  assert.deepEqual(kept.groundingPassages.map((p) => p.passageType), ["mention"], "the unverified definition is stripped");
  assert.equal(dispositions[0].outcome, "verified");
});

test("the exemption is recorded per node, queryable rather than absent", () => {
  const { dispositions } = applyVerbatimFloorByGrounding({
    nodes: [llmGrounded("a"), sourceMentioned("b", "quote", "blk")],
    blockTextById: new Map([["blk", "the block contains the quote verbatim"]])
  });
  assert.equal(dispositions.length, 2);
  assert.ok(dispositions.every((d) => d.rationale.length > 0));
});
