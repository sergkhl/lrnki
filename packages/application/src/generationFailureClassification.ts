import type { ForcedToolFailureAttempt, StageErrorDetail } from "@lrnki/ports";

// Shared generation failure classification (plan 2026-07-16-004 KTD6). Package-internal:
// Topic Expedition and Scaffold Generation reuse ONE transient-vs-deterministic decision, and
// neither re-exports it from `@lrnki/application` — the supervisor only ever sees a rejection.

// Transient vs. deterministic exhaustion, decided over the transport's classified
// attempt trail (duck-typed via StageErrorDetail — no infrastructure import). Only a
// trail made ENTIRELY of infrastructure failures (network, timeout, HTTP 5xx/429) is
// transient; any model deviation (schema-invalid, no tool call, …) means retrying the
// same prompt is the budget the transport already spent, so fail immediately.
export function isTransientGenerationError(error: unknown): boolean {
  const attempts = stageErrorAttempts(error);
  if (!attempts || attempts.length === 0) return false;
  return attempts.every((attempt) =>
    attempt.kind === "network"
    || attempt.kind === "timeout"
    || (attempt.kind === "http" && (attempt.status === 429 || (attempt.status !== undefined && attempt.status >= 500)))
  );
}

function stageErrorAttempts(error: unknown): ForcedToolFailureAttempt[] | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const detail = (error as { stageErrorDetail?: StageErrorDetail }).stageErrorDetail;
  return detail?.attempts;
}
