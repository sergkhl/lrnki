import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionSql } from "postgres";
import {
  ACCEPTED_PATH_PACKAGE_TABLES,
  installAcceptedPathGlobalProjections,
  parseAcceptedPathPackage,
  parseCanonicalAcceptedPathPackage,
  serializeAcceptedPathPackage,
  validateAcceptedPathPackageSet
} from "./PostgresAcceptedPathPackages";
import {
  ACCEPTED_PATH_V2_TEST_IDS,
  acceptedPathPackageV2TestFixture
} from "./PostgresAcceptedPathPackages.testFixture";

test("a route-bearing mixed-family v2 package round-trips through canonical bytes", () => {
  const fixture = acceptedPathPackageV2TestFixture();
  const text = serializeAcceptedPathPackage(fixture);
  const parsed = parseCanonicalAcceptedPathPackage(text);

  assert.match(parsed.sha256, /^[a-f0-9]{64}$/);
  assert.equal(parsed.package.format, "lrnki.accepted-path-package.v2");
  assert.equal(parsed.package.qualification.totalConceptCount, 3);
  assert.deepEqual(parsed.package.qualification.routePlan, fixture.qualification.routePlan);
  assert.equal(serializeAcceptedPathPackage(parsed.package), text);

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

test("v2 parsing refuses the deleted v1 shape and route/header drift", () => {
  const stale = structuredClone(acceptedPathPackageV2TestFixture()) as unknown as Record<string, unknown>;
  stale.format = "lrnki.accepted-path-package.v1";
  assert.throws(() => parseAcceptedPathPackage(stale), /accepted-path-package\.v2|Invalid input/i);

  const duplicateRoute = structuredClone(acceptedPathPackageV2TestFixture());
  duplicateRoute.qualification.routePlan.orderedDerivedNodeIds[2] =
    duplicateRoute.qualification.routePlan.orderedDerivedNodeIds[1];
  assert.throws(() => parseAcceptedPathPackage(duplicateRoute), /Duplicate qualified route node id/i);

  const wrongAnchor = structuredClone(acceptedPathPackageV2TestFixture());
  wrongAnchor.qualification.routePlan.legs[0]!.anchorDerivedNodeId =
  wrongAnchor.qualification.routePlan.legs[0]!.derivedNodeIds[0]!;
  assert.throws(() => parseAcceptedPathPackage(wrongAnchor), /anchor differs/i);

  const duplicateLessonNode = structuredClone(acceptedPathPackageV2TestFixture());
  packageTables(duplicateLessonNode).concept_lessons[2]!.derived_node_id =
    ACCEPTED_PATH_V2_TEST_IDS.nodes[1];
  assert.throws(() => parseAcceptedPathPackage(duplicateLessonNode), /Duplicate qualified lesson node id/i);

  const omittedPrerequisite = structuredClone(acceptedPathPackageV2TestFixture());
  omittedPrerequisite.qualification.routePlan.orderedDerivedNodeIds = [
    ACCEPTED_PATH_V2_TEST_IDS.nodes[1],
    ACCEPTED_PATH_V2_TEST_IDS.nodes[2],
    "00000000-0000-4000-8000-000000000099"
  ];
  omittedPrerequisite.qualification.routePlan.legs[0]!.derivedNodeIds = [
    ...omittedPrerequisite.qualification.routePlan.orderedDerivedNodeIds
  ];
  omittedPrerequisite.qualification.routePlan.legs[0]!.anchorDerivedNodeId =
    omittedPrerequisite.qualification.routePlan.orderedDerivedNodeIds[2]!;
  omittedPrerequisite.qualification.routePlan.summitDerivedNodeId =
    omittedPrerequisite.qualification.routePlan.orderedDerivedNodeIds[2]!;
  assert.throws(() => parseAcceptedPathPackage(omittedPrerequisite), /missing node|omits prerequisite/i);

  const staleRouteIdentity = structuredClone(acceptedPathPackageV2TestFixture());
  staleRouteIdentity.qualification.routePlan.policyIdentity =
    "source-expedition-route-v2:min3-max5-target4:mixed";
  assert.throws(
    () => parseAcceptedPathPackage(staleRouteIdentity),
    /asset identity does not match its route and selected assets/i
  );

  const staleItemIdentity = structuredClone(acceptedPathPackageV2TestFixture());
  const oldItemId = ACCEPTED_PATH_V2_TEST_IDS.options[0];
  const newItemId = "00000000-0000-4000-8000-000000000099";
  staleItemIdentity.qualification.expectedAssets.currentStudyItemIds[0] = newItemId;
  const staleItemTables = packageTables(staleItemIdentity);
  staleItemTables.study_items.find((row) => row.study_item_id === oldItemId)!.study_item_id =
    newItemId;
  for (const option of staleItemTables.study_item_options) {
    if (option.study_item_id === oldItemId) option.study_item_id = newItemId;
  }
  assert.throws(
    () => parseAcceptedPathPackage(staleItemIdentity),
    /asset identity does not match its route and selected assets/i
  );
});

test("v2 parsing refuses malformed family selection and child-row closure", () => {
  const withLearnerTable = structuredClone(acceptedPathPackageV2TestFixture());
  packageTables(withLearnerTable).user = [];
  assert.throws(() => parseAcceptedPathPackage(withLearnerTable), /unrecognized key/i);

  const missingMatching = structuredClone(acceptedPathPackageV2TestFixture());
  const missingMatchingTables = packageTables(missingMatching);
  missingMatchingTables.matching_pairs = missingMatchingTables.matching_pairs.slice(1);
  assert.throws(() => parseAcceptedPathPackage(missingMatching), /matching item.*child rows/i);

  const wrongImpostorParent = structuredClone(acceptedPathPackageV2TestFixture());
  packageTables(wrongImpostorParent).impostor_statements[0]!.study_item_id =
    "00000000-0000-4000-8000-000000000099";
  assert.throws(
    () => parseAcceptedPathPackage(wrongImpostorParent),
    /impostor_statements\.study_item_id points outside study_items/i
  );

  const wrongMatchingSource = structuredClone(acceptedPathPackageV2TestFixture());
  packageTables(wrongMatchingSource).matching_pairs[0]!.source_block_id =
    "00000000-0000-4000-8000-000000000099";
  assert.throws(
    () => parseAcceptedPathPackage(wrongMatchingSource),
    /matching_pairs\.source_block_id points outside source_blocks/i
  );

  const optionOnly = structuredClone(acceptedPathPackageV2TestFixture());
  optionOnly.qualification.routePlan.legs[0]!.selectedBonusStudyItemIds = [
    ACCEPTED_PATH_V2_TEST_IDS.options[0]
  ];
  assert.throws(() => parseAcceptedPathPackage(optionOnly), /not matching or impostor|Study Items differ/i);
});

test("malformed packages fail before the global installer writes a row", async () => {
  const malformed = structuredClone(acceptedPathPackageV2TestFixture());
  packageTables(malformed).matching_pairs[0]!.source_block_id =
    "00000000-0000-4000-8000-000000000099";
  let writes = 0;
  const tx = {
    async unsafe() {
      writes += 1;
      return [];
    }
  } as unknown as TransactionSql;

  await assert.rejects(
    installAcceptedPathGlobalProjections(tx, [malformed]),
    /matching_pairs\.source_block_id points outside source_blocks/i
  );
  assert.equal(writes, 0);
});

test("package-set validation refuses duplicate path identities before installation", () => {
  const fixture = acceptedPathPackageV2TestFixture();
  assert.throws(
    () => validateAcceptedPathPackageSet([fixture, fixture]),
    /Duplicate catalog key|share source_resources/i
  );
});

function packageTables(value: ReturnType<typeof acceptedPathPackageV2TestFixture>): Record<
  string,
  Array<Record<string, unknown>>
> {
  return (value.projection as {
    tables: Record<string, Array<Record<string, unknown>>>;
  }).tables;
}
