// Worker-side per-stage wall-clock timing (plan U2, KTD5, R1). Stage wall-clock is
// invisible to LiteLLM (which sees only token/cost), so the worker times it directly.
// This module is the single STRUCTURED source: each bracketed stage emits one
// `stage_timing <json>` line with a monotonic, non-negative integer millisecond
// duration. The clock is monotonic (`performance.now`) and the only side effect is the
// emit, so timing never enters a persisted artifact (it is measurement, not state).

export type StageTiming = { stage: string; ms: number; ok: boolean };

// Sink for one structured timing record. Defaults to a greppable single-line JSON on
// stdout; injected in tests so the emit is observable without capturing console.
export type StageTimingSink = (timing: StageTiming) => void;

export const defaultStageTimingSink: StageTimingSink = (timing) => {
  console.log(`stage_timing ${JSON.stringify(timing)}`);
};

// Bracket one async stage: measure its wall-clock, emit exactly one timing record, and
// return the stage's result. A THROWING stage still reports its (partial) timing with
// ok:false BEFORE the error propagates, so a failed run is still attributable (R1).
export async function withStageTiming<T>(
  stage: string,
  fn: () => Promise<T>,
  emit: StageTimingSink = defaultStageTimingSink
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await fn();
    emit({ stage, ms: elapsedMs(startedAt), ok: true });
    return result;
  } catch (error) {
    emit({ stage, ms: elapsedMs(startedAt), ok: false });
    throw error;
  }
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
