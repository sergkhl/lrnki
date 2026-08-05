import type { Sql } from "postgres";

// Test-only cleanup for the reporter's autocommit rows. The DB integration suites run
// only against TEST_DATABASE_URL, but still purge their committed operation timelines
// so assertions within the same isolated test run never observe orphaned rows.
//
// The FK operation_run_stages.operation_run_id → operation_runs is NO ACTION (no
// cascade), so child stage rows are deleted before their parents. Scoping by
// operation_id also cleans the shared-id case where two parents share one id.
// The four learner-state tables FK to `learners` (plan 2026-07-07-005, R1), so an
// integration test that writes verdicts / responses / lesson-reads / expeditions must
// first register the learner. Idempotent placeholder insert — the PIN is irrelevant to
// state-table tests.
// Every learner ref a suite has created, so its `after` hook can delete exactly those rows
// (plan 2026-07-07-007, R2) — no pattern deletes, and junk stops accumulating in the shared
// dev DB. Populated by `seedLearner` and by explicit `trackLearner` for registry `create`
// paths that bypass the seed helper. Per-file (node runs each test file in its own process).
const trackedLearnerRefs = new Set<string>();

export async function seedLearner(sql: Sql, learnerRef: string): Promise<string> {
  await sql`
    INSERT INTO learners (learner_ref, display_name, pin_hash)
    VALUES (${learnerRef}, ${learnerRef}, 'test-pin-hash')
    ON CONFLICT (learner_ref) DO NOTHING`;
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// Record a learner ref created outside `seedLearner` (e.g. a registry `create`) so the
// suite's cleanup deletes it too. Returns the ref for inline use.
export function trackLearner(learnerRef: string): string {
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// FK-ordered delete of one learner and every learner-owned table (ADR-0039: the deletion graph is
// read off the schema authority, `src/schema/learnerState.ts`, never off the generated SQL).
// Children first, then the `learners` row. Ordering constraints, all read off that FK graph:
//   - recall_challenges cascades its lineup + events, so a plain challenge delete clears them.
//   - response_log carries a scaffold_step_id FK into learner_scaffold_steps (which cascade from
//     their detour), so response_log MUST be deleted before learner_scaffold_detours.
//   - learner_sessions cascades on the learners delete, but is removed explicitly for clarity and
//     so this function is complete on its own (not reliant on cascade side effects).
export async function deleteLearner(sql: Sql, learnerRef: string): Promise<void> {
  await sql`DELETE FROM recall_challenges WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM response_log WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_scaffold_detours WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM calibration_verdicts WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM lesson_reads WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_awards WHERE learner_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_expeditions WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_sessions WHERE learner_ref = ${learnerRef}`;
  await sql`DELETE FROM learners WHERE learner_ref = ${learnerRef}`;
}

// A suite's `after` hook: delete every learner it created (AE2 — the `learners` row count is
// unchanged by the run). Opens its own short-lived client because per-test clients are ended.
export async function cleanupTrackedLearners(databaseUrl: string | undefined): Promise<void> {
  if (!databaseUrl || trackedLearnerRefs.size === 0) return;
  const { createDatabaseClient } = await import("./db");
  const sql = createDatabaseClient(databaseUrl);
  try {
    for (const learnerRef of trackedLearnerRefs) await deleteLearner(sql, learnerRef);
    trackedLearnerRefs.clear();
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Durable real-use web gate cleanup (plan 2026-07-15-001 U1, R8-R9). The opt-in real-backend
// runner creates exactly three disposable, run-unique learners — one per role — and this is the
// ONLY teardown authority it uses. It replaces the deleted `cleanup-learner.sh` LIKE-pattern
// script: no prefix or wildcard delete can ever be expressed here. Every accepted ref must match
// the reserved shape `realuse-<role>-<runId>` exactly, so an arbitrary or attacker-supplied name
// (including a SQL-wildcard-shaped value like `realuse-phone-%`) is rejected BEFORE any SQL runs.
// ---------------------------------------------------------------------------

export const REALUSE_ROLES = ["probe", "phone", "desktop"] as const;
export type RealuseRole = (typeof REALUSE_ROLES)[number];

// A run id is domain-neutral and format-locked to lowercase alphanumerics so it can never carry a
// wildcard (`%`/`_`), separator, or SQL metacharacter into a reserved name.
const RUN_ID_RE = /^[0-9a-z]{6,40}$/;
// The full reserved-name grammar. `realuse-` prefix + one of the three fixed roles + the run id.
const RESERVED_REF_RE = /^realuse-(probe|phone|desktop)-[0-9a-z]{6,40}$/;

// The three exact learner refs a given run owns. Shared by the runner (to create/select) and by
// `--cleanup-run=<id>` (to derive teardown scope from the run id alone). Throws on a malformed id.
export function reservedLearnerRefs(runId: string): Record<RealuseRole, string> {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error(`Invalid real-use run id ${JSON.stringify(runId)}; expected /^[0-9a-z]{6,40}$/.`);
  }
  return {
    probe: `realuse-probe-${runId}`,
    phone: `realuse-phone-${runId}`,
    desktop: `realuse-desktop-${runId}`
  };
}

// Delete exactly the named reserved learners and everything they own, each in its own transaction
// so a partial FK sequence can be retried safely (R9). Validates the whole list up front — empty,
// duplicate, malformed, non-reserved, or wildcard-shaped input throws before a single row is
// touched — then resolves each ref by equality (never a pattern) and skips refs with no learner
// row. Returns the refs that actually existed and were removed. Opens no client of its own; the
// caller (runner `finally`, or the DB integration test) owns the `Sql` lifetime.
export async function cleanupReservedLearners(sql: Sql, refs: readonly string[]): Promise<string[]> {
  if (refs.length === 0) throw new Error("cleanupReservedLearners: no learner refs supplied.");
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!RESERVED_REF_RE.test(ref)) {
      throw new Error(`cleanupReservedLearners: refusing non-reserved learner ref ${JSON.stringify(ref)}.`);
    }
    if (seen.has(ref)) throw new Error(`cleanupReservedLearners: duplicate learner ref ${JSON.stringify(ref)}.`);
    seen.add(ref);
  }
  const deleted: string[] = [];
  for (const ref of seen) {
    const [existing] = await sql<{ learner_ref: string }[]>`
      SELECT learner_ref FROM learners WHERE learner_ref = ${ref}`;
    if (!existing) continue;
    // postgres types don't declare TransactionSql assignable to Sql, but the tagged-template
    // surface deleteLearner uses is identical; the cast keeps the whole delete in one transaction.
    await sql.begin((tx) => deleteLearner(tx as unknown as Sql, ref));
    deleted.push(ref);
  }
  return deleted;
}

export async function purgeOperationRun(sql: Sql, operationId: string): Promise<void> {
  await sql`
    DELETE FROM operation_run_stages s
    USING operation_runs r
    WHERE s.operation_run_id = r.operation_run_id AND r.operation_id = ${operationId}`;
  await sql`DELETE FROM operation_runs WHERE operation_id = ${operationId}`;
}
