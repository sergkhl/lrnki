import type {
  OperationTimelineReadPort,
  OperationType,
  StageSpendReadPort
} from "@lrnki/ports";
import { isLlmStage } from "./runProgressReporter";

// One per-stage row of the bottleneck report (ADR-0029). Wall-clock is per-operation (from
// the durable timeline); cost is the STANDING per-stage aggregate from LiteLLM (global
// — LiteLLM has no per-operation scoping). `calls`/`costUsd` are null for non-LLM
// stages and for LLM stages with no spend yet (or when LiteLLM is unavailable).
export interface BottleneckStageRow {
  stage: string;
  isLlmStage: boolean;
  wallClockMs: number | null;
  calls: number | null;
  costUsd: number | null;
}

export interface BottleneckReport {
  operationId: string;
  operationType: OperationType;
  status: string;
  // False when LiteLLM /spend/tags was unavailable: the wall-clock half still renders
  // The cost half is marked unavailable while the wall-clock half still renders.
  costAvailable: boolean;
  stages: BottleneckStageRow[];
}

// The single source of truth for the bottleneck report: it joins the
// per-operation timeline wall-clock with per-stage LiteLLM spend, keyed on the stage
// tag, and is recomputed on demand — never persisted, no cost figure ever stored.
// Both renderers (the worker CLI for code agents, the Admin Lab view for the admin
// user) call THIS; neither re-implements the join. Returns undefined for an unknown
// operation id. The row set is the UNION of timeline stages and spend STAGE_TAGS, so a
// per-operation wall-clock stage AND an LLM stage whose cost is tracked but whose
// wall-clock is folded into a coarser bracket (e.g. admission-label-judge) both appear.
export async function bottleneckReport(input: {
  operationId: string;
  timelineRead: OperationTimelineReadPort;
  stageSpendRead: StageSpendReadPort;
}): Promise<BottleneckReport | undefined> {
  const detail = await input.timelineRead.getOperationTimeline(input.operationId);
  if (!detail) return undefined;

  // Cost half degrades gracefully: a LiteLLM outage leaves the wall-clock half intact.
  let spendByTag: Map<string, { logCount: number; totalSpend: number }> | null = null;
  try {
    const spend = await input.stageSpendRead.readStageSpend();
    spendByTag = new Map(spend.map((row) => [row.tag, { logCount: row.logCount, totalSpend: row.totalSpend }]));
  } catch {
    spendByTag = null;
  }
  const costAvailable = spendByTag !== null;

  // Aggregate per-operation wall-clock by stage name (a stage that recurs sums its
  // closed durations; open stages contribute null and keep the stage present).
  const wallClockByStage = new Map<string, number | null>();
  const order: string[] = [];
  for (const stage of detail.stages) {
    if (!wallClockByStage.has(stage.stage)) order.push(stage.stage);
    const prior = wallClockByStage.get(stage.stage) ?? null;
    const next = stage.durationMs === null ? prior : (prior ?? 0) + stage.durationMs;
    wallClockByStage.set(stage.stage, next);
  }
  // Append spend-only STAGE_TAGS not present in the timeline (cost-tracked sub-stages
  // whose wall-clock is folded into a coarser bracket), so no cost is silently dropped.
  if (spendByTag) {
    for (const tag of spendByTag.keys()) {
      if (!wallClockByStage.has(tag)) {
        wallClockByStage.set(tag, null);
        order.push(tag);
      }
    }
  }

  const stages: BottleneckStageRow[] = order.map((stage) => {
    const spend = spendByTag?.get(stage);
    return {
      stage,
      isLlmStage: isLlmStage(stage),
      wallClockMs: wallClockByStage.get(stage) ?? null,
      calls: spend ? spend.logCount : null,
      costUsd: spend ? spend.totalSpend : null
    };
  });

  return {
    operationId: input.operationId,
    operationType: detail.summary.operationType,
    status: detail.summary.status,
    costAvailable,
    stages
  };
}
