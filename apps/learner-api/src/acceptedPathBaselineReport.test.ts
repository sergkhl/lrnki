import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseAcceptedPathManifest } from "@lrnki/infrastructure-ingestion";
import { parseCanonicalAcceptedPathPackage } from "@lrnki/infrastructure-postgres";
import {
  acceptedPathBaselineReport,
  type AcceptedPathBaselineReport
} from "./acceptedPathBaselineReport";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const reportsPromise = loadReports();

test("the reusable accepted-path report freezes the current five-package defect baseline", async () => {
  const reports = await reportsPromise;
  assert.deepEqual(
    reports.map((report) => ({
      catalogKey: report.catalogKey,
      concepts: report.conceptCount,
      trustedEdges: report.trustedEdgeCount,
      legs: report.legCount,
      singletonLegs: report.singletonLegCount,
      legSizes: report.legSizeHistogram
    })),
    [
      { catalogKey: "critical-thinking", concepts: 31, trustedEdges: 6, legs: 26, singletonLegs: 22, legSizes: { "1": 22, "2": 3, "3": 1 } },
      { catalogKey: "probability-and-statistics", concepts: 44, trustedEdges: 14, legs: 34, singletonLegs: 25, legSizes: { "1": 25, "2": 8, "3": 1 } },
      { catalogKey: "personal-finance", concepts: 37, trustedEdges: 25, legs: 28, singletonLegs: 19, legSizes: { "1": 19, "2": 9 } },
      { catalogKey: "machine-learning", concepts: 31, trustedEdges: 10, legs: 26, singletonLegs: 21, legSizes: { "1": 21, "2": 5 } },
      { catalogKey: "neuroscience-of-memory-and-attention", concepts: 40, trustedEdges: 14, legs: 32, singletonLegs: 27, legSizes: { "1": 27, "2": 4, "5": 1 } }
    ]
  );
  assert.equal(reports.reduce((sum, report) => sum + report.conceptCount, 0), 183);
  assert.deepEqual(sumFamilies(reports, "fullBankFamilyCounts"), {
    option_select: 183,
    matching: 26,
    impostor: 43
  });
  assert.deepEqual(sumHistograms(reports.map((report) => report.lessonGroundingPassageHistogram)), {
    "1": 140,
    "2": 12,
    "3": 12,
    "4": 11,
    "5": 4,
    "6": 1,
    "7": 1,
    "8": 1,
    "10": 1
  });
  assert.equal(
    reports.flatMap((report) => report.rejectionReasonCounts)
      .filter((entry) => entry.reason.includes("matching requires at least 3 grounding passages; found 1"))
      .reduce((sum, entry) => sum + entry.count, 0),
    140
  );
  assert.equal(
    reports.flatMap((report) => report.rejectionReasonCounts)
      .filter((entry) => entry.reason.includes("impostor requires at least 2 grounding passages; found 1"))
      .reduce((sum, entry) => sum + entry.count, 0),
    140
  );
  assert.equal(
    reports.flatMap((report) => report.rejectionReasonCounts)
      .filter((entry) => entry.reason.includes("matching requires at least 3 grounding passages; found 2"))
      .reduce((sum, entry) => sum + entry.count, 0),
    12
  );
});

test("the current route keeps every trusted prerequisite before its dependent", async () => {
  for (const report of await reportsPromise) {
    assert.equal(report.trustedTopologicalViolationCount, 0, report.catalogKey);
  }
});

test("accepted package bytes, asset identities, and source cues have complete positive controls", async () => {
  for (const report of await reportsPromise) {
    assert.match(report.packageSha256, /^[a-f0-9]{64}$/);
    assert.match(report.assetSetIdentity, /^source-expedition-assets-[a-f0-9]{64}$/);
    assert.equal(report.sourceCueCount, report.conceptCount, report.catalogKey);
  }
});

test("target contract: every Leg has three to five Concepts", {
  todo: "U1 must replace singleton terminal-cone Legs with the shared route plan"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.everyLegHasThreeToFiveConcepts
  ));
});

test("target contract: source-cued route planning is explicit and remains topological", {
  todo: "U1 must persist one source-cued, prerequisite-valid route plan"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.routePlanPresent &&
    report.trustedTopologicalViolationCount === 0 &&
    report.sourceCueCount === report.conceptCount
  ));
});

test("target contract: every Leg selects matching or impostor practice", {
  todo: "U2-U3 must qualify bonus families and bind the selected mix into each Leg"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.everyLegHasMixedPractice
  ));
});

test("target contract: every Expedition selects all three Study Item families", {
  todo: "U2-U3 must qualify and select matching and impostor alongside option-select"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.expeditionUsesEveryFamily
  ));
});

test("target contract: catalog qualification calls the count totalConceptCount", {
  todo: "U4 must replace the misleading totalStopCount field end to end"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.honestConceptCount
  ));
});

test("target contract: accepted asset identity is route-sensitive", {
  todo: "U3 and package v2 must bind the exact ordered route and selected bonuses"
}, async () => {
  assert.ok((await reportsPromise).every((report) =>
    report.targetContract.routeSensitiveIdentity
  ));
});

async function loadReports(): Promise<AcceptedPathBaselineReport[]> {
  const manifest = parseAcceptedPathManifest(JSON.parse(
    await readFile(path.join(repoRoot, "fixtures/accepted-paths/manifest.json"), "utf8")
  ));
  const reports: AcceptedPathBaselineReport[] = [];
  for (const fixture of manifest.fixtures) {
    if (!fixture.acceptedPackage) throw new Error(`${fixture.catalogKey} has no accepted package.`);
    const text = await readFile(path.join(repoRoot, fixture.acceptedPackage.path), "utf8");
    const parsed = parseCanonicalAcceptedPathPackage(text);
    assert.equal(parsed.sha256, fixture.acceptedPackage.sha256, fixture.catalogKey);
    reports.push(acceptedPathBaselineReport(parsed.package, parsed.sha256));
  }
  return reports;
}

function sumFamilies(
  reports: readonly AcceptedPathBaselineReport[],
  key: "fullBankFamilyCounts" | "currentFamilyCounts"
): AcceptedPathBaselineReport["fullBankFamilyCounts"] {
  return reports.reduce((total, report) => ({
    option_select: total.option_select + report[key].option_select,
    matching: total.matching + report[key].matching,
    impostor: total.impostor + report[key].impostor
  }), { option_select: 0, matching: 0, impostor: 0 });
}

function sumHistograms(histograms: readonly Record<string, number>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const histogram of histograms) {
    for (const [key, value] of Object.entries(histogram)) {
      result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}
