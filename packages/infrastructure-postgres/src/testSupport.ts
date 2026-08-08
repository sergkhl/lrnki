import type { Sql } from "postgres";

// Test-only cleanup for the reporter's autocommit rows. The DB integration suites run
// only against TEST_DATABASE_URL, but still purge their committed operation timelines
// so assertions within the same isolated test run never observe orphaned rows.
//
// The FK operation_run_stages.operation_run_id → operation_runs is NO ACTION (no
// cascade), so child stage rows are deleted before their parents. Scoping by
// operation_id also cleans the shared-id case where two parents share one id.
// Every learner-state table FKs to Better Auth's `user` (ADR-0041), so an integration test that
// writes verdicts / responses / lesson-reads / expeditions must first seed the identity row.
// This is the ONE place outside Better Auth that writes `user`, and it exists only because
// driving a real sign-up for a store-level test would couple every DB suite to the HTTP surface.
// Every learner ref a suite has created, so its `after` hook can delete exactly those rows
// (plan 2026-07-07-007, R2) — no pattern deletes, and junk stops accumulating in the shared
// dev DB. Populated by `seedLearner` and by explicit `trackLearner` for paths that mint an
// identity themselves. Per-file (node runs each test file in its own process).
const trackedLearnerRefs = new Set<string>();

// `email` is separable from the ref because the real-use gate's reserved identity lives on the
// EMAIL, not the id (a Better Auth id is generated and cannot be chosen); a store-level test that
// only needs an identity row still gets a derived default.
export async function seedLearner(sql: Sql, learnerRef: string, email?: string): Promise<string> {
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${learnerRef}, ${learnerRef}, ${email ?? `${learnerRef}@test.invalid`}, false, now(), now())
    ON CONFLICT (id) DO NOTHING`;
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// Record a learner ref created outside `seedLearner` (e.g. a real sign-up through the API) so
// the suite's cleanup deletes it too. Returns the ref for inline use.
export function trackLearner(learnerRef: string): string {
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// FK-ordered delete of one learner and every learner-owned table (ADR-0039: the deletion graph is
// read off the schema authority, `src/schema/learnerState.ts` and the generated `src/schema/auth.ts`,
// never off the generated SQL). Children first, then the `user` row. Ordering constraints, all read
// off that FK graph:
//   - recall_challenges cascades its lineup + events, so a plain challenge delete clears them.
//   - response_log carries a scaffold_step_id FK into learner_scaffold_steps (which cascade from
//     their detour), so response_log MUST be deleted before learner_scaffold_detours.
//   - Better Auth's `session` and `account` cascade on the `user` delete, but are removed
//     explicitly so this function is complete on its own, not reliant on cascade side effects.
export async function deleteLearner(sql: Sql, learnerRef: string): Promise<void> {
  await sql`DELETE FROM recall_challenges WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM response_log WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_scaffold_detours WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM calibration_verdicts WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM lesson_reads WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_awards WHERE learner_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_expeditions WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM session WHERE user_id = ${learnerRef}`;
  await sql`DELETE FROM account WHERE user_id = ${learnerRef}`;
  await sql`DELETE FROM "user" WHERE id = ${learnerRef}`;
}

// A suite's `after` hook: delete every learner it created (AE2 — the `user` row count is
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
// script: no prefix or wildcard delete can ever be expressed here. Every accepted address must
// match the reserved shape `realuse-<role>-<runId>@realuse.invalid` exactly, so an arbitrary or
// attacker-supplied value (including a SQL-wildcard-shaped one like `realuse-phone-%@…`) is
// rejected BEFORE any SQL runs.
//
// The reserved shape is on the EMAIL, not the learner ref, because the ref is now Better Auth's
// generated `user.id` (ADR-0041) and nothing outside the library may choose it. The email is the
// one identity field a sign-up DOES choose, so it carries the run's ownership claim — and it is
// what makes teardown derivable from the run id alone, including for the two learners that sign
// up inside the browser and whose ids the runner never sees.
// ---------------------------------------------------------------------------

export const REALUSE_ROLES = ["probe", "phone", "desktop"] as const;
export type RealuseRole = (typeof REALUSE_ROLES)[number];

// RFC 2606 reserves `.invalid`, so a reserved address can never resolve or be delivered to — the
// gate needs no mailbox (email verification is deliberately off, ADR-0041).
const REALUSE_EMAIL_DOMAIN = "realuse.invalid";

// A run id is domain-neutral and format-locked to lowercase alphanumerics so it can never carry a
// wildcard (`%`/`_`), separator, or SQL metacharacter into a reserved address.
const RUN_ID_RE = /^[0-9a-z]{6,40}$/;
// The full reserved-address grammar: `realuse-` + one of the three fixed roles + the run id, at
// the reserved domain. Anchored, so nothing may precede or follow it.
const RESERVED_EMAIL_RE = /^realuse-(probe|phone|desktop)-[0-9a-z]{6,40}@realuse\.invalid$/;

// The three exact sign-up addresses a given run owns. Shared by the runner (to register each
// role) and by `--cleanup-run=<id>` (to derive teardown scope from the run id alone). Throws on a
// malformed id.
export function reservedLearnerEmails(runId: string): Record<RealuseRole, string> {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error(`Invalid real-use run id ${JSON.stringify(runId)}; expected /^[0-9a-z]{6,40}$/.`);
  }
  return {
    probe: `realuse-probe-${runId}@${REALUSE_EMAIL_DOMAIN}`,
    phone: `realuse-phone-${runId}@${REALUSE_EMAIL_DOMAIN}`,
    desktop: `realuse-desktop-${runId}@${REALUSE_EMAIL_DOMAIN}`
  };
}

// Delete exactly the learners behind the named reserved addresses and everything they own, each
// in its own transaction so a partial FK sequence can be retried safely (R9). Validates the whole
// list up front — empty, duplicate, malformed, non-reserved, or wildcard-shaped input throws
// before a single row is touched — then resolves each address by equality (never a pattern) to
// the generated id it belongs to, and skips addresses with no learner row. Returns the addresses
// that actually existed and were removed. Opens no client of its own; the caller (runner
// `finally`, or the DB integration test) owns the `Sql` lifetime.
export async function cleanupReservedLearners(sql: Sql, emails: readonly string[]): Promise<string[]> {
  if (emails.length === 0) throw new Error("cleanupReservedLearners: no learner emails supplied.");
  const seen = new Set<string>();
  for (const email of emails) {
    if (!RESERVED_EMAIL_RE.test(email)) {
      throw new Error(`cleanupReservedLearners: refusing non-reserved learner email ${JSON.stringify(email)}.`);
    }
    if (seen.has(email)) throw new Error(`cleanupReservedLearners: duplicate learner email ${JSON.stringify(email)}.`);
    seen.add(email);
  }
  const deleted: string[] = [];
  for (const email of seen) {
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM "user" WHERE email = ${email}`;
    if (!existing) continue;
    // postgres types don't declare TransactionSql assignable to Sql, but the tagged-template
    // surface deleteLearner uses is identical; the cast keeps the whole delete in one transaction.
    await sql.begin((tx) => deleteLearner(tx as unknown as Sql, existing.id));
    deleted.push(email);
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
