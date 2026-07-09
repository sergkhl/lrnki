import { spendStageBelongsToOperation } from "@lrnki/application";
import type { OperationJourney } from "@lrnki/application";
import type { OperationStageSpend, OperationTimelineDetail, OperationType } from "@lrnki/ports";

export type JourneySortKey = "started" | "duration" | "cost";
export type JourneySortDir = "asc" | "desc";
export type OperationStepSortKey =
  | "lineage"
  | "operation"
  | "status"
  | "started"
  | "duration"
  | "calls"
  | "tokens"
  | "cost";
export type OperationStepSortDir = "asc" | "desc";

export type OperationCost = { costUsd: number; tokens: number; calls: number };

export type OperationSpend = { rows: OperationStageSpend[]; costAvailable: boolean };

export interface JourneyWindow {
  active: OperationJourney[];
  finished: OperationJourney[];
  hiddenFinishedCount: number;
}

export function parseJourneySortParams(input: {
  sort?: string;
  dir?: string;
  limit?: string;
}): { sort: JourneySortKey; dir: JourneySortDir; limit: number } {
  const sort = input.sort === "duration" || input.sort === "cost" ? input.sort : "started";
  const dir = input.dir === "asc" ? "asc" : "desc";
  const parsedLimit = input.limit ? Number.parseInt(input.limit, 10) : 20;
  return {
    sort,
    dir,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20
  };
}

export function operationCost(
  operationId: string,
  operationType: OperationType,
  spend: OperationSpend
): OperationCost | null {
  if (!spend.costAvailable) return null;
  const owned = spend.rows.filter(
    (row) => row.operationId === operationId && spendStageBelongsToOperation(row.stage, operationType)
  );
  return owned.reduce<OperationCost>(
    (total, row) => ({
      costUsd: total.costUsd + row.totalSpend,
      tokens: total.tokens + row.totalTokens,
      calls: total.calls + row.logCount
    }),
    { costUsd: 0, tokens: 0, calls: 0 }
  );
}

export function journeyCost(journey: OperationJourney, spend: OperationSpend): OperationCost | null {
  if (!spend.costAvailable) return null;
  return journey.members.reduce<OperationCost>(
    (total, member) => {
      const cost = operationCost(member.summary.operationId, member.summary.operationType, spend);
      return {
        costUsd: total.costUsd + (cost?.costUsd ?? 0),
        tokens: total.tokens + (cost?.tokens ?? 0),
        calls: total.calls + (cost?.calls ?? 0)
      };
    },
    { costUsd: 0, tokens: 0, calls: 0 }
  );
}

export function windowJourneys(
  journeys: OperationJourney[],
  spend: OperationSpend,
  input: { sort: JourneySortKey; dir: JourneySortDir; limit: number }
): JourneyWindow {
  const active = journeys.filter((journey) => journey.status === "running");
  const finished = journeys.filter((journey) => journey.status !== "running");
  const direction = input.dir === "asc" ? 1 : -1;
  const sorted = [...finished].sort((left, right) => direction * compareJourneys(left, right, input.sort, spend));
  return {
    active,
    finished: sorted.slice(0, input.limit),
    hiddenFinishedCount: Math.max(0, sorted.length - input.limit)
  };
}

export function operationIdsForSpend(journeys: OperationJourney[], ungrouped: OperationTimelineDetail[]): string[] {
  return [
    ...journeys.flatMap((journey) => journey.members.map((member) => member.summary.operationId)),
    ...ungrouped.map((detail) => detail.summary.operationId)
  ];
}

export function initialExpandedOperationIds(input: {
  journeys: OperationJourney[];
  ungrouped: OperationTimelineDetail[];
}): string[] {
  return [...input.journeys.flatMap((journey) => journey.members), ...input.ungrouped]
    .filter((operation) => operation.summary.status === "running")
    .map((operation) => operation.summary.operationRunId);
}

export function sortOperationSteps(
  operations: OperationTimelineDetail[],
  spend: OperationSpend,
  input: { sort: OperationStepSortKey; dir: OperationStepSortDir }
): OperationTimelineDetail[] {
  if (!spend.costAvailable && (input.sort === "calls" || input.sort === "tokens" || input.sort === "cost")) {
    return [...operations];
  }
  const lineage = new Map(operations.map((operation, index) => [operation.summary.operationRunId, index]));
  const direction = input.dir === "asc" ? 1 : -1;
  return [...operations].sort((left, right) => {
    const compared = compareOperationSteps(left, right, input.sort, spend, lineage);
    return input.sort === "lineage" ? compared : direction * compared;
  });
}

function compareJourneys(
  left: OperationJourney,
  right: OperationJourney,
  sort: JourneySortKey,
  spend: OperationSpend
): number {
  if (sort === "duration") return left.elapsedMs - right.elapsedMs;
  if (sort === "cost") return (journeyCost(left, spend)?.costUsd ?? 0) - (journeyCost(right, spend)?.costUsd ?? 0);
  return Date.parse(left.startedAt) - Date.parse(right.startedAt);
}

function compareOperationSteps(
  left: OperationTimelineDetail,
  right: OperationTimelineDetail,
  sort: OperationStepSortKey,
  spend: OperationSpend,
  lineage: Map<string, number>
): number {
  const primary = compareOperationStepPrimary(left, right, sort, spend, lineage);
  if (primary !== 0) return primary;
  const lineageCompare = lineageIndex(left, lineage) - lineageIndex(right, lineage);
  if (lineageCompare !== 0) return lineageCompare;
  return left.summary.operationId.localeCompare(right.summary.operationId);
}

function compareOperationStepPrimary(
  left: OperationTimelineDetail,
  right: OperationTimelineDetail,
  sort: OperationStepSortKey,
  spend: OperationSpend,
  lineage: Map<string, number>
): number {
  if (sort === "lineage") return lineageIndex(left, lineage) - lineageIndex(right, lineage);
  if (sort === "operation") return left.summary.operationType.localeCompare(right.summary.operationType);
  if (sort === "status") return left.summary.status.localeCompare(right.summary.status);
  if (sort === "started") return Date.parse(left.summary.startedAt) - Date.parse(right.summary.startedAt);
  if (sort === "duration") return left.summary.elapsedMs - right.summary.elapsedMs;

  const leftCost = operationCost(left.summary.operationId, left.summary.operationType, spend);
  const rightCost = operationCost(right.summary.operationId, right.summary.operationType, spend);
  if (sort === "calls") return (leftCost?.calls ?? 0) - (rightCost?.calls ?? 0);
  if (sort === "tokens") return (leftCost?.tokens ?? 0) - (rightCost?.tokens ?? 0);
  return (leftCost?.costUsd ?? 0) - (rightCost?.costUsd ?? 0);
}

function lineageIndex(operation: OperationTimelineDetail, lineage: Map<string, number>): number {
  return lineage.get(operation.summary.operationRunId) ?? Number.MAX_SAFE_INTEGER;
}
