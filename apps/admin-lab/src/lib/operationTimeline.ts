import { costTimingReport } from "@lrnki/application";
import type { OperationStageSpend, OperationStageSpendReadPort, OperationType } from "@lrnki/ports";
import { LiteLlmSpendLogsReadAdapter } from "@lrnki/infrastructure-litellm";
import {
  PostgresJourneyLineageRead,
  PostgresOperationTimelineRead,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Operation Timeline read model (R4, ADR-0027).
// The PostgresOperationTimelineRead adapter owns every query and row-stitch; this
// module only manages the `sql` lifecycle and the DATABASE_URL-absent → undefined
// fallback. Real DB errors propagate to the Next.js error boundary instead of being
// silently rendered as empty (ADR-0027 decision 5). Mirrors lib/inspection.ts.
async function withTimelineRead<T>(fn: (read: PostgresOperationTimelineRead) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(new PostgresOperationTimelineRead(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listOperationTimelines() {
  return withTimelineRead((read) => read.listOperationTimelines());
}

export function getOperationTimeline(operationId: string, operationType?: OperationType) {
  return withTimelineRead((read) => read.getOperationTimeline(operationId, operationType));
}

// List every operation with its stage breakdown for the live progress view (R4), all
// on ONE connection. N+1 reads are acceptable at admin-lab operation counts; the
// adapter still owns each query.
export function listOperationsWithStages() {
  return withTimelineRead(async (read) => {
    const summaries = await read.listOperationTimelines();
    const details = await Promise.all(
      summaries.map((summary) => read.getOperationTimeline(summary.operationId, summary.operationType))
    );
    return details.flatMap((detail) => (detail ? [detail] : []));
  });
}

// The Admin Lab renderer of the cost & timings report (R5/R7): the SAME use-case the worker
// CLI calls (KTD5) — no HTTP hop, no re-implemented join. Cost is read live from
// LiteLLM at render time and never stored (R6); a LiteLLM outage degrades to wall-clock
// only inside the use-case.
export function getCostTimingReport(operationId: string, operationType?: OperationType) {
  return withReportReads((dependencies) =>
    costTimingReport({ scope: { operationId, operationType }, ...dependencies })
  );
}

export function getJourneyCostReport(enrichmentId: string) {
  return withReportReads((dependencies) =>
    costTimingReport({ scope: { journeyAnchorEnrichmentId: enrichmentId }, ...dependencies })
  );
}

// Preloaded live spend for the whole operations page: ONE `readOperationStageSpend` call over
// every listed operation id feeds the at-a-glance cost/tokens/calls chips on each card (R5,
// KTD4 — the lateral-join scan dominates, so one call for N ids costs the same as one). Cost
// is never stored. `costAvailable` is false when LITELLM_DATABASE_URL is absent OR the read
// fails, in which case the page degrades to wall-clock-only chips (AE6).
export async function preloadOperationSpend(
  operationIds: string[]
): Promise<{ rows: OperationStageSpend[]; costAvailable: boolean }> {
  const litellmUrl = process.env.LITELLM_DATABASE_URL;
  if (!litellmUrl || operationIds.length === 0) return { rows: [], costAvailable: false };
  const spendRead = new LiteLlmSpendLogsReadAdapter(litellmUrl);
  try {
    const rows = await spendRead.readOperationStageSpend([...new Set(operationIds)]);
    return { rows, costAvailable: true };
  } catch {
    return { rows: [], costAvailable: false };
  } finally {
    await spendRead.end();
  }
}

async function withReportReads<T>(
  fn: (dependencies: {
    timelineRead: PostgresOperationTimelineRead;
    journeyLineageRead: PostgresJourneyLineageRead;
    operationStageSpendRead: OperationStageSpendReadPort;
  }) => Promise<T>
): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  const spendRead = process.env.LITELLM_DATABASE_URL
    ? new LiteLlmSpendLogsReadAdapter(process.env.LITELLM_DATABASE_URL)
    : undefined;
  try {
    return await fn({
      timelineRead: new PostgresOperationTimelineRead(sql),
      journeyLineageRead: new PostgresJourneyLineageRead(sql),
      operationStageSpendRead: spendRead ?? {
        async readOperationStageSpend() {
          throw new Error("LITELLM_DATABASE_URL is required for cost reporting.");
        }
      }
    });
  } finally {
    await spendRead?.end();
    await sql.end({ timeout: 5 });
  }
}
