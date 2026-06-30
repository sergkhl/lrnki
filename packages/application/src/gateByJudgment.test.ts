import assert from "node:assert/strict";
import { test } from "node:test";
import { gateByJudgment } from "./gateByJudgment";

// AE1 / R2 — the rule-16 guarantee, proven once: a thrown judge routes to
// `onUnavailable` and NEVER reaches `onVerdict`.
test("a judge that throws routes to onUnavailable and never reaches onVerdict", async () => {
  let verdictCalls = 0;
  const results = await gateByJudgment([{ id: "a" }], {
    judge: async () => {
      throw new Error("judge transport failure");
    },
    onVerdict: () => {
      verdictCalls += 1;
      return "verdict";
    },
    onUnavailable: (item, error) => `unavailable:${item.id}:${(error as Error).message}`
  });
  assert.deepEqual(results, ["unavailable:a:judge transport failure"]);
  assert.equal(verdictCalls, 0, "onVerdict must never run when the judge throws");
});

test("a judge that resolves routes to onVerdict and never reaches onUnavailable", async () => {
  let unavailableCalls = 0;
  const results = await gateByJudgment([{ id: "a" }, { id: "b" }], {
    judge: async (item) => `V(${item.id})`,
    onVerdict: (item, verdict) => `${item.id}=>${verdict}`,
    onUnavailable: () => {
      unavailableCalls += 1;
      return "unavailable";
    }
  });
  assert.deepEqual(results, ["a=>V(a)", "b=>V(b)"]);
  assert.equal(unavailableCalls, 0, "onUnavailable must never run when the judge resolves");
});

// R6 — `skip` short-circuits with no neural call.
test("a skipped item uses its skip outcome and issues no judge / verdict / unavailable call", async () => {
  let judgeCalls = 0;
  let verdictCalls = 0;
  let unavailableCalls = 0;
  const results = await gateByJudgment([{ id: "skip" }, { id: "judge" }], {
    skip: (item) => (item.id === "skip" ? `skipped:${item.id}` : undefined),
    judge: async (item) => {
      judgeCalls += 1;
      return `V(${item.id})`;
    },
    onVerdict: (item, verdict) => {
      verdictCalls += 1;
      return `${item.id}=>${verdict}`;
    },
    onUnavailable: () => {
      unavailableCalls += 1;
      return "unavailable";
    }
  });
  assert.deepEqual(results, ["skipped:skip", "judge=>V(judge)"]);
  assert.equal(judgeCalls, 1, "judge runs only for the non-skipped item");
  assert.equal(verdictCalls, 1);
  assert.equal(unavailableCalls, 0);
});

// Results stay index-aligned even when judge calls resolve out of completion order.
test("results are index-aligned even when judge calls resolve out of order", async () => {
  const items = [0, 1, 2, 3, 4];
  const results = await gateByJudgment(items, {
    // Earlier items resolve later, so completion order is the reverse of input order.
    judge: async (item) => {
      await new Promise((resolve) => setTimeout(resolve, (items.length - item) * 5));
      return item * 10;
    },
    onVerdict: (_item, verdict) => verdict,
    onUnavailable: () => -1
  });
  assert.deepEqual(results, [0, 10, 20, 30, 40]);
});

// `concurrency` bounds the number of in-flight judge calls.
test("concurrency bounds the number of in-flight judge calls", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await gateByJudgment(Array.from({ length: 10 }, (_, i) => i), {
    concurrency: 3,
    judge: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return true;
    },
    onVerdict: () => "ok",
    onUnavailable: () => "fail"
  });
  assert.ok(maxInFlight <= 3, `expected <= 3 in flight, saw ${maxInFlight}`);
});

test("an empty items array returns [] without constructing a worker", async () => {
  let judgeCalls = 0;
  const results = await gateByJudgment([], {
    judge: async () => {
      judgeCalls += 1;
      return true;
    },
    onVerdict: () => "ok",
    onUnavailable: () => "fail"
  });
  assert.deepEqual(results, []);
  assert.equal(judgeCalls, 0);
});
