import assert from "node:assert/strict";
import { test } from "node:test";
import type { ForcedToolFailureAttempt } from "@lrnki/ports";
import {
  LiteLlmHttpError,
  classifyTransportFailure,
  parseRetryAfterMs,
  runWithTransportRetries,
  transportRetryDelayMs
} from "./liteLlmRetry";

test("Retry-After parsing accepts delay-seconds and future HTTP dates", () => {
  assert.equal(parseRetryAfterMs("17", 0), 17_000);
  assert.equal(
    parseRetryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:27:45 GMT")),
    15_000
  );
  assert.equal(parseRetryAfterMs("not-a-delay", 0), undefined);
  assert.equal(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:28:01 GMT")), undefined);
});

test("429 retry delay respects the server hint and a cooldown-sized bounded floor", () => {
  assert.equal(transportRetryDelayMs({ attempt: 0, kind: "http", status: 429 }), 15_000);
  assert.equal(transportRetryDelayMs({ attempt: 1, kind: "http", status: 429 }), 30_000);
  assert.equal(transportRetryDelayMs({ attempt: 0, kind: "http", status: 429, retryAfterMs: 45_000 }), 45_000);
  assert.equal(transportRetryDelayMs({ attempt: 4, kind: "http", status: 429, retryAfterMs: 300_000 }), 120_000);
  assert.equal(transportRetryDelayMs({ attempt: 1, kind: "http", status: 503 }), 1_000);
});

test("the shared retry loop applies the classified 429 delay before a byte-equivalent retry", async () => {
  const delays: number[] = [];
  const observedPrevious: Array<ForcedToolFailureAttempt | undefined> = [];
  const result = await runWithTransportRetries({
    maxRetries: 1,
    async attemptOnce(attempt, previous) {
      observedPrevious.push(previous);
      if (attempt === 0) throw new LiteLlmHttpError(429, 23_000);
      return "recovered";
    },
    classify: (attempt, error) => classifyTransportFailure(attempt, error) ?? { attempt, kind: "other" },
    onExhausted: () => {
      throw new Error("unexpected exhaustion");
    },
    async sleep(milliseconds) {
      delays.push(milliseconds);
    }
  });

  assert.equal(result, "recovered");
  assert.deepEqual(delays, [23_000]);
  assert.deepEqual(observedPrevious, [undefined, { attempt: 0, kind: "http", status: 429, retryAfterMs: 23_000 }]);
});
