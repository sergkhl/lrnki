import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSnapshot, PublishedConceptIdentity, RunForBuild } from "@lrnki/domain-core";
import { identityCandidatesFromBuildInputs } from "./identityCandidateMapping";

function baseSnapshot(): GraphSnapshot {
  return {
    graphVersionId: "gv-a",
    baseGraphVersionId: null,
    concepts: [{
      conceptId: "c-ownership", iri: "https://lrnki.local/concept/ownership",
      canonicalLabel: "Ownership", normalizedLabel: "ownership", declaredDomain: "rust programming",
      aliases: ["borrow checker friend"], trustTier: "curated_source_grounded", homograph: false,
      groundingOrigin: "document_anchored", role: "anchor", layer: "asserted"
    }],
    evidenceProfiles: [{
      conceptId: "c-ownership",
      definitions: [{ sourceResourceId: "src-a", sourceBlockId: "b1", evidenceQuote: "Ownership governs memory.", headingPath: ["A"], locator: { page: 1 } }],
      mentions: [], assertions: []
    }]
  };
}

function run(): RunForBuild {
  return {
    runId: "run-b", sourceResourceId: "src-b", declaredDomain: "rust programming",
    coreCandidates: [{ candidateKey: "owner", canonicalLabel: "Owner", normalizedLabel: "owner", aliases: ["holder"] }],
    quarantinedCandidates: [],
    evidenceProfiles: [{
      candidateKey: "owner",
      definitions: [{ sourceBlockId: "b2", evidenceQuote: "An owner holds a resource.", headingPath: ["B"], locator: { page: 2 } }],
      mentions: [], assertions: [], complete: true
    }]
  };
}

test("maps base concepts as published with their definition spans", () => {
  const candidates = identityCandidatesFromBuildInputs({ runs: [], base: baseSnapshot(), existingIdentities: [] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].published, true);
  assert.equal(candidates[0].canonicalLabel, "Ownership");
  assert.deepEqual(candidates[0].definitions, ["Ownership governs memory."]);
  assert.deepEqual(candidates[0].aliases, ["borrow checker friend"]);
});

test("maps run core candidates, marking published by existing identity match", () => {
  const existing: PublishedConceptIdentity[] = [
    { conceptId: "c-ownership", iri: "x", normalizedLabel: "ownership", declaredDomain: "rust programming" }
  ];
  const candidates = identityCandidatesFromBuildInputs({ runs: [run()], base: undefined, existingIdentities: existing });
  assert.equal(candidates.length, 1);
  const owner = candidates[0];
  assert.equal(owner.normalizedLabel, "owner");
  assert.equal(owner.published, false, "owner is not yet a published identity");
  assert.deepEqual(owner.definitions, ["An owner holds a resource."]);
  assert.deepEqual(owner.aliases, ["holder"]);
});

test("a run candidate whose identity is already published is marked published", () => {
  const existing: PublishedConceptIdentity[] = [
    { conceptId: "c-owner", iri: "x", normalizedLabel: "owner", declaredDomain: "rust programming" }
  ];
  const candidates = identityCandidatesFromBuildInputs({ runs: [run()], base: undefined, existingIdentities: existing });
  assert.equal(candidates[0].published, true);
});

test("base + runs combine so a new candidate can merge into an existing published Concept (R1)", () => {
  const existing: PublishedConceptIdentity[] = [
    { conceptId: "c-ownership", iri: "x", normalizedLabel: "ownership", declaredDomain: "rust programming" }
  ];
  const candidates = identityCandidatesFromBuildInputs({ runs: [run()], base: baseSnapshot(), existingIdentities: existing });
  assert.deepEqual(candidates.map((c) => c.normalizedLabel).sort(), ["owner", "ownership"]);
  assert.equal(candidates.find((c) => c.normalizedLabel === "ownership")!.published, true);
  assert.equal(candidates.find((c) => c.normalizedLabel === "owner")!.published, false);
});
