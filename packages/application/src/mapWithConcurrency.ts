// Map over items with bounded concurrency, preserving INPUT order in the result
// regardless of completion order (plan U6, KTD8). This is the single shared copy used
// by the per-node enrichment unit and the parallel-ready extraction / study-item seams.
//
// Semantics:
// - At most `limit` invocations of `fn` run at once (workers pull from a shared cursor).
// - `results[i]` always holds `fn(items[i])`, so the caller's order is deterministic
//   even though tasks may complete out of order — the replay contract downstream
//   depends on this (R8).
// - A rejection propagates: the first task to reject aborts the batch (its error
//   surfaces from the returned promise), so a partial result is never returned. In-flight
//   tasks already running are not cancelled, but no NEW task is started after rejection.
// - `limit >= items.length` degrades to "all at once"; `limit <= 0` is clamped to 1.
//
// KTD8: this lifts ONE shared helper for the seams that need it. The four other duplicate
// copies (applyAdmissionLabelJudge, applyAssertionEntailmentJudge,
// applyRescueDurabilityJudge, executeExtractionRun) are intentionally left untouched;
// consolidating them is deferred follow-up, out of this change's scope.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
