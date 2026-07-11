import { expect, test } from "@jest/globals";
import type { ExpeditionCandidate } from "@lrnki/application/projection";
import { filterCatalogCandidates } from "./catalogSearch";

const candidates = [
  { enrichmentId: "carbon", title: "Carbon fixation and carbohydrate synthesis", declaredDomain: "Plant Biology", searchTerms: ["Photosynthetic pigments"] },
  { enrichmentId: "tides", title: "Tidal harmonics", declaredDomain: "Oceanography", searchTerms: [] }
] as unknown as ExpeditionCandidate[];

test("catalog search matches title and declared domain case-insensitively", () => {
  expect(filterCatalogCandidates(candidates, "PHOTO").map((candidate) => candidate.enrichmentId)).toEqual(["carbon"]);
  expect(filterCatalogCandidates(candidates, "ocean").map((candidate) => candidate.enrichmentId)).toEqual(["tides"]);
  expect(filterCatalogCandidates(candidates, "")).toBe(candidates);
});
