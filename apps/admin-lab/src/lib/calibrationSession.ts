import { projectCalibrationList, type CalibrationListRow } from "@lrnki/application";
import { createDatabaseClient, PostgresCalibrationVerdictStore } from "@lrnki/infrastructure-postgres";
import { getEnrichmentDetail } from "./enrichments";
import { labelFor, type DerivedGraphDetail } from "./derivedGraph";

type Sql = ReturnType<typeof createDatabaseClient>;

async function withClient<T>(fn: (sql: Sql) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } catch {
    return undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type CalibrationSession = {
  enrichmentId: string;
  learnerStateRef: string;
  target: { derivedNodeId: string; label: string };
  rows: CalibrationListRow[];
  knownClosure: string[];
};

export function composeCalibrationSession(input: {
  enrichmentId: string;
  learnerStateRef: string;
  targetDerivedNodeId: string;
  detail: DerivedGraphDetail;
  knownVerdictNodeIds: string[];
}): CalibrationSession | undefined {
  if (!input.detail.nodes.some((node) => node.derivedNodeId === input.targetDerivedNodeId)) return undefined;
  const projection = projectCalibrationList({
    targetDerivedNodeId: input.targetDerivedNodeId,
    edges: input.detail.edges,
    nodes: input.detail.nodes,
    knownVerdictNodeIds: input.knownVerdictNodeIds
  });
  return {
    enrichmentId: input.enrichmentId,
    learnerStateRef: input.learnerStateRef,
    target: { derivedNodeId: input.targetDerivedNodeId, label: labelFor(input.detail, input.targetDerivedNodeId) },
    rows: projection.rows,
    knownClosure: [...projection.knownClosure].sort()
  };
}

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
    detail,
    knownVerdictNodeIds: verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId)
  });
}
