import type { GraphSnapshot } from "@lrnki/domain-core";

// Fallback snapshot shown only when no graph version has been published yet.
const evidence = [{ sourceResourceId: "demo-source", sourceBlockId: "demo-block", evidenceQuote: "Demo evidence" }];

export const demoSnapshot: GraphSnapshot = {
  graphVersionId: "demo-core-graph-v1",
  concepts: [
    { conceptId: "calculus", iri: "https://lrnki.local/concept/calculus", canonicalLabel: "Calculus", normalizedLabel: "calculus", declaredDomain: "mathematics", aliases: [], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "derivative", iri: "https://lrnki.local/concept/derivative", canonicalLabel: "Derivative", normalizedLabel: "derivative", declaredDomain: "mathematics", aliases: ["differential coefficient"], trustTier: "curated_source_grounded", homograph: false },
    { conceptId: "limit", iri: "https://lrnki.local/concept/limit", canonicalLabel: "Limit", normalizedLabel: "limit", declaredDomain: "mathematics", aliases: [], trustTier: "curated_source_grounded", homograph: false }
  ],
  claims: [
    { claimId: "claim-1", subjectConceptId: "calculus", predicate: "part-of", object: { kind: "concept", conceptId: "derivative" }, evidence, trustTier: "curated_source_grounded", modelConfidence: 0.98, evidenceCount: 1, contradictionState: "none" },
    { claimId: "claim-2", subjectConceptId: "derivative", predicate: "asserted-prerequisite-of", object: { kind: "concept", conceptId: "limit" }, evidence, trustTier: "curated_source_grounded", modelConfidence: 0.94, evidenceCount: 1, contradictionState: "none" }
  ]
};
