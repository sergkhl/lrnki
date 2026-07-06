import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { RunProgressReporterPort, StageErrorDetail } from "@lrnki/ports";
import { bracketStage, noopRunProgressReporter, NON_LLM_STAGES, isLlmStage, runInstrumentedOperation, toStageErrorDetail } from "./runProgressReporter";

// Deterministic contract tests (rule 11): the no-op default and the closed
// stage-vocabulary helper. No model judgment is asserted.

installNodeOperationTagContext();

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
function recordingReporter(): RunProgressReporterPort & {
  events: string[];
  completed: { ok: boolean; errorDetail?: StageErrorDetail }[];
  operations: string[];
} {
  const events: string[] = [];
  const completed: { ok: boolean; errorDetail?: StageErrorDetail }[] = [];
  const operations: string[] = [];
  return {
    events,
    completed,
    operations,
    async beginOperation() { events.push("begin"); },
    async enterStage(input) { events.push(`enter:${input.stage}`); },
    async recordProgress() {},
    async completeStage(input) {
      events.push(`stage:${input.stage}:${input.ok ? "ok" : "failed"}`);
      completed.push({ ok: input.ok, errorDetail: input.errorDetail });
    },
    async completeOperation(input) {
      events.push(`operation:${input.status}`);
      operations.push(input.status);
    },
    async touch() { events.push("touch"); }
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

test("bracketStage persists the failing close with error detail, then rethrows", async () => {
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
  assert.deepEqual(reporter.operations, []);
});

test("bracketStage closes a successful stage ok with no error detail", async () => {
  const reporter = recordingReporter();
  const bracket = bracketStage(reporter, "extraction", "op-1");
  const result = await bracket(STAGE_TAGS.cepExtraction, async () => 42);
  assert.equal(result, 42);
  assert.deepEqual(reporter.completed, [{ ok: true, errorDetail: undefined }]);
});

test("runInstrumentedOperation begins before stages, completes succeeded, returns result, and sets operation tag", async () => {
  const reporter = recordingReporter();
  const result = await runInstrumentedOperation(reporter, "extraction", "op-1", async (runStage) => {
    assert.equal(currentOperationTag(), "op-1");
    return runStage(STAGE_TAGS.cepExtraction, async () => 42);
  });

  assert.equal(result, 42);
  assert.deepEqual(reporter.events, [
    "begin",
    `enter:${STAGE_TAGS.cepExtraction}`,
    `stage:${STAGE_TAGS.cepExtraction}:ok`,
    "operation:succeeded"
  ]);
});

test("runInstrumentedOperation marks failed after an in-stage throw and propagates the error", async () => {
  const reporter = recordingReporter();
  const carried: StageErrorDetail = { kind: "forced_tool_exhaustion", message: "exhausted", toolName: "submit_thing" };

  await assert.rejects(
    () => runInstrumentedOperation(reporter, "extraction", "op-1", (runStage) =>
      runStage(STAGE_TAGS.cepExtraction, async () => {
        throw Object.assign(new Error("exhausted"), { stageErrorDetail: carried });
      })
    ),
    /exhausted/
  );

  assert.deepEqual(reporter.events, [
    "begin",
    `enter:${STAGE_TAGS.cepExtraction}`,
    `stage:${STAGE_TAGS.cepExtraction}:failed`,
    "operation:failed"
  ]);
  assert.deepEqual(reporter.completed[0].errorDetail, carried);
});

test("runInstrumentedOperation marks failed when the operation throws between stages", async () => {
  const reporter = recordingReporter();

  await assert.rejects(
    () => runInstrumentedOperation(reporter, "extraction", "op-1", async () => {
      throw new Error("between stages");
    }),
    /between stages/
  );

  assert.deepEqual(reporter.events, ["begin", "operation:failed"]);
});

test("runInstrumentedOperation does not rewrite a success-completion reporter failure as operation failure", async () => {
  const operations: string[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation() {},
    async enterStage() {},
    async recordProgress() {},
    async completeStage() {},
    async completeOperation(input) {
      operations.push(input.status);
      if (input.status === "succeeded") throw new Error("could not mark succeeded");
    },
    async touch() {}
  };

  await assert.rejects(
    () => runInstrumentedOperation(reporter, "extraction", "op-1", async () => 42),
    /could not mark succeeded/
  );

  assert.deepEqual(operations, ["succeeded"]);
});
