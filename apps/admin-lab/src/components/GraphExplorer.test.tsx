import assert from "node:assert/strict";
import { test } from "node:test";
import type { GraphSnapshot, PublishedEvidencePassage } from "@lrnki/domain-core";
import { filterConcepts, groupPassagesBySource, profileFor, summarizeSnapshot } from "../lib/publishedView";

// The GraphExplorer renders the published asserted layer: Concepts + CEPs with
// ZERO asserted edges (R5, AE4). Its view-model logic lives in pure helpers so it
// is testable without a DOM. Tests cover U6 scenarios 1, 2, and 4.

const passage = (sourceResourceId: string, quote: string): PublishedEvidencePassage => ({
  sourceResourceId,
  sourceBlockId: `${sourceResourceId}-block`,
  evidenceQuote: quote,
  headingPath: ["H"],
  locator: {}
});

const snapshot: GraphSnapshot = {
  graphVersionId: "gv-2",
  baseGraphVersionId: "gv-1",
  concepts: [
    { conceptId: "c1", iri: "iri:1", canonicalLabel: "Derivative", normalizedLabel: "derivative", declaredDomain: "math", aliases: ["differential coefficient"], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "c2", iri: "iri:2", canonicalLabel: "Limit", normalizedLabel: "limit", declaredDomain: "math", aliases: [], trustTier: "curated_source_grounded", homograph: false }
  ],
  evidenceProfiles: [
    {
      conceptId: "c1",
      definitions: [passage("sourceA", "A derivative measures change."), passage("sourceB", "Rate of change of a function.")],
      mentions: [passage("sourceA", "Derivatives appear in optimization.")],
      assertions: [{ type: "explicit-prerequisite-hint", objectConceptId: "c2", evidence: [passage("sourceA", "defined via a limit")] }]
    }
  ]
};

test("summarizeSnapshot always reports zero asserted edges", () => {
  const summary = summarizeSnapshot(snapshot);
  assert.equal(summary.edgeCount, 0);
  assert.equal(summary.conceptCount, 2);
  assert.equal(summary.passageCount, 3); // 2 definitions + 1 mention
  assert.equal(summary.assertionCount, 1);
});

test("groupPassagesBySource keeps multi-source provenance without dropping passages", () => {
  const groups = groupPassagesBySource(snapshot.evidenceProfiles[0].definitions);
  assert.deepEqual(groups.map((g) => g.sourceResourceId), ["sourceA", "sourceB"]);
  assert.equal(groups[0].passages.length, 1);
  assert.equal(groups[1].passages[0].evidenceQuote, "Rate of change of a function.");
});

test("filterConcepts matches labels and aliases case-insensitively", () => {
  assert.deepEqual(filterConcepts(snapshot, "DIFFERENTIAL").map((c) => c.conceptId), ["c1"]);
  assert.deepEqual(filterConcepts(snapshot, "lim").map((c) => c.conceptId), ["c2"]);
  assert.equal(filterConcepts(snapshot, "").length, 2);
});

test("profileFor returns an empty profile for a concept with no CEP", () => {
  const empty = profileFor(snapshot, "c2");
  assert.equal(empty.conceptId, "c2");
  assert.deepEqual(empty.definitions, []);
  assert.deepEqual(empty.mentions, []);
  assert.deepEqual(empty.assertions, []);
});
