import type {
  GraphSnapshot,
  PublishedConceptEvidenceProfile,
  PublishedEvidencePassage
} from "@lrnki/domain-core";

// Pure, JSX-free view-model helpers for the published Graph Explorer. Kept out of
// the React component so they are unit-testable under `tsx --test` without a DOM
// (the published asserted layer is Concepts + CEPs with ZERO asserted edges —
// ADR-0007 reset, R5). The component renders what these return.

export const EMPTY_PROFILE: Omit<PublishedConceptEvidenceProfile, "conceptId"> = {
  definitions: [],
  mentions: [],
  assertions: []
};

// Group passages by their curated source so a multi-source CEP shows provenance
// without dropping heading paths or locators (U6 test scenario 2). Insertion order
// of first appearance per source is preserved.
export function groupPassagesBySource(
  passages: PublishedEvidencePassage[]
): { sourceResourceId: string; passages: PublishedEvidencePassage[] }[] {
  const bySource = new Map<string, PublishedEvidencePassage[]>();
  for (const passage of passages) {
    bySource.set(passage.sourceResourceId, [...(bySource.get(passage.sourceResourceId) ?? []), passage]);
  }
  return [...bySource.entries()].map(([sourceResourceId, sourcePassages]) => ({ sourceResourceId, passages: sourcePassages }));
}

export interface SnapshotSummary {
  graphVersionId: string;
  conceptCount: number;
  passageCount: number;
  assertionCount: number;
  // Always 0: a published snapshot exposes no asserted edges (R5, AE4).
  edgeCount: 0;
}

export function summarizeSnapshot(snapshot: GraphSnapshot): SnapshotSummary {
  let passageCount = 0;
  let assertionCount = 0;
  for (const profile of snapshot.evidenceProfiles) {
    passageCount += profile.definitions.length + profile.mentions.length;
    assertionCount += profile.assertions.length;
  }
  return {
    graphVersionId: snapshot.graphVersionId,
    conceptCount: snapshot.concepts.length,
    passageCount,
    assertionCount,
    edgeCount: 0
  };
}

export function profileFor(
  snapshot: GraphSnapshot,
  conceptId: string
): PublishedConceptEvidenceProfile {
  return (
    snapshot.evidenceProfiles.find((profile) => profile.conceptId === conceptId) ?? {
      conceptId,
      ...EMPTY_PROFILE
    }
  );
}

export function conceptLabel(snapshot: GraphSnapshot, conceptId: string): string {
  return snapshot.concepts.find((concept) => concept.conceptId === conceptId)?.canonicalLabel ?? conceptId;
}

// Case-insensitive label/alias filter for the master-detail concept list.
export function filterConcepts(snapshot: GraphSnapshot, query: string): GraphSnapshot["concepts"] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return snapshot.concepts;
  return snapshot.concepts.filter(
    (concept) =>
      concept.canonicalLabel.toLowerCase().includes(normalizedQuery) ||
      concept.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
  );
}
