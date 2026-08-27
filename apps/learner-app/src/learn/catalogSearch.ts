import type { CatalogView } from "@/lib/queries";

type CatalogCandidate = CatalogView["candidates"][number];

// Browse-all is intentionally a small client-side filter over the lazy catalog response.
export function filterCatalogCandidates(candidates: CatalogCandidate[], query: string): CatalogCandidate[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return candidates;
  return candidates.filter((candidate) =>
    `${candidate.title} ${candidate.teaser} ${candidate.declaredDomain} ${candidate.searchTerms.join(" ")}`.toLocaleLowerCase().includes(needle)
  );
}
