import type { OperationType, RunProgressReporterPort, StageErrorDetail } from "@lrnki/ports";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { isLlmStage, NON_LLM_STAGES, type NonLlmStage } from "./operationTimelineCatalog";

// The reporter seam's application-facing surface (KTD4, R7). Operations import the
// no-op default and the shared stage vocabulary from here; the worker injects the
// Postgres adapter (U3) and tests inject a fake. Keeping the no-op here — not in an
// adapter package — means an operation is callable with zero reporter wiring and
// behaves byte-identically to its pre-instrumentation self (U4 edge case).

// The no-op default: every method resolves with no I/O. An operation that accepts
// `reporter = noopRunProgressReporter` runs unchanged when nothing is injected.
export const noopRunProgressReporter: RunProgressReporterPort = {
  async beginOperation() {},
  async enterStage() {},
  async recordProgress() {},
  async completeStage() {},
  async completeOperation() {}
};

// Non-LLM stage identifiers (R2). These are timed for wall-clock like any stage but
// carry no LiteLLM spend tag, so they simply never appear in the cost half of the
// R5 join (left-join yields zero/absent cost). LLM stages reuse STAGE_TAGS verbatim
// (domain-core) so cost and wall-clock join on one key — `isLlmStage` guards that.
// The vocabulary helper (R5 join-key alignment): true exactly for the closed LLM
// stage set (STAGE_TAGS). Re-exported from domain-core so the reporter seam is the
// one application-facing surface, while the membership set stays a single source of
// truth shared with the infrastructure spend projection (U7).
export { isLlmStage, NON_LLM_STAGES, type NonLlmStage };

// The shared stage-bracket signature (U1/U2). A bracket opens a named stage, runs the
// work, and closes the stage — so a helper that receives one can attribute its inner
// LLM port calls to fine STAGE_TAGS names without knowing about the reporter or operation
// id. Threaded into assembleEnrichmentNodes and deduplicateDerivedNodes so the per-stage
// wall-clock bracket keys to the SAME fine names the inner calls already tag their cost
// with, closing the bottleneck-report join.
export type StageBracket = <T>(stage: string, fn: () => Promise<T>, total?: number) => Promise<T>;

// Instrumented operation wrapper shared by every operation (ADR-0029). It owns the
// operation lifecycle: ambient operation tag, begin-at-entry, exactly one terminal
// status, and propagation of the original result/error.
export async function runInstrumentedOperation<T>(
  reporter: RunProgressReporterPort,
  operationType: OperationType,
  operationId: string,
  fn: (runStage: StageBracket) => Promise<T>
): Promise<T> {
  return runWithOperationTag(operationId, async () => {
    await reporter.beginOperation({ operationType, operationId });
    const runStage = bracketStage(reporter, operationType, operationId);
    let result: T;
    try {
      result = await fn(runStage);
    } catch (error) {
      await reporter.completeOperation({ operationType, operationId, status: "failed" });
      throw error;
    }
    await reporter.completeOperation({ operationType, operationId, status: "succeeded" });
    return result;
  });
}

// Stage-bracket factory shared by every instrumented operation (R1). Open a stage, run
// it, close it ok:true; a throw closes it ok:false with redacted detail and rethrows.
// Operation terminal status is owned by runInstrumentedOperation so failures between
// stages cannot strand a permanent `running` row. `total` seeds an N-of-M heartbeat
// for stages that iterate.
export function bracketStage(reporter: RunProgressReporterPort, operationType: OperationType, operationId: string): StageBracket {
  return async <T>(stage: string, fn: () => Promise<T>, total?: number): Promise<T> => {
    await reporter.enterStage({ operationType, operationId, stage, total });
    try {
      const result = await fn();
      await reporter.completeStage({ operationType, operationId, stage, ok: true });
      return result;
    } catch (error) {
      // Persist the redacted reason (ADR-0006 fail-closed, inspectable) before failing the
      // stage. We never re-throw a different error or alter the fail-closed decision.
      await reporter.completeStage({ operationType, operationId, stage, ok: false, errorDetail: toStageErrorDetail(error) });
      throw error;
    }
  };
}

// Cap so a fallback `other` error message stays bounded in the timeline (matches the
// transport's snippet discipline; application never sees the raw arguments here).
const MESSAGE_CAP = 500;

// Reduce a caught stage error to its persisted, serializable detail. A carrier error
// (the litellm forced-tool exhaustion) exposes a ports-defined `stageErrorDetail` we read
// structurally — no infrastructure import, mirroring how `LiteLlmHttpError` is duck-typed.
// Anything else becomes a bounded, redacted `other` message.
export function toStageErrorDetail(error: unknown): StageErrorDetail {
  if (isStageErrorReporting(error)) return error.stageErrorDetail;
  const message = error instanceof Error ? error.message : String(error);
  const redacted = message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MESSAGE_CAP);
  return { kind: "other", message: redacted };
}

function isStageErrorReporting(error: unknown): error is { stageErrorDetail: StageErrorDetail } {
  return typeof error === "object" && error !== null && "stageErrorDetail" in error;
}

// Passthrough bracket: runs the work, opens/closes nothing. The default for a helper
// called outside an instrumented operation (a direct unit test, or a caller that does
// not thread a reporter) so the helper behaves byte-identically to its un-instrumented
// self (U1/U2 opt-in seam, mirroring noopRunProgressReporter).
export const passthroughStageBracket: StageBracket = (_stage, fn) => fn();
