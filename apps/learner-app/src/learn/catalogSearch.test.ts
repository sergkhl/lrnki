import { expect, test } from "@jest/globals";
import type { CatalogView } from "@/lib/queries";
import { filterCatalogCandidates } from "./catalogSearch";

const candidates: CatalogView["candidates"] = [
  { enrichmentId: "carbon", title: "Carbon fixation and carbohydrate synthesis", declaredDomain: "Plant Biology", totalStopCount: 3, searchTerms: ["Photosynthetic pigments"] },
  { enrichmentId: "tides", title: "Tidal harmonics", declaredDomain: "Oceanography", totalStopCount: 2, searchTerms: [] }
];

test("catalog search matches title and declared domain case-insensitively", () => {
  expect(filterCatalogCandidates(candidates, "PHOTO").map((candidate) => candidate.enrichmentId)).toEqual(["carbon"]);
  expect(filterCatalogCandidates(candidates, "ocean").map((candidate) => candidate.enrichmentId)).toEqual(["tides"]);
  expect(filterCatalogCandidates(candidates, "")).toBe(candidates);
});
