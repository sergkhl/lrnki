import assert from "node:assert/strict";
import { test } from "node:test";
import type { GraphSnapshot } from "@lrnki/domain-core";
import { exportGraphAsJsonLd } from "./index";

// U6 test scenario 6: JSON-LD export contains Concept identity, labels, and
// aliases but NO asserted relation or CEP evidence triples (R5, AE1). The export
// stops implying authoritative source relations.

const snapshot: GraphSnapshot = {
  graphVersionId: "gv-1",
  baseGraphVersionId: null,
  concepts: [
    { conceptId: "c1", iri: "https://lrnki.local/concept/derivative", canonicalLabel: "Derivative", normalizedLabel: "derivative", declaredDomain: "mathematics", aliases: ["differential coefficient"], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "c2", iri: "https://lrnki.local/concept/limit", canonicalLabel: "Limit", normalizedLabel: "limit", declaredDomain: "mathematics", aliases: [], trustTier: "curated_source_grounded", homograph: false }
  ],
  evidenceProfiles: [
    { conceptId: "c1", definitions: [{ sourceResourceId: "s1", sourceBlockId: "b1", evidenceQuote: "A derivative measures change.", headingPath: [], locator: {} }], mentions: [], assertions: [{ type: "explicit-prerequisite-hint", objectConceptId: "c2", evidence: [{ sourceResourceId: "s1", sourceBlockId: "b2", evidenceQuote: "defined as a limit", headingPath: [], locator: {} }] }] },
    { conceptId: "c2", definitions: [{ sourceResourceId: "s1", sourceBlockId: "b3", evidenceQuote: "A limit is a value approached.", headingPath: [], locator: {} }], mentions: [], assertions: [] }
  ]
};

test("exports concept identity, labels, and aliases", () => {
  const jsonLd = exportGraphAsJsonLd(snapshot);
  assert.equal(jsonLd["@id"], "https://lrnki.local/graph/gv-1");
  assert.equal(jsonLd["@graph"].length, 2);
  const derivative = jsonLd["@graph"][0];
  assert.equal(derivative["@id"], "https://lrnki.local/concept/derivative");
  assert.equal(derivative["@type"], "skos:Concept");
  assert.equal(derivative.label, "Derivative");
  assert.deepEqual(derivative["skos:altLabel"], ["differential coefficient"]);
});

test("exports no asserted relation or CEP evidence triples", () => {
  const jsonLd = exportGraphAsJsonLd(snapshot);
  const serialized = JSON.stringify(jsonLd);
  // No evidence quotes, no prerequisite hints, no edge/relation vocabulary leak.
  assert.ok(!serialized.includes("measures change"));
  assert.ok(!serialized.includes("prerequisite"));
  assert.ok(!serialized.includes("defines"));
  assert.ok(!/relation/i.test(serialized));
  // Each exported node has exactly the identity keys — nothing evidence-shaped.
  for (const node of jsonLd["@graph"]) {
    assert.deepEqual(Object.keys(node).sort(), ["@id", "@type", "label", "skos:altLabel"].sort());
  }
});
