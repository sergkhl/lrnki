import { isStageTag } from "@lrnki/domain-core";
import type { RunProgressReporterPort } from "@lrnki/ports";

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
export const NON_LLM_STAGES = {
  documentLoad: "document-load",
  persist: "persist",
  // Minting (graph-version build) is LLM-free: load base + selected runs, refine,
  // persist (ADR-0010/ADR-0017).
  load: "load",
  refine: "refine"
} as const;

export type NonLlmStage = (typeof NON_LLM_STAGES)[keyof typeof NON_LLM_STAGES];

// The vocabulary helper (R5 join-key alignment): true exactly for the closed LLM
// stage set (STAGE_TAGS). Re-exported from domain-core so the reporter seam is the
// one application-facing surface, while the membership set stays a single source of
// truth shared with the infrastructure spend projection (U7).
export const isLlmStage = isStageTag;
