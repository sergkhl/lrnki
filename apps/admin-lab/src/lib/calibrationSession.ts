import { composeCalibrationSession, type CalibrationSessionProjection } from "@lrnki/application";
import { createDatabaseClient, PostgresCalibrationVerdictStore } from "@lrnki/infrastructure-postgres";
import { getEnrichmentDetail } from "./enrichments";

type Sql = ReturnType<typeof createDatabaseClient>;

async function withClient<T>(fn: (sql: Sql) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type CalibrationSession = CalibrationSessionProjection;

export async function getCalibrationSession(
  enrichmentId: string,
  targetDerivedNodeId: string,
  learnerStateRef: string
): Promise<CalibrationSession | undefined> {
  const detail = await getEnrichmentDetail(enrichmentId);
  if (!detail) return undefined;
  const verdicts = await withClient(async (sql) => new PostgresCalibrationVerdictStore(sql).listForLearner(learnerStateRef));
  if (!verdicts) return undefined;
  return composeCalibrationSession({
    enrichmentId,
    learnerStateRef,
    targetDerivedNodeId,
    edges: detail.edges,
    nodes: detail.nodes,
    knownVerdictNodeIds: verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId)
  });
}
