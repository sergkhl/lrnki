import type { GraphSnapshot, PublishedConceptIdentity, RunForBuild } from "@lrnki/domain-core";
import type { ConceptIdentityCandidate } from "@lrnki/application";

// Pure mapping (plan U3): the base version's published Concepts + the selected runs'
// admitted-core candidates → the identity-resolution input (R1). The worker owns this
// load; keeping the reduction a pure function makes it unit-testable without a live DB
// (the worker entry runs `main()` on import, so the testable logic lives here, not there).
//
// A base Concept is `published: true`; a run core candidate is `published` iff its
// (declaredDomain, normalizedLabel) is already in existingConceptIdentities() — this is
// what drives the case A/B/C classification downstream. Definition spans come from each
// side's CEP, so two surface forms of one concept embed on their meaning (R2).
export function identityCandidatesFromBuildInputs(input: {
  runs: RunForBuild[];
  base: GraphSnapshot | undefined;
  existingIdentities: PublishedConceptIdentity[];
}): ConceptIdentityCandidate[] {
  const key = (declaredDomain: string, normalizedLabel: string) => `${declaredDomain}::${normalizedLabel}`;
  const publishedKeys = new Set(input.existingIdentities.map((identity) => key(identity.declaredDomain, identity.normalizedLabel)));
  const candidates: ConceptIdentityCandidate[] = [];

  if (input.base) {
    const definitionsByConcept = new Map(input.base.evidenceProfiles.map((profile) => [profile.conceptId, profile.definitions.map((definition) => definition.evidenceQuote)] as const));
    for (const concept of input.base.concepts) {
      candidates.push({
        declaredDomain: concept.declaredDomain,
        normalizedLabel: concept.normalizedLabel,
        canonicalLabel: concept.canonicalLabel,
        aliases: concept.aliases,
        definitions: definitionsByConcept.get(concept.conceptId) ?? [],
        published: true
      });
    }
  }

  for (const run of input.runs) {
    const definitionsByCandidate = new Map(run.evidenceProfiles.map((profile) => [profile.candidateKey, profile.definitions.map((definition) => definition.evidenceQuote)] as const));
    for (const candidate of run.coreCandidates) {
      candidates.push({
        declaredDomain: run.declaredDomain,
        normalizedLabel: candidate.normalizedLabel,
        canonicalLabel: candidate.canonicalLabel,
        aliases: candidate.aliases,
        definitions: definitionsByCandidate.get(candidate.candidateKey) ?? [],
        published: publishedKeys.has(key(run.declaredDomain, candidate.normalizedLabel))
      });
    }
  }

  return candidates;
}
