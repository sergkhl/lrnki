import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type ReservedSql, type Sql } from "postgres";

const MIGRATION_LOCK_CLASS = 0x4c524e4b;
const MIGRATION_LOCK_KEY = 0x4d494752;

export type ResetRequiredReason =
  | "legacy-schema"
  | "partial-schema"
  | "stale-baseline"
  | "metadata-without-schema"
  | "unexpected-history";

export class ResetRequiredError extends Error {
  readonly reason: ResetRequiredReason;

  constructor(reason: ResetRequiredReason) {
    super(`Application schema reset required: ${reason}.`);
    this.name = "ResetRequiredError";
    this.reason = reason;
  }
}

export type ExpectedMigration = Readonly<{ hash: string; createdAt: string }>;

export type InspectedApplicationSchemaState = Readonly<{
  publicRelationCount: number;
  sourceResourcesPresent: boolean;
  operationRunsPresent: boolean;
  migrationRows: readonly Readonly<{ hash: unknown; createdAt: unknown }>[];
}>;

export type ApplicationSchemaState =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "current" }>
  | Readonly<{ kind: "reset-required"; reason: ResetRequiredReason }>;

export function requireSingleMigration(migrations: readonly MigrationMeta[]): ExpectedMigration {
  if (migrations.length !== 1) throw new ResetRequiredError("unexpected-history");
  const migration = migrations[0];
  if (!migration) throw new ResetRequiredError("unexpected-history");
  return { hash: migration.hash, createdAt: String(migration.folderMillis) };
}

export function classifyApplicationSchemaState(
  inspected: InspectedApplicationSchemaState,
  expected: ExpectedMigration
): ApplicationSchemaState {
  if (inspected.migrationRows.length > 1) {
    return { kind: "reset-required", reason: "unexpected-history" };
  }

  const sourcePresent = inspected.sourceResourcesPresent;
  const operationsPresent = inspected.operationRunsPresent;
  if (sourcePresent !== operationsPresent) {
    return { kind: "reset-required", reason: "partial-schema" };
  }

  const migrationRow = inspected.migrationRows[0];
  if (inspected.publicRelationCount === 0) {
    return migrationRow
      ? { kind: "reset-required", reason: "metadata-without-schema" }
      : { kind: "empty" };
  }

  if (!sourcePresent && !operationsPresent) {
    return {
      kind: "reset-required",
      reason: migrationRow ? "partial-schema" : "legacy-schema"
    };
  }

  if (!migrationRow) {
    return { kind: "reset-required", reason: "legacy-schema" };
  }

  const createdAt = normalizeMigrationTimestamp(migrationRow.createdAt);
  if (typeof migrationRow.hash !== "string" || createdAt === undefined) {
    return { kind: "reset-required", reason: "stale-baseline" };
  }

  if (migrationRow.hash !== expected.hash || createdAt !== expected.createdAt) {
    return { kind: "reset-required", reason: "stale-baseline" };
  }

  return { kind: "current" };
}

export async function ensureApplicationSchemaCurrent(
  databaseUrl: string,
  migrationsFolder: string
): Promise<Readonly<{ status: "applied" | "current" }>> {
  const expected = requireSingleMigration(readMigrationFiles({ migrationsFolder }));
  const client = postgres(databaseUrl, { max: 1 });
  let connection: ReservedSql | undefined;
  let locked = false;

  try {
    connection = await client.reserve();
    await connection`select pg_advisory_lock(${MIGRATION_LOCK_CLASS}, ${MIGRATION_LOCK_KEY})`;
    locked = true;

    const initialState = classifyApplicationSchemaState(
      await inspectApplicationSchemaState(connection),
      expected
    );
    if (initialState.kind === "reset-required") {
      throw new ResetRequiredError(initialState.reason);
    }

    const status = initialState.kind === "empty" ? "applied" : "current";
    if (status === "applied") {
      await migrate(drizzle(completeReservedClient(connection, client.options)), {
        migrationsFolder
      });
    }

    const finalState = classifyApplicationSchemaState(
      await inspectApplicationSchemaState(connection),
      expected
    );
    if (finalState.kind === "reset-required") {
      throw new ResetRequiredError(finalState.reason);
    }
    if (finalState.kind !== "current") {
      throw new Error("Application schema migration finished without reaching the current state.");
    }

    return { status };
  } finally {
    try {
      if (connection && locked) {
        await connection`select pg_advisory_unlock(${MIGRATION_LOCK_CLASS}, ${MIGRATION_LOCK_KEY})`;
      }
    } finally {
      try {
        connection?.release();
      } finally {
        await client.end({ timeout: 5 });
      }
    }
  }
}

function completeReservedClient(
  connection: ReservedSql,
  options: Sql["options"]
): ReservedSql {
  // postgres.js declares ReservedSql as a full Sql, but its runtime reserve() result intentionally
  // omits pool-level properties. Drizzle needs the parsers plus one transaction callback. Supplying
  // that callback here keeps both Drizzle's transaction and our session advisory lock on the same
  // reserved physical connection.
  Object.defineProperty(connection, "options", { configurable: true, value: options });
  Object.defineProperty(connection, "begin", {
    configurable: true,
    value: async (...args: unknown[]) => {
      const callback = args.length === 1 && typeof args[0] === "function" ? args[0] : undefined;
      if (!callback) throw new Error("The migration connection supports only an unconfigured transaction callback.");

      await connection.unsafe("BEGIN");
      try {
        const result = await callback(connection);
        await connection.unsafe("COMMIT");
        return result;
      } catch (error) {
        await connection.unsafe("ROLLBACK");
        throw error;
      }
    }
  });
  return connection;
}

async function inspectApplicationSchemaState(
  connection: ReservedSql
): Promise<InspectedApplicationSchemaState> {
  const [inventory] = await connection<
    {
      public_relation_count: number;
      source_resources_present: boolean;
      operation_runs_present: boolean;
      migration_table_present: boolean;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f'))::integer
        AS public_relation_count,
      to_regclass('public.source_resources') IS NOT NULL AS source_resources_present,
      to_regclass('public.operation_runs') IS NOT NULL AS operation_runs_present,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migration_table_present
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  `;
  if (!inventory) throw new Error("Could not inspect the application schema inventory.");

  let migrationRows: Readonly<{ hash: unknown; createdAt: unknown }>[] = [];
  if (inventory.migration_table_present) {
    const rows = await connection<{ row: unknown }[]>`
      SELECT to_jsonb(migration_row) AS row
      FROM drizzle.__drizzle_migrations AS migration_row
    `;
    migrationRows = rows.map(({ row }) => {
      if (!isRecord(row)) return { hash: undefined, createdAt: undefined };
      return { hash: row.hash, createdAt: row.created_at };
    });
  }

  return {
    publicRelationCount: inventory.public_relation_count,
    sourceResourcesPresent: inventory.source_resources_present,
    operationRunsPresent: inventory.operation_runs_present,
    migrationRows
  };
}

function normalizeMigrationTimestamp(value: unknown): string | undefined {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value).toString();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
