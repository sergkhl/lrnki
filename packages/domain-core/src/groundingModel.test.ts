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
  assert.equal("prerequisiteConceptId" in node, false);
  assert.equal("dependentConceptId" in node, false);
});
