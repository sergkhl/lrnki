import type { GraphSnapshot } from "@lrnki/domain-core";
const evidence = [{ sourceResourceId: "demo-source", sourceBlockId: "demo-block", evidenceQuote: "Demo evidence" }];
export const demoSnapshot: GraphSnapshot = { graphVersionId: "demo-core-graph-v1", concepts: [
  { conceptId: "calculus", iri: "https://lrnki.local/concept/calculus", canonicalLabel: "Calculus", aliases: [], trustTier: "curated_source_grounded" },
  { conceptId: "derivative", iri: "https://lrnki.local/concept/derivative", canonicalLabel: "Derivative", aliases: ["differential coefficient"], trustTier: "curated_source_grounded" },
  { conceptId: "integral", iri: "https://lrnki.local/concept/integral", canonicalLabel: "Integral", aliases: [], trustTier: "curated_source_grounded" },
  { conceptId: "limit", iri: "https://lrnki.local/concept/limit", canonicalLabel: "Limit", aliases: [], trustTier: "curated_source_grounded" }
], claims: [
  { claimId: "claim-1", subjectConceptId: "calculus", predicate: "includes", object: { kind: "concept", conceptId: "derivative" }, scope: "durable_domain_knowledge", evidence, confidence: 0.98, contradictionState: "none" },
  { claimId: "claim-2", subjectConceptId: "calculus", predicate: "includes", object: { kind: "concept", conceptId: "integral" }, scope: "durable_domain_knowledge", evidence, confidence: 0.98, contradictionState: "none" },
  { claimId: "claim-3", subjectConceptId: "derivative", predicate: "depends_on", object: { kind: "concept", conceptId: "limit" }, scope: "durable_domain_knowledge", evidence, confidence: 0.94, contradictionState: "none" },
  { claimId: "claim-4", subjectConceptId: "integral", predicate: "related_to", object: { kind: "concept", conceptId: "limit" }, scope: "durable_domain_knowledge", evidence, confidence: 0.83, contradictionState: "none" }
] };
