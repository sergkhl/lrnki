import { mapWithConcurrency } from "./mapWithConcurrency";

// The Measured Judge Gate — the single enforcement home for AGENTS rule 16.
//
// Every neural judge in the application package applies a measured gate over
// deterministic output, and they all depend on the same cross-cutting guarantee:
// *a failed judge call is a pass-through; a drop/demote happens only on a confident
// verdict.* This module owns that envelope once so it is no longer re-proven in six
// hand-written `catch` blocks.
//
// GUARANTEE (the load-bearing invariant, tested once in gateByJudgment.test.ts):
// - A thrown or schema-invalid `judge` call routes to `onUnavailable` and can NEVER
//   reach `onVerdict`. `onVerdict` runs ONLY on a value the judge resolved — so only a
//   confident verdict can subtract output. This is AGENTS rule 16 made structural.
// - `skip` short-circuits with a full outcome and NO neural call, so item pre-filtering
//   (which items get judged) lives in the gate, not in a bespoke branch inside a worker.
// - Results are index-aligned to `items` (inherited from `mapWithConcurrency`): the
//   outcome at `results[i]` is always the outcome for `items[i]`, regardless of the
//   order in which judge calls resolve.
// - At most `concurrency` judge calls are in flight at once (default 4), and the
//   rejection/empty-array semantics of `mapWithConcurrency` are inherited unchanged.
//
// `R` (the outcome) is fully generic: the gate imposes no disposition type, so each
// judge keeps its exact return shape. The gate guarantees the routing, not the payload.
export async function gateByJudgment<T, V, R>(
  items: readonly T[],
  spec: {
    concurrency?: number;
    // No neural call: when this returns an outcome (anything but `undefined`), it is
    // used directly and `judge`/`onVerdict`/`onUnavailable` are never invoked for the item.
    skip?: (item: T, index: number) => R | undefined;
    // The ONE neural call. May throw or reject; a thrown call routes to `onUnavailable`.
    judge: (item: T, index: number) => Promise<V>;
    // Domain decision on a CONFIDENT verdict. Unreachable when `judge` throws.
    onVerdict: (item: T, verdict: V, index: number) => R;
    // Pass-through outcome (optionally flagged) when the judge call is unavailable.
    onUnavailable: (item: T, error: unknown, index: number) => R;
  }
): Promise<R[]> {
  return mapWithConcurrency(items, spec.concurrency ?? 4, async (item, index) => {
    const skipped = spec.skip?.(item, index);
    if (skipped !== undefined) return skipped;
    try {
      return spec.onVerdict(item, await spec.judge(item, index), index);
    } catch (error) {
      return spec.onUnavailable(item, error, index);
    }
  });
}
