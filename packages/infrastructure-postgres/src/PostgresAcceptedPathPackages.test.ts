import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ACCEPTED_PATH_PACKAGE_TABLES,
  parseAcceptedPathPackage,
  parseCanonicalAcceptedPathPackage,
  serializeAcceptedPathPackage,
  validateAcceptedPathPackageSet
} from "./PostgresAcceptedPathPackages";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const packagePath = path.join(
  repoRoot,
  "fixtures/accepted-paths/packages/critical-thinking.json"
);
const manifestPath = path.join(repoRoot, "fixtures/accepted-paths/manifest.json");

test("the sealed Critical Thinking package is canonical, digest-bound, and globally scoped", async () => {
  const [text, manifestText] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(manifestPath, "utf8")
  ]);
  const parsed = parseCanonicalAcceptedPathPackage(text);
  const manifest = JSON.parse(manifestText) as {
    fixtures: Array<{ catalogKey: string; acceptedPackage?: { sha256: string } }>;
  };
  const expectedDigest = manifest.fixtures.find(
    (entry) => entry.catalogKey === "critical-thinking"
  )?.acceptedPackage?.sha256;

  assert.equal(parsed.sha256, expectedDigest);
  assert.equal(serializeAcceptedPathPackage(parsed.package), text);
  assert.equal(parsed.package.catalog.title, "Critical Thinking");
  assert.equal(parsed.package.qualification.totalStopCount, 31);
  assert.equal(parsed.package.qualification.trailNodeIds.length, 31);

  const tableNames: string[] = Object.keys(
    (parsed.package.projection as { tables: Record<string, unknown[]> }).tables
  ).sort();
  assert.deepEqual(tableNames, [...ACCEPTED_PATH_PACKAGE_TABLES].sort());
  const packageTableNames = new Set<string>(tableNames);
  for (const forbidden of [
    "user",
    "account",
    "session",
    "verification",
    "learner_expeditions",
    "response_log",
    "lesson_reads",
    "operation_runs",
    "operation_run_stages"
  ]) {
    assert.equal(packageTableNames.has(forbidden), false);
  }
});

test("package parsing refuses an undeclared learner table and an incomplete foreign-key closure", async () => {
  const original = JSON.parse(await readFile(packagePath, "utf8")) as {
    projection: { tables: Record<string, Array<Record<string, unknown>>> };
  };
  const withLearnerTable = structuredClone(original);
  withLearnerTable.projection.tables.user = [];
  assert.throws(() => parseAcceptedPathPackage(withLearnerTable), /unrecognized key|Unrecognized key/i);

  const withoutSourceBlocks = structuredClone(original);
  withoutSourceBlocks.projection.tables.source_blocks = [];
  assert.throws(
    () => parseAcceptedPathPackage(withoutSourceBlocks),
    /points outside source_blocks|source block/i
  );
});

test("package-set validation refuses duplicate path identities before installation", async () => {
  const parsed = parseCanonicalAcceptedPathPackage(await readFile(packagePath, "utf8")).package;
  assert.throws(
    () => validateAcceptedPathPackageSet([parsed, parsed]),
    /Duplicate catalog key|Duplicate accepted package catalog key/i
  );
});
