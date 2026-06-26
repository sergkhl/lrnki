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

export type BottleneckReportScope =
  | { operationId: string; operationType?: OperationType }
  | { journeyAnchorEnrichmentId: string };

export interface BottleneckStageRow {
  stage: string;
  isLlmStage: boolean;
  stageKind: OperationTimelineStageKind;
  wallClockMs: number | null;
  calls: number | null;
  costUsd: number | null;
  tokens: number | null;
}

export interface BottleneckTotals {
  wallClockMs: number;
  calls: number | null;
  costUsd: number | null;
  tokens: number | null;
}

export interface BottleneckOperationReport {
  operationId: string;
  operationType: OperationType;
  status: string;
  stages: BottleneckStageRow[];
  subtotal: BottleneckTotals;
}

export interface BottleneckReport {
  scope: "operation" | "journey";
  anchorId: string;
  costAvailable: boolean;
  operations: BottleneckOperationReport[];
  total: BottleneckTotals;
}

type OperationRef = { operationId: string; operationType: OperationType };

export async function bottleneckReport(input: {
  scope: BottleneckReportScope;
  timelineRead: OperationTimelineReadPort;
  operationStageSpendRead: OperationStageSpendReadPort;
  journeyLineageRead: JourneyLineageReadPort;
}): Promise<BottleneckReport | undefined> {
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
      { operationId: lineage.graphVersionId, operationType: "minting" },
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
    buildOperationReport(detail, spend)
  );
  return {
    scope,
    anchorId,
    costAvailable,
    operations,
    total: sumTotals(operations.map((operation) => operation.subtotal), costAvailable)
  };
}

function buildOperationReport(
  detail: OperationTimelineDetail,
  spend: OperationStageSpend[] | null
): BottleneckOperationReport {
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

  const stages = order.map((stage): BottleneckStageRow => {
    const row = spendByStage.get(stage);
    return {
      stage,
      isLlmStage: isLlmStage(stage),
      stageKind: operationTimelineStageKind(stage),
      wallClockMs: wallClockByStage.get(stage) ?? null,
      calls: row?.logCount ?? null,
      costUsd: row?.totalSpend ?? null,
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

function sumStageRows(rows: BottleneckStageRow[], costAvailable: boolean): BottleneckTotals {
  return {
    wallClockMs: rows.reduce((sum, row) => sum + (row.wallClockMs ?? 0), 0),
    calls: costAvailable ? rows.reduce((sum, row) => sum + (row.calls ?? 0), 0) : null,
    costUsd: costAvailable ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null,
    tokens: costAvailable ? rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) : null
  };
}

function sumTotals(rows: BottleneckTotals[], costAvailable: boolean): BottleneckTotals {
  return {
    wallClockMs: rows.reduce((sum, row) => sum + row.wallClockMs, 0),
    calls: costAvailable ? rows.reduce((sum, row) => sum + (row.calls ?? 0), 0) : null,
    costUsd: costAvailable ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null,
    tokens: costAvailable ? rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) : null
  };
}
