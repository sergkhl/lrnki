import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";
import type { CostTimingOperationReport, CostTimingReport, CostTimingStageRow } from "./costTimingReport";
import { rankBottleneckTargets } from "./rankBottleneckTargets";
import { NON_LLM_STAGES } from "./runProgressReporter";

// Deterministic-envelope tests over the pure ranking transform (U3). The reports here are
// hand-built INPUT FIXTURES exercising flatten → filter → sort → share — never an assertion
// about which stage *should* be expensive (AGENTS rule 11). No model, no DB.

function stageRow(stage: string, over: Partial<CostTimingStageRow> = {}): CostTimingStageRow {
  return {
    stage,
    isLlmStage: true,
    stageKind: "llm",
    wallClockMs: null,
    calls: null,
    costUsd: null,
    costEstimated: false,
    tokens: null,
    ...over
  };
}

function operation(
  operationType: OperationType,
  operationId: string,
  stages: CostTimingStageRow[]
): CostTimingOperationReport {
  const costUsd = stages.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const wallClockMs = stages.reduce((sum, row) => sum + (row.wallClockMs ?? 0), 0);
  return {
    operationId,
    operationType,
    status: "succeeded",
    stages,
    subtotal: { wallClockMs, calls: null, costUsd, costEstimated: false, tokens: null }
  };
}

function report(operations: CostTimingOperationReport[], costAvailable = true): CostTimingReport {
  const wallClockMs = operations.reduce((sum, op) => sum + op.subtotal.wallClockMs, 0);
  const costUsd = costAvailable ? operations.reduce((sum, op) => sum + (op.subtotal.costUsd ?? 0), 0) : null;
  return {
    scope: operations.length > 1 ? "journey" : "operation",
    anchorId: "anchor-1",
    costAvailable,
    operations,
    total: { wallClockMs, calls: null, costUsd, costEstimated: false, tokens: null }
  };
}

test("AE3: byCost is ordered by costUsd desc, byWall by wallClockMs desc, shares sum to ~1.0", () => {
  const r = report([
    operation("enrichment", "e1", [
      stageRow("prerequisite-ordering", { costUsd: 0.06, wallClockMs: 100, calls: 8, tokens: 4000 }),
      stageRow("grounding-generation", { costUsd: 0.02, wallClockMs: 300, calls: 3, tokens: 1500 })
    ]),
    operation("extraction", "x1", [
      stageRow("admission", { costUsd: 0.12, wallClockMs: 50, calls: 2, tokens: 9000 })
    ])
  ]);
  const ranked = rankBottleneckTargets(r);
  assert.deepEqual(ranked.byCost.map((t) => t.stage), ["admission", "prerequisite-ordering", "grounding-generation"]);
  assert.deepEqual(ranked.byWall.map((t) => t.stage), ["grounding-generation", "prerequisite-ordering", "admission"]);
  // Shares are computed against the journey totals (cost 0.20, wall 450).
  const top = ranked.byCost[0];
  assert.equal(top.stage, "admission");
  assert.ok(Math.abs(top.costShare! - 0.12 / 0.2) < 1e-9);
  const costShareSum = ranked.byCost.reduce((sum, t) => sum + (t.costShare ?? 0), 0);
  const wallShareSum = ranked.byWall.reduce((sum, t) => sum + (t.wallShare ?? 0), 0);
  assert.ok(Math.abs(costShareSum - 1) < 1e-9, "cost shares sum to ~1");
  assert.ok(Math.abs(wallShareSum - 1) < 1e-9, "wall shares sum to ~1");
});

test("a stage with cost but null wall appears in byCost only; null-cost wall stage in byWall only", () => {
  const r = report([
    operation("enrichment", "e1", [
      stageRow("node-merge-adjudication", { costUsd: 0.04, wallClockMs: null, calls: 5, tokens: 2000 }),
      stageRow(NON_LLM_STAGES.persist, { costUsd: null, wallClockMs: 80, calls: null, tokens: null, isLlmStage: false, stageKind: "non_llm" })
    ])
  ]);
  const ranked = rankBottleneckTargets(r);
  assert.deepEqual(ranked.byCost.map((t) => t.stage), ["node-merge-adjudication"]);
  assert.ok(!ranked.byCost.some((t) => t.stage === NON_LLM_STAGES.persist), "null-cost stage excluded from byCost");
  assert.deepEqual(ranked.byWall.map((t) => t.stage), [NON_LLM_STAGES.persist]);
  assert.ok(!ranked.byWall.some((t) => t.stage === "node-merge-adjudication"), "null-wall stage excluded from byWall");
});

test("cost-unavailable report: byCost is empty, byWall still ranks — no divide-by-null, no throw", () => {
  const r = report(
    [
      operation("enrichment", "e1", [
        stageRow("prerequisite-ordering", { costUsd: null, wallClockMs: 200, calls: null, tokens: null }),
        stageRow("intrinsic-difficulty", { costUsd: null, wallClockMs: 50, calls: null, tokens: null })
      ])
    ],
    false
  );
  const ranked = rankBottleneckTargets(r);
  assert.deepEqual(ranked.byCost, []);
  assert.deepEqual(ranked.byWall.map((t) => t.stage), ["prerequisite-ordering", "intrinsic-difficulty"]);
  assert.equal(ranked.byWall[0].costShare, null, "no cost share when cost is unavailable");
  assert.ok(ranked.byWall[0].wallShare !== null, "wall share still computed");
});

test("operation-scoped report ranks within the single operation; journey ranks across all operations", () => {
  const operationScoped = report([
    operation("enrichment", "e1", [
      stageRow("grounding-generation", { costUsd: 0.03, wallClockMs: 120 }),
      stageRow("prerequisite-ordering", { costUsd: 0.05, wallClockMs: 90 })
    ])
  ]);
  const opRanked = rankBottleneckTargets(operationScoped);
  assert.equal(opRanked.byCost.length, 2);
  assert.deepEqual(opRanked.byCost.map((t) => t.stage), ["prerequisite-ordering", "grounding-generation"]);

  const journey = report([
    operation("extraction", "x1", [stageRow("admission", { costUsd: 0.1, wallClockMs: 40 })]),
    operation("minting", "m1", [stageRow(NON_LLM_STAGES.refine, { costUsd: null, wallClockMs: 10, isLlmStage: false, stageKind: "non_llm" })]),
    operation("enrichment", "e1", [stageRow("prerequisite-ordering", { costUsd: 0.05, wallClockMs: 90 })]),
    operation("study_items", "e1", [
      stageRow(STAGE_TAGS.conceptLessonGeneration, { costUsd: 0.03, wallClockMs: 80, calls: 1, tokens: 100 }),
      stageRow(STAGE_TAGS.studyItemGeneration, { costUsd: 0.07, wallClockMs: 200, calls: 4, tokens: 400 }),
      stageRow(STAGE_TAGS.impostorGeneration, { costUsd: 0.06, wallClockMs: 120, calls: 5, tokens: 500 })
    ])
  ]);
  const journeyRanked = rankBottleneckTargets(journey);
  assert.deepEqual(journeyRanked.byCost.map((t) => `${t.operationType}/${t.stage}`), [
    "extraction/admission",
    "study_items/study-item-generation",
    "study_items/impostor-generation",
    "enrichment/prerequisite-ordering",
    "study_items/concept-lesson-generation"
  ]);
  assert.ok(journeyRanked.byCost.some((t) => t.stage === STAGE_TAGS.conceptLessonGeneration));
  assert.ok(Math.abs(journeyRanked.byCost.find((t) => t.stage === STAGE_TAGS.impostorGeneration)!.costShare! - 0.06 / 0.31) < 1e-9);
  assert.ok(Math.abs(journeyRanked.byWall.find((t) => t.stage === STAGE_TAGS.studyItemGeneration)!.wallShare! - 200 / 540) < 1e-9);
  // The minting refine stage has null cost ⇒ byCost excludes it but byWall includes it.
  assert.ok(journeyRanked.byWall.some((t) => t.stage === NON_LLM_STAGES.refine));
});

test("empty report (no stages) yields two empty lists", () => {
  const ranked = rankBottleneckTargets(report([operation("enrichment", "e1", [])]));
  assert.deepEqual(ranked.byCost, []);
  assert.deepEqual(ranked.byWall, []);
});
