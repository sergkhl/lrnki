import assert from "node:assert/strict";
import test from "node:test";
import type { MigrationMeta } from "drizzle-orm/migrator";
import {
  classifyApplicationSchemaState,
  ResetRequiredError,
  requireSingleMigration,
  type InspectedApplicationSchemaState
} from "./migrations/applicationSchemaMigration";

const expected = { hash: "expected-hash", createdAt: "1785857986885" };
const empty: InspectedApplicationSchemaState = {
  publicRelationCount: 0,
  sourceResourcesPresent: false,
  operationRunsPresent: false,
  migrationRows: []
};

test("the classifier accepts only empty or exactly current state", () => {
  assert.deepEqual(classifyApplicationSchemaState(empty, expected), { kind: "empty" });
  assert.deepEqual(
    classifyApplicationSchemaState(
      {
        publicRelationCount: 65,
        sourceResourcesPresent: true,
        operationRunsPresent: true,
        migrationRows: [{ hash: expected.hash, createdAt: BigInt(expected.createdAt) }]
      },
      expected
    ),
    { kind: "current" }
  );
});

test("the classifier names every reset-required database state", () => {
  const cases: readonly [InspectedApplicationSchemaState, string][] = [
    [{ ...empty, publicRelationCount: 2 }, "legacy-schema"],
    [{ ...empty, publicRelationCount: 1, sourceResourcesPresent: true }, "partial-schema"],
    [{ ...empty, migrationRows: [{ hash: expected.hash, createdAt: expected.createdAt }] }, "metadata-without-schema"],
    [{ ...empty, publicRelationCount: 65, sourceResourcesPresent: true, operationRunsPresent: true, migrationRows: [] }, "legacy-schema"],
    [{ ...empty, publicRelationCount: 65, sourceResourcesPresent: true, operationRunsPresent: true, migrationRows: [{ hash: "old", createdAt: expected.createdAt }] }, "stale-baseline"],
    [{ ...empty, publicRelationCount: 65, sourceResourcesPresent: true, operationRunsPresent: true, migrationRows: [{ hash: expected.hash, createdAt: "1" }] }, "stale-baseline"],
    [{ ...empty, publicRelationCount: 65, sourceResourcesPresent: true, operationRunsPresent: true, migrationRows: [{ hash: expected.hash, createdAt: null }] }, "stale-baseline"],
    [{ ...empty, publicRelationCount: 65, sourceResourcesPresent: true, operationRunsPresent: true, migrationRows: [{ hash: expected.hash, createdAt: expected.createdAt }, { hash: "extra", createdAt: "2" }] }, "unexpected-history"],
    [{ ...empty, publicRelationCount: 2, migrationRows: [{ hash: expected.hash, createdAt: expected.createdAt }] }, "partial-schema"]
  ];

  for (const [state, reason] of cases) {
    assert.deepEqual(classifyApplicationSchemaState(state, expected), {
      kind: "reset-required",
      reason
    });
  }
});

test("the manifest boundary rejects missing or additional migration history", () => {
  const migration: MigrationMeta = {
    sql: ["select 1"],
    folderMillis: Number(expected.createdAt),
    hash: expected.hash,
    bps: true
  };
  assert.deepEqual(requireSingleMigration([migration]), expected);
  for (const history of [[], [migration, migration]]) {
    assert.throws(
      () => requireSingleMigration(history),
      (error: unknown) => error instanceof ResetRequiredError && error.reason === "unexpected-history"
    );
  }
});
