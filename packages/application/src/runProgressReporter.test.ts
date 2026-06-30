import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { RunProgressReporterPort, StageErrorDetail } from "@lrnki/ports";
import { bracketStage, noopRunProgressReporter, NON_LLM_STAGES, isLlmStage, toStageErrorDetail } from "./runProgressReporter";

// Deterministic contract tests (rule 11): the no-op default and the closed
// stage-vocabulary helper. No model judgment is asserted.

test("noopRunProgressReporter resolves every method with no value and no throw", async () => {
  await assert.doesNotReject(noopRunProgressReporter.beginOperation({ operationType: "extraction", operationId: "op-1" }));
  assert.equal(await noopRunProgressReporter.enterStage({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, total: 5 }), undefined);
  assert.equal(await noopRunProgressReporter.recordProgress({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, done: 3 }), undefined);
  assert.equal(await noopRunProgressReporter.completeStage({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, ok: true }), undefined);
  assert.equal(await noopRunProgressReporter.completeOperation({ operationType: "extraction", operationId: "op-1", status: "succeeded" }), undefined);
});

test("isLlmStage is true for the full LLM stage set (extraction + enrichment + study items)", () => {
  for (const tag of Object.values(STAGE_TAGS)) {
    assert.equal(isLlmStage(tag), true, `expected ${tag} to be an LLM stage`);
  }
  // Spot-check representative members across the three operations explicitly.
  assert.equal(isLlmStage(STAGE_TAGS.conceptDiscovery), true);
  assert.equal(isLlmStage(STAGE_TAGS.prerequisiteOrdering), true);
  assert.equal(isLlmStage(STAGE_TAGS.studyItemGeneration), true);
});

test("isLlmStage is false for non-LLM stages and a fabricated unknown stage", () => {
  for (const stage of Object.values(NON_LLM_STAGES)) {
    assert.equal(isLlmStage(stage), false, `expected ${stage} to be a non-LLM stage`);
  }
  assert.equal(isLlmStage("totally-made-up-stage"), false);
});

// --- ADR-0006 fail-closed exhaustion, persisted via the one catch point ------

// Records completeStage inputs so we can assert the failing close carries error detail.
function recordingReporter(): RunProgressReporterPort & { completed: { ok: boolean; errorDetail?: StageErrorDetail }[] } {
  const completed: { ok: boolean; errorDetail?: StageErrorDetail }[] = [];
  return {
    completed,
    async beginOperation() {},
    async enterStage() {},
    async recordProgress() {},
    async completeStage(input) {
      completed.push({ ok: input.ok, errorDetail: input.errorDetail });
    },
    async completeOperation() {}
  };
}

test("toStageErrorDetail reads a carrier's stageErrorDetail structurally (no infra import)", () => {
  const carried: StageErrorDetail = { kind: "forced_tool_exhaustion", message: "boom", toolName: "submit_thing", attempts: [{ attempt: 0, kind: "schema_invalid" }] };
  const carrier = Object.assign(new Error("boom"), { stageErrorDetail: carried });
  assert.deepEqual(toStageErrorDetail(carrier), carried);
});

test("toStageErrorDetail reduces a plain error to a bounded, redacted 'other' detail", () => {
  const detail = toStageErrorDetail(new Error("line1\nline2\twith\ttabs"));
  assert.equal(detail.kind, "other");
  assert.equal(detail.message, "line1 line2 with tabs"); // control bytes collapsed to spaces
  assert.equal(detail.attempts, undefined);
});

test("bracketStage persists the failing close with error detail, then rethrows (fail closed)", async () => {
  const reporter = recordingReporter();
  const bracket = bracketStage(reporter, "extraction", "op-1");
  const carried: StageErrorDetail = { kind: "forced_tool_exhaustion", message: "exhausted", toolName: "submit_thing" };
  await assert.rejects(
    () => bracket(STAGE_TAGS.cepExtraction, async () => {
      throw Object.assign(new Error("exhausted"), { stageErrorDetail: carried });
    }),
    /exhausted/
  );
  assert.equal(reporter.completed.length, 1);
  assert.equal(reporter.completed[0].ok, false);
  assert.deepEqual(reporter.completed[0].errorDetail, carried);
});

test("bracketStage closes a successful stage ok with no error detail", async () => {
  const reporter = recordingReporter();
  const bracket = bracketStage(reporter, "extraction", "op-1");
  const result = await bracket(STAGE_TAGS.cepExtraction, async () => 42);
  assert.equal(result, 42);
  assert.deepEqual(reporter.completed, [{ ok: true, errorDetail: undefined }]);
});
