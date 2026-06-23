import assert from "node:assert/strict";
import { test } from "node:test";
import { withStageTiming, type StageTiming } from "./stageTiming";

// The timing helper is deterministic envelope, not model output: assert its emitted
// shape and error behavior with an injected sink (no console capture).

test("emits one record with a non-negative integer ms and returns the stage result", async () => {
  const emitted: StageTiming[] = [];
  const result = await withStageTiming("enrich", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 42;
  }, (timing) => emitted.push(timing));

  assert.equal(result, 42);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].stage, "enrich");
  assert.equal(emitted[0].ok, true);
  assert.ok(Number.isInteger(emitted[0].ms) && emitted[0].ms >= 0, `ms must be a non-negative integer, got ${emitted[0].ms}`);
});

test("a throwing stage reports its partial timing with ok:false before the error propagates", async () => {
  const emitted: StageTiming[] = [];
  await assert.rejects(
    () => withStageTiming("boom", async () => {
      throw new Error("stage failed");
    }, (timing) => emitted.push(timing)),
    /stage failed/
  );

  assert.equal(emitted.length, 1, "the failing stage still emits exactly one timing record");
  assert.equal(emitted[0].stage, "boom");
  assert.equal(emitted[0].ok, false);
  assert.ok(Number.isInteger(emitted[0].ms) && emitted[0].ms >= 0);
});
