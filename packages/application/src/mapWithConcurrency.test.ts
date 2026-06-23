import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "./mapWithConcurrency";

test("preserves input order even when tasks resolve out of order", async () => {
  const items = [0, 1, 2, 3, 4];
  // Earlier items resolve LATER so completion order is the reverse of input order.
  const results = await mapWithConcurrency(items, 5, async (item) => {
    await new Promise((resolve) => setTimeout(resolve, (items.length - item) * 5));
    return item * 10;
  });
  assert.deepEqual(results, [0, 10, 20, 30, 40]);
});

test("never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });
  assert.ok(maxInFlight <= 3, `expected <= 3 in flight, saw ${maxInFlight}`);
});

test("a limit at or above item count degrades to all-at-once", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrency([1, 2, 3], 10, async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });
  assert.equal(maxInFlight, 3);
});

test("degree 1 runs strictly sequentially (start order == completion order)", async () => {
  const order: string[] = [];
  await mapWithConcurrency([0, 1, 2], 1, async (item) => {
    order.push(`start-${item}`);
    await new Promise((resolve) => setTimeout(resolve, item === 0 ? 15 : 1));
    order.push(`end-${item}`);
  });
  assert.deepEqual(order, ["start-0", "end-0", "start-1", "end-1", "start-2", "end-2"]);
});

test("a single rejection propagates and no new task starts after it", async () => {
  let started = 0;
  await assert.rejects(
    () => mapWithConcurrency([0, 1, 2, 3], 1, async (item) => {
      started += 1;
      if (item === 1) throw new Error("task failed");
      return item;
    }),
    /task failed/
  );
  // Degree 1: items 0 and 1 start; the throw aborts before 2 and 3 begin.
  assert.equal(started, 2);
});

test("an empty list resolves to an empty result without invoking fn", async () => {
  let calls = 0;
  const results = await mapWithConcurrency([], 4, async () => { calls += 1; return 1; });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});
