import type { ExpeditionCandidate } from "@lrnki/application/projection";

// Browse-all is intentionally a small client-side filter over the lazy catalog response.
export function filterCatalogCandidates(candidates: ExpeditionCandidate[], query: string): ExpeditionCandidate[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return candidates;
  return candidates.filter((candidate) =>
    `${candidate.title} ${candidate.declaredDomain} ${candidate.searchTerms.join(" ")}`.toLocaleLowerCase().includes(needle)
  );
}
