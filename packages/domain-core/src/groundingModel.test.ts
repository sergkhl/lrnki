import assert from "node:assert/strict";
import { test } from "node:test";
import type { Concept, EnrichmentNode } from "./index";
import { groundingForConcept, layerOf } from "./index";

test("layerOf derives the graph layer from grounding origin", () => {
  assert.equal(layerOf("document_anchored"), "asserted");
  assert.equal(layerOf("source_mentioned"), "derived");
  assert.equal(layerOf("llm_grounded"), "derived");
});

test("published concepts are document-anchored asserted anchors", () => {
  const concept: Concept = {
    conceptId: "c1",
    iri: "https://lrnki.local/concept/c1",
    canonicalLabel: "Move semantics",
    normalizedLabel: "move semantics",
    declaredDomain: "Rust",
    aliases: [],
    trustTier: "curated_source_grounded",
    homograph: false,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted"
  };

  assert.deepEqual(groundingForConcept(concept), {
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted"
  });
});

test("llm-grounded enrichment nodes are derived prerequisites without ordering attributes", () => {
  const node: EnrichmentNode = {
    nodeKind: "enrichment",
    derivedNodeId: "dn1",
    groundingOrigin: "llm_grounded",
    mintingReason: "assumed_prerequisite",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: "Stack allocation",
    normalizedLabel: "stack allocation",
    declaredDomain: "Rust",
    aliases: [],
    groundingBundle: {
      derivedNodeId: "dn1",
      groundingOrigin: "llm_grounded",
      definitions: [
        {
          passageType: "definition",
          text: "Stack allocation stores values in a last-in-first-out region of memory.",
          groundingOrigin: "llm_grounded",
          headingPath: [],
          locator: {},
          verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated grounding has no cited source block" }
        }
      ],
      mentions: [],
      scaffoldedAnchorConceptIds: ["c1"],
      generatingModel: "mock-generator",
      rationale: "Needed to scaffold Move semantics."
    }
  };

  assert.equal(node.layer, "derived");
  assert.equal(node.role, "prerequisite");
  assert.equal(node.mintingReason, "assumed_prerequisite");
  assert.equal("prerequisiteConceptId" in node, false);
  assert.equal("dependentConceptId" in node, false);
});

test("source-mentioned enrichment nodes do not carry a minting reason", () => {
  const node: EnrichmentNode = {
    nodeKind: "enrichment",
    derivedNodeId: "dn2",
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: "Borrowing",
    normalizedLabel: "borrowing",
    declaredDomain: "Rust",
    aliases: [],
    groundingPassages: [
      {
        passageType: "mention",
        text: "Borrowing lets you reference a value without taking ownership.",
        groundingOrigin: "source_mentioned",
        sourceResourceId: "s1",
        sourceBlockId: "b1",
        evidenceQuote: "Borrowing lets you reference a value without taking ownership.",
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "verified", sourceResourceId: "s1", sourceBlockId: "b1" }
      }
    ]
  };

  assert.equal("mintingReason" in node, false);
});
