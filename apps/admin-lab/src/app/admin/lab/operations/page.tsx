import { isStaleOperation } from "@lrnki/application";
import { AdminShell } from "@/components/AdminShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { listOperationJourneys, preloadOperationSpend } from "@/lib/operationTimeline";
import { OperationsTimelineView } from "./OperationsTimelineView";
import {
  operationIdsForSpend,
  parseJourneySortParams,
  windowJourneys
} from "./operationJourneyView";

// Live operator progress view (ADR-0027/ADR-0029): one card per Processing Journey,
// grouped read-only from lineage, with per-step stage timelines and live LiteLLM spend.
export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ sort?: string; dir?: string; limit?: string }> }>) {
  const params = await searchParams;
  const sortParams = parseJourneySortParams(params);
  const operationJourneys = await listOperationJourneys();
  const spend = operationJourneys
    ? await preloadOperationSpend(operationIdsForSpend(operationJourneys.journeys, operationJourneys.ungrouped))
    : { rows: [], costAvailable: false };

  const window = operationJourneys ? windowJourneys(operationJourneys.journeys, spend, sortParams) : null;
  const runningCount = operationJourneys
    ? operationJourneys.journeys.filter((journey) => journey.status === "running").length +
      operationJourneys.ungrouped.filter((operation) => operation.summary.status === "running").length
    : 0;
  const failedCount = operationJourneys
    ? operationJourneys.journeys.filter((journey) => journey.status === "failed").length +
      operationJourneys.ungrouped.filter((operation) => operation.summary.status === "failed").length
    : 0;
  const stalledCount = operationJourneys
    ? [
        ...operationJourneys.journeys.flatMap((journey) => journey.members),
        ...operationJourneys.ungrouped
      ].filter((operation) => isStaleOperation(operation.summary.status, operation.summary.lastProgressAt)).length
    : 0;

  return (
    <AdminShell active="operations">
      <AutoRefresh active={runningCount > 0} />
      <OperationsTimelineView
        operationJourneys={operationJourneys ?? null}
        spend={spend}
        window={window}
        sortParams={sortParams}
        runningCount={runningCount}
        failedCount={failedCount}
        stalledCount={stalledCount}
      />
    </AdminShell>
  );
}
