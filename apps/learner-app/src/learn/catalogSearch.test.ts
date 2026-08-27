import { expect, test } from "@jest/globals";
import type { CatalogView } from "@/lib/queries";
import { filterCatalogCandidates } from "./catalogSearch";

const candidates: CatalogView["candidates"] = [
  { enrichmentId: "carbon", catalogKey: "carbon", title: "Carbon fixation and carbohydrate synthesis", teaser: "Follow light into stored energy.", declaredDomain: "Plant Biology", sortOrder: 1, totalStopCount: 3, searchTerms: ["Photosynthetic pigments"] },
  { enrichmentId: "tides", catalogKey: "tides", title: "Tidal harmonics", teaser: "Reason about repeating coastal motion.", declaredDomain: "Oceanography", sortOrder: 2, totalStopCount: 2, searchTerms: [] }
];

test("catalog search matches accepted title, teaser, and underlying terms case-insensitively", () => {
  expect(filterCatalogCandidates(candidates, "PHOTO").map((candidate) => candidate.enrichmentId)).toEqual(["carbon"]);
  expect(filterCatalogCandidates(candidates, "ocean").map((candidate) => candidate.enrichmentId)).toEqual(["tides"]);
  expect(filterCatalogCandidates(candidates, "coastal").map((candidate) => candidate.enrichmentId)).toEqual(["tides"]);
  expect(filterCatalogCandidates(candidates, "")).toBe(candidates);
});
