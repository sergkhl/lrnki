import type {
  JourneyLineageReadPort,
  OperationStageSpend,
  OperationStageSpendReadPort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  OperationType
} from "@lrnki/ports";
import {
  isLlmStage,
  operationTimelineStageKind,
  spendStageBelongsToOperation,
  type OperationTimelineStageKind
} from "./operationTimelineCatalog";

export type CostTimingReportScope =
  | { operationId: string; operationType?: OperationType }
  | { journeyAnchorEnrichmentId: string };

export interface CostTimingStageRow {
  stage: string;
  isLlmStage: boolean;
  stageKind: OperationTimelineStageKind;
  wallClockMs: number | null;
  calls: number | null;
  // Provider-billed spend plus the usage-derived estimate for OpenRouter BYOK rows
  // (plan 2026-07-10-004 U4/KTD6). `costEstimated` marks a row whose figure includes
  // an estimated component, so surfaces label it instead of presenting it as billed.
  costUsd: number | null;
  costEstimated: boolean;
  tokens: number | null;
}

export interface CostTimingTotals {
  wallClockMs: number;
  calls: number | null;
  costUsd: number | null;
  costEstimated: boolean;
  tokens: number | null;
}

export interface CostTimingOperationReport {
  operationId: string;
  operationType: OperationType;
  status: string;
  stages: CostTimingStageRow[];
  subtotal: CostTimingTotals;
}

export interface CostTimingReport {
  scope: "operation" | "journey";
  anchorId: string;
  costAvailable: boolean;
  operations: CostTimingOperationReport[];
  total: CostTimingTotals;
}

type OperationRef = { operationId: string; operationType: OperationType };

export async function costTimingReport(input: {
  scope: CostTimingReportScope;
  timelineRead: OperationTimelineReadPort;
  operationStageSpendRead: OperationStageSpendReadPort;
  journeyLineageRead: JourneyLineageReadPort;
}): Promise<CostTimingReport | undefined> {
  const scope = "operationId" in input.scope ? "operation" : "journey";
  const anchorId = "operationId" in input.scope
    ? input.scope.operationId
    : input.scope.journeyAnchorEnrichmentId;

  let refs: OperationRef[];
  let details: OperationTimelineDetail[];
  if ("operationId" in input.scope) {
    const detail = await input.timelineRead.getOperationTimeline(
      input.scope.operationId,
      input.scope.operationType
    );
    if (!detail) return undefined;
    refs = [{ operationId: detail.summary.operationId, operationType: detail.summary.operationType }];
    details = [detail];
  } else {
    const lineage = await input.journeyLineageRead.resolveJourney(input.scope.journeyAnchorEnrichmentId);
    if (!lineage) return undefined;
    refs = [
      ...lineage.extractionRunIds.map((operationId): OperationRef => ({ operationId, operationType: "extraction" })),
      ...(lineage.graphVersionId ? [{ operationId: lineage.graphVersionId, operationType: "minting" } satisfies OperationRef] : []),
      { operationId: lineage.enrichmentId, operationType: "enrichment" },
      { operationId: lineage.enrichmentId, operationType: "study_items" }
    ];
    const resolved = await Promise.all(
      refs.map((ref) => input.timelineRead.getOperationTimeline(ref.operationId, ref.operationType))
    );
    details = resolved.filter((detail): detail is OperationTimelineDetail => detail !== undefined);
    refs = details.map((detail) => ({
      operationId: detail.summary.operationId,
      operationType: detail.summary.operationType
    }));
    if (details.length === 0) return undefined;
  }

  let spend: OperationStageSpend[] | null = null;
  try {
    spend = await input.operationStageSpendRead.readOperationStageSpend(
      [...new Set(refs.map((ref) => ref.operationId))]
    );
  } catch {
    spend = null;
  }

  const costAvailable = spend !== null;
  const operations = details.map((detail) =>
    mergeOperationStageRows(detail, spend)
  );
  return {
    scope,
    anchorId,
    costAvailable,
    operations,
    total: sumTotals(operations.map((operation) => operation.subtotal), costAvailable)
  };
}

export function mergeOperationStageRows(
  detail: OperationTimelineDetail,
  spend: OperationStageSpend[] | null
): CostTimingOperationReport {
  const operationSpend = (spend ?? []).filter(
    (row) =>
      row.operationId === detail.summary.operationId &&
      spendStageBelongsToOperation(row.stage, detail.summary.operationType)
  );
  const spendByStage = new Map(operationSpend.map((row) => [row.stage, row]));
  const wallClockByStage = new Map<string, number | null>();
  const order: string[] = [];
  for (const stage of detail.stages) {
    if (!wallClockByStage.has(stage.stage)) order.push(stage.stage);
    const prior = wallClockByStage.get(stage.stage) ?? null;
    wallClockByStage.set(stage.stage, stage.durationMs === null ? prior : (prior ?? 0) + stage.durationMs);
  }
  for (const row of operationSpend) {
    if (!wallClockByStage.has(row.stage)) {
      wallClockByStage.set(row.stage, null);
      order.push(row.stage);
    }
  }

  const stages = order.map((stage): CostTimingStageRow => {
    const row = spendByStage.get(stage);
    return {
      stage,
      isLlmStage: isLlmStage(stage),
      stageKind: operationTimelineStageKind(stage),
      wallClockMs: wallClockByStage.get(stage) ?? null,
      calls: row?.logCount ?? null,
      costUsd: row ? row.totalSpend + row.estimatedSpend : null,
      costEstimated: (row?.estimatedSpend ?? 0) > 0,
      tokens: row?.totalTokens ?? null
    };
  });
  return {
    operationId: detail.summary.operationId,
    operationType: detail.summary.operationType,
    status: detail.summary.status,
    stages,
    subtotal: sumStageRows(stages, spend !== null)
  };
}

function sumStageRows(rows: CostTimingStageRow[], costAvailable: boolean): CostTimingTotals {
  return {
    wallClockMs: rows.reduce((sum, row) => sum + (row.wallClockMs ?? 0), 0),
    calls: costAvailable ? rows.reduce((sum, row) => sum + (row.calls ?? 0), 0) : null,
    costUsd: costAvailable ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null,
    costEstimated: costAvailable && rows.some((row) => row.costEstimated),
    tokens: costAvailable ? rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) : null
  };
}

function sumTotals(rows: CostTimingTotals[], costAvailable: boolean): CostTimingTotals {
  return {
    wallClockMs: rows.reduce((sum, row) => sum + row.wallClockMs, 0),
    calls: costAvailable ? rows.reduce((sum, row) => sum + (row.calls ?? 0), 0) : null,
    costUsd: costAvailable ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null,
    costEstimated: costAvailable && rows.some((row) => row.costEstimated),
    tokens: costAvailable ? rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) : null
  };
}
