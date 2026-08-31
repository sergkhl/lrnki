import type { Sql } from "postgres";

const trackedLearnerRefs = new Set<string>();

export async function seedLearner(sql: Sql, learnerRef: string, email?: string): Promise<string> {
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${learnerRef}, ${learnerRef}, ${email ?? `${learnerRef}@test.invalid`}, false, now(), now())
    ON CONFLICT (id) DO NOTHING`;
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

export async function deleteLearner(sql: Sql, learnerRef: string): Promise<void> {
  // learner_journey_state, session, and account all cascade from the Better Auth user.
  await sql`DELETE FROM "user" WHERE id = ${learnerRef}`;
}

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

export const REALUSE_ROLES = ["probe", "phone", "desktop"] as const;
export type RealuseRole = (typeof REALUSE_ROLES)[number];
const RUN_ID_RE = /^[0-9a-z]{6,40}$/;
const RESERVED_EMAIL_RE = /^realuse-(probe|phone|desktop)-[0-9a-z]{6,40}@realuse\.invalid$/;

export function reservedLearnerEmails(runId: string): Record<RealuseRole, string> {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error(`Invalid real-use run id ${JSON.stringify(runId)}; expected /^[0-9a-z]{6,40}$/.`);
  }
  return {
    probe: `realuse-probe-${runId}@realuse.invalid`,
    phone: `realuse-phone-${runId}@realuse.invalid`,
    desktop: `realuse-desktop-${runId}@realuse.invalid`
  };
}

export async function cleanupReservedLearners(sql: Sql, emails: readonly string[]): Promise<string[]> {
  if (emails.length === 0) throw new Error("cleanupReservedLearners: no learner emails supplied.");
  const seen = new Set<string>();
  for (const email of emails) {
    if (!RESERVED_EMAIL_RE.test(email)) {
      throw new Error(`cleanupReservedLearners: refusing non-reserved learner email ${JSON.stringify(email)}.`);
    }
    if (seen.has(email)) {
      throw new Error(`cleanupReservedLearners: duplicate learner email ${JSON.stringify(email)}.`);
    }
    seen.add(email);
  }
  const deleted: string[] = [];
  for (const email of seen) {
    const [row] = await sql<Array<{ id: string }>>`SELECT id FROM "user" WHERE email = ${email}`;
    if (!row) continue;
    await deleteLearner(sql, row.id);
    deleted.push(email);
  }
  return deleted;
}
