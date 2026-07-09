import { listOperationJourneys as listOperationJourneysUseCase } from "@lrnki/application";
import type { OperationStageSpend, OperationType } from "@lrnki/ports";
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
async function withTimelineRead<T>(fn: (dependencies: {
  timelineRead: PostgresOperationTimelineRead;
  journeyLineageRead: PostgresJourneyLineageRead;
}) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn({
      timelineRead: new PostgresOperationTimelineRead(sql),
      journeyLineageRead: new PostgresJourneyLineageRead(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listOperationTimelines() {
  return withTimelineRead(({ timelineRead }) => timelineRead.listOperationTimelines());
}

export function getOperationTimeline(operationId: string, operationType?: OperationType) {
  return withTimelineRead(({ timelineRead }) => timelineRead.getOperationTimeline(operationId, operationType));
}

// List every operation with its stage breakdown for the live progress view (R4), all
// on ONE connection. N+1 reads are acceptable at admin-lab operation counts; the
// adapter still owns each query.
export function listOperationsWithStages() {
  return withTimelineRead(async ({ timelineRead }) => {
    const summaries = await timelineRead.listOperationTimelines();
    const details = await Promise.all(
      summaries.map((summary) => timelineRead.getOperationTimeline(summary.operationId, summary.operationType))
    );
    return details.flatMap((detail) => (detail ? [detail] : []));
  });
}

export function listOperationJourneys() {
  return withTimelineRead(({ timelineRead, journeyLineageRead }) =>
    listOperationJourneysUseCase({
      timelineRead,
      journeyLineageRead
    })
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
