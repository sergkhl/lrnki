// Map over items with bounded concurrency, preserving INPUT order in the result
// regardless of completion order. This is the single shared copy used by every seam
// that needs bounded parallelism: the per-node enrichment unit, the extraction /
// study-item seams, and the `gateByJudgment` Measured Judge Gate that every neural
// judge now rides on.
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
