import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATION_HEARTBEAT_STALE_AFTER_MS,
  isStaleOperation,
  operationStaleBefore
} from "./operationRunLiveness";

test("operationStaleBefore derives the shared two-minute heartbeat window", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  assert.equal(operationStaleBefore(now).toISOString(), "2026-07-07T11:58:00.000Z");
  assert.equal(OPERATION_HEARTBEAT_STALE_AFTER_MS, 120000);
});

test("isStaleOperation only marks running operations older than the shared window", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  assert.equal(isStaleOperation("running", "2026-07-07T11:57:59.999Z", now), true);
  assert.equal(isStaleOperation("running", "2026-07-07T11:58:00.000Z", now), false);
  assert.equal(isStaleOperation("succeeded", "2026-07-07T11:00:00.000Z", now), false);
  assert.equal(isStaleOperation("failed", "2026-07-07T11:00:00.000Z", now), false);
  assert.equal(isStaleOperation("running", null, now), false);
  assert.equal(isStaleOperation("running", "not a date", now), false);
});
