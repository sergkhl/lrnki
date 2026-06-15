import type { GraphSnapshot, PublishedEvidencePassage } from "@lrnki/domain-core";

// Fallback snapshot shown only when no graph version has been published yet. The
// published asserted layer is Concepts + CEPs with ZERO asserted edges (ADR-0007
// reset, R5); prerequisite edges appear only in a Derived Graph Layer.
const passage = (quote: string): PublishedEvidencePassage => ({
  sourceResourceId: "demo-source",
  sourceBlockId: "demo-block",
  evidenceQuote: quote,
  headingPath: ["Demo"],
  locator: {}
});

export const demoSnapshot: GraphSnapshot = {
  graphVersionId: "demo-core-graph-v1",
  baseGraphVersionId: null,
  concepts: [
    { conceptId: "calculus", iri: "https://lrnki.local/concept/calculus", canonicalLabel: "Calculus", normalizedLabel: "calculus", declaredDomain: "mathematics", aliases: [], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "derivative", iri: "https://lrnki.local/concept/derivative", canonicalLabel: "Derivative", normalizedLabel: "derivative", declaredDomain: "mathematics", aliases: ["differential coefficient"], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "limit", iri: "https://lrnki.local/concept/limit", canonicalLabel: "Limit", normalizedLabel: "limit", declaredDomain: "mathematics", aliases: [], trustTier: "curated_source_grounded", homograph: false }
  ],
  evidenceProfiles: [
    { conceptId: "calculus", definitions: [passage("Calculus is the mathematical study of continuous change.")], mentions: [passage("Calculus builds on the notions of limit and derivative.")], assertions: [] },
    { conceptId: "derivative", definitions: [passage("The derivative measures the instantaneous rate of change of a function.")], mentions: [], assertions: [{ type: "explicit-prerequisite-hint", objectConceptId: "limit", evidence: [passage("The derivative is defined as a limit of difference quotients.")] }] },
    { conceptId: "limit", definitions: [passage("A limit describes the value a function approaches as its input approaches some point.")], mentions: [], assertions: [] }
  ]
};
