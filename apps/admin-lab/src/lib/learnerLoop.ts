import {
  getLearnerAdaptedGraphs as loadLearnerAdaptedGraphs,
  getLearnerLoopDetail as loadLearnerLoopDetail,
  listLearnerStates as loadLearnerStates
} from "@lrnki/application";
import { createDatabaseClient, PostgresEnrichmentInspectionRead, PostgresLearnerLoopRead } from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Learner Loop read port + projection use-cases (ADR-0027,
// KTD7). The joined-history/coverage SQL lives in `PostgresLearnerLoopRead`; the
// conflict/mastery/summary folds and the adapted-graph classify live in `@lrnki/application`
// (`getLearnerLoopDetail` / `listLearnerStates` / `getLearnerAdaptedGraphs`), so the Admin Lab
// and the forthcoming Learner App share one definition (AGENTS rule 18). This module
// only manages the sql lifecycle, injects the read adapters, and keeps the DATABASE_URL-absent
// fallback. It opens no write port, so it structurally cannot mutate learner state (R10); real
// DB errors propagate to the Next.js error boundary, matching the other inspection loaders.
export type {
  ConceptConflict,
  LearnerStateSummary,
  LearnerResponseView,
  LearnerLoopDetail,
  LearnerAdaptedGraph,
  LearnerAdaptedGraphs,
  ResponseSourceSummary
} from "@lrnki/application";

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

export function listLearnerStates() {
  return withClient((sql) => loadLearnerStates(new PostgresLearnerLoopRead(sql)));
}

export function getLearnerLoopDetail(learnerStateRef: string) {
  return withClient((sql) => loadLearnerLoopDetail(new PostgresLearnerLoopRead(sql), learnerStateRef));
}

export function getLearnerAdaptedGraphs(learnerStateRef: string) {
  return withClient((sql) => loadLearnerAdaptedGraphs(new PostgresLearnerLoopRead(sql), new PostgresEnrichmentInspectionRead(sql), learnerStateRef));
}
