import assert from "node:assert/strict";
import test from "node:test";
import type { MigrationMeta } from "drizzle-orm/migrator";

import {
  APPLICATION_RELATION_MANIFEST,
  classifyApplicationSchemaState,
  ResetRequiredError,
  requireSingleMigration,
  type InspectedApplicationSchemaState
} from "./migrations/applicationSchemaMigration";

const expected = { hash: "expected-hash", createdAt: "1785857986885" };
const empty: InspectedApplicationSchemaState = { publicRelations: [], migrationRows: [] };
const current = (): InspectedApplicationSchemaState => ({
  publicRelations: [...APPLICATION_RELATION_MANIFEST],
  migrationRows: [{ hash: expected.hash, createdAt: BigInt(expected.createdAt) }]
});

test("the classifier accepts only empty or the exact five-relation manifest", () => {
  assert.deepEqual(classifyApplicationSchemaState(empty, expected), { kind: "empty" });
  assert.deepEqual(classifyApplicationSchemaState(current(), expected), { kind: "current" });
});

test("the classifier names every reset-required database state", () => {
  const cases: readonly [InspectedApplicationSchemaState, string][] = [
    [{ publicRelations: ["legacy_relation"], migrationRows: [] }, "legacy-schema"],
    [{ publicRelations: ["user"], migrationRows: [] }, "partial-schema"],
    [{ publicRelations: [], migrationRows: [{ hash: expected.hash, createdAt: expected.createdAt }] }, "metadata-without-schema"],
    [{ publicRelations: [...APPLICATION_RELATION_MANIFEST], migrationRows: [] }, "legacy-schema"],
    [{ ...current(), migrationRows: [{ hash: "old", createdAt: expected.createdAt }] }, "stale-baseline"],
    [{ ...current(), migrationRows: [{ hash: expected.hash, createdAt: "1" }] }, "stale-baseline"],
    [{ ...current(), migrationRows: [{ hash: expected.hash, createdAt: null }] }, "stale-baseline"],
    [{ ...current(), migrationRows: [...current().migrationRows, { hash: "extra", createdAt: "2" }] }, "unexpected-history"],
    [{ ...current(), publicRelations: [...APPLICATION_RELATION_MANIFEST, "legacy_extra"] }, "partial-schema"],
    [{ ...current(), publicRelations: APPLICATION_RELATION_MANIFEST.filter((name) => name !== "verification") }, "partial-schema"]
  ];

  for (const [state, reason] of cases) {
    assert.deepEqual(classifyApplicationSchemaState(state, expected), {
      kind: "reset-required",
      reason
    });
  }
});

test("the migration lineage boundary accepts exactly one baseline", () => {
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
