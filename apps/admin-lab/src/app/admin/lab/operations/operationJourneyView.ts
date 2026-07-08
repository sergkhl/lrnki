import { spendStageBelongsToOperation } from "@lrnki/application";
import type { OperationJourney } from "@lrnki/application";
import type { OperationStageSpend, OperationTimelineDetail, OperationType } from "@lrnki/ports";

export type JourneySortKey = "started" | "duration" | "cost";
export type JourneySortDir = "asc" | "desc";

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
