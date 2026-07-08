import type { OperationType } from "@lrnki/ports";
import type { CostTimingReport } from "./costTimingReport";

// Ranked-target derivation (plan U3, KTD5). A pure read over a completed CostTimingReport
// that names the (operation, stage) cost and time targets in descending order, each with
// its SHARE of the journey total. It is the handoff artifact for the deferred rule-21
// optimization pass: that pass measures before/after, and a ranked-share view is exactly
// what it re-reads. Domain-neutral by construction — it reads no concept content and
// touches no prompt (origin R4, AGENTS rule 17); it only flattens, filters, sorts, and
// divides the already-joined live numbers (no app-side cost computation, prior doc KD5).

// One ranked (operation, stage) target. The same shape serves both rankings; `costShare`
// and `wallShare` are each the row's fraction of the journey total for that axis, or null
// when the axis total is unavailable/zero. The driver columns (calls, tokens, the other
// axis) ride along so the optimization pass sees what makes the target expensive.
export interface RankedTarget {
  operationType: OperationType;
  operationId: string;
  stage: string;
  costUsd: number | null;
  costShare: number | null;
  wallClockMs: number | null;
  wallShare: number | null;
  calls: number | null;
  tokens: number | null;
}

export interface RankedTargets {
  // Stages with a non-null cost, ranked by cost descending (AE3).
  byCost: RankedTarget[];
  // Stages with a non-null wall-clock, ranked by wall-clock descending (AE3).
  byWall: RankedTarget[];
}

export function rankBottleneckTargets(report: CostTimingReport): RankedTargets {
  const totalCost = report.total.costUsd;
  const totalWall = report.total.wallClockMs;
  // Flatten every operation's stage rows into one (operation, stage) entry list, computing
  // each axis's share against the journey total. A null axis total (cost unavailable) or a
  // zero total yields a null share — never a divide-by-null or NaN.
  const entries: RankedTarget[] = report.operations.flatMap((operation) =>
    operation.stages.map((row) => ({
      operationType: operation.operationType,
      operationId: operation.operationId,
      stage: row.stage,
      costUsd: row.costUsd,
      costShare:
        row.costUsd !== null && totalCost !== null && totalCost > 0 ? row.costUsd / totalCost : null,
      wallClockMs: row.wallClockMs,
      wallShare: row.wallClockMs !== null && totalWall > 0 ? row.wallClockMs / totalWall : null,
      calls: row.calls,
      tokens: row.tokens
    }))
  );

  // A stage with cost but no wall ranks in byCost only; a stage with wall but no cost ranks
  // in byWall only (a non-LLM stage, or a cost-unavailable report). Ties break by
  // (operationType, stage) for a deterministic, replay-stable order.
  const byCost = entries
    .filter((entry) => entry.costUsd !== null)
    .sort(
      (a, b) =>
        b.costUsd! - a.costUsd! ||
        a.operationType.localeCompare(b.operationType) ||
        a.stage.localeCompare(b.stage)
    );
  const byWall = entries
    .filter((entry) => entry.wallClockMs !== null)
    .sort(
      (a, b) =>
        b.wallClockMs! - a.wallClockMs! ||
        a.operationType.localeCompare(b.operationType) ||
        a.stage.localeCompare(b.stage)
    );
  return { byCost, byWall };
}
