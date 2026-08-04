import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres, { type Sql } from "postgres";
import {
  ensureApplicationSchemaCurrent,
  ResetRequiredError,
  requireSingleMigration,
  type ResetRequiredReason
} from "./applicationSchemaMigration";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for migration integration tests.");
if (decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) !== "lrnki_test") {
  throw new Error("Migration integration tests may target only lrnki_test.");
}

const migrationsFolder = fileURLToPath(new URL("./", import.meta.url));
const expected = requireSingleMigration(readMigrationFiles({ migrationsFolder }));

test("the application-schema migrator owns the complete database state matrix", async (t) => {
  const control = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  t.after(async () => {
    try {
      await resetSchemas(control);
      await ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder);
    } finally {
      await control.end({ timeout: 5 });
    }
  });

  await t.test("fresh applies once, current is a no-op, and both clients close", async () => {
    await resetSchemas(control);
    const applicationName = `migration-fresh-${process.pid}`;
    const url = withApplicationName(databaseUrl, applicationName);

    assert.deepEqual(await ensureApplicationSchemaCurrent(url, migrationsFolder), { status: "applied" });
    assert.deepEqual(await ensureApplicationSchemaCurrent(url, migrationsFolder), { status: "current" });
    assert.equal(await migrationRowCount(control), 1);
    await assertClientClosed(control, applicationName);
  });

  await t.test("two fresh invocations serialize behind the advisory lock", async () => {
    await resetSchemas(control);
    const firstName = `migration-concurrent-a-${process.pid}`;
    const secondName = `migration-concurrent-b-${process.pid}`;
    const results = await Promise.all([
      ensureApplicationSchemaCurrent(withApplicationName(databaseUrl, firstName), migrationsFolder),
      ensureApplicationSchemaCurrent(withApplicationName(databaseUrl, secondName), migrationsFolder)
    ]);

    assert.deepEqual(results.map(({ status }) => status).sort(), ["applied", "current"]);
    assert.equal(await migrationRowCount(control), 1);
    await assertClientClosed(control, firstName);
    await assertClientClosed(control, secondName);
  });

  await t.test("legacy schema fails before mutating its objects or data", async () => {
    await resetSchemas(control);
    await control`CREATE TABLE public.source_resources (id integer PRIMARY KEY, marker text NOT NULL)`;
    await control`CREATE TABLE public.operation_runs (id integer PRIMARY KEY)`;
    await control`INSERT INTO public.source_resources (id, marker) VALUES (1, 'keep-legacy')`;

    const applicationName = `migration-legacy-${process.pid}`;
    await expectResetRequired(
      withApplicationName(databaseUrl, applicationName),
      "legacy-schema"
    );
    const rows = await control<{ marker: string }[]>`SELECT marker FROM public.source_resources`;
    assert.deepEqual(Array.from(rows), [{ marker: "keep-legacy" }]);
    assert.equal(await publicRelationCount(control), 2);
    await assertClientClosed(control, applicationName);
  });

  await t.test("partial schema fails before mutating its surviving sentinel", async () => {
    await resetSchemas(control);
    await control`CREATE TABLE public.source_resources (id integer PRIMARY KEY, marker text NOT NULL)`;
    await control`INSERT INTO public.source_resources (id, marker) VALUES (1, 'keep-partial')`;

    const applicationName = `migration-partial-${process.pid}`;
    await expectResetRequired(
      withApplicationName(databaseUrl, applicationName),
      "partial-schema"
    );
    const rows = await control<{ marker: string }[]>`SELECT marker FROM public.source_resources`;
    assert.deepEqual(Array.from(rows), [{ marker: "keep-partial" }]);
    assert.equal(await publicRelationCount(control), 1);
    await assertClientClosed(control, applicationName);
  });

  for (const staleCase of ["hash", "time"] as const) {
    await t.test(`stale ${staleCase} fails without touching public data`, async () => {
      await resetSchemas(control);
      await ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder);
      await control`CREATE TABLE public.migration_state_marker (marker text NOT NULL)`;
      await control`INSERT INTO public.migration_state_marker (marker) VALUES ('keep-stale')`;
      if (staleCase === "hash") {
        await control`UPDATE drizzle.__drizzle_migrations SET hash = 'stale-hash'`;
      } else {
        await control`UPDATE drizzle.__drizzle_migrations SET created_at = 1`;
      }

      const applicationName = `migration-stale-${staleCase}-${process.pid}`;
      await expectResetRequired(
        withApplicationName(databaseUrl, applicationName),
        "stale-baseline"
      );
      const rows = await control<{ marker: string }[]>`SELECT marker FROM public.migration_state_marker`;
      assert.deepEqual(Array.from(rows), [{ marker: "keep-stale" }]);
      await assertClientClosed(control, applicationName);
    });
  }

  await t.test("metadata without public schema fails and preserves the metadata row", async () => {
    await resetSchemas(control);
    await createMigrationMetadata(control);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${expected.hash}, ${expected.createdAt})
    `;

    const applicationName = `migration-metadata-only-${process.pid}`;
    await expectResetRequired(
      withApplicationName(databaseUrl, applicationName),
      "metadata-without-schema"
    );
    const rows = await control<{ hash: string; created_at: string }[]>`
      SELECT hash, created_at::text FROM drizzle.__drizzle_migrations
    `;
    assert.deepEqual(Array.from(rows), [{ hash: expected.hash, created_at: expected.createdAt }]);
    assert.equal(await publicRelationCount(control), 0);
    await assertClientClosed(control, applicationName);
  });

  await t.test("extra metadata history fails and preserves both rows", async () => {
    await resetSchemas(control);
    await ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('extra-history', ${String(Number(expected.createdAt) + 1)})
    `;

    const applicationName = `migration-extra-history-${process.pid}`;
    await expectResetRequired(
      withApplicationName(databaseUrl, applicationName),
      "unexpected-history"
    );
    assert.equal(await migrationRowCount(control), 2);
    await assertClientClosed(control, applicationName);
  });
});

async function expectResetRequired(url: string, reason: ResetRequiredReason): Promise<void> {
  await assert.rejects(
    ensureApplicationSchemaCurrent(url, migrationsFolder),
    (error: unknown) => error instanceof ResetRequiredError && error.reason === reason
  );
}

async function resetSchemas(sql: Sql): Promise<void> {
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
}

async function createMigrationMetadata(sql: Sql): Promise<void> {
  await sql`CREATE SCHEMA drizzle`;
  await sql`
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
}

async function migrationRowCount(sql: Sql): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations
  `;
  assert.ok(row);
  return row.count;
}

async function publicRelationCount(sql: Sql): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  `;
  assert.ok(row);
  return row.count;
}

function withApplicationName(urlValue: string, applicationName: string): string {
  const url = new URL(urlValue);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

async function assertClientClosed(sql: Sql, applicationName: string): Promise<void> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM pg_stat_activity
    WHERE datname = current_database() AND application_name = ${applicationName}
  `;
  assert.deepEqual(row, { count: 0 });
}
