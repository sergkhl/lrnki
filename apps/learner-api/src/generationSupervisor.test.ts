import assert from "node:assert/strict";
import test from "node:test";
import { GenerationClaimLostError } from "@lrnki/application";
import { createGenerationSupervisor, reportGenerationAttemptError } from "./generationSupervisor";

test("claim loss is reported as an expected warning without an error stack", () => {
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => warnings.push(args);
  console.error = (...args) => errors.push(args);
  try {
    reportGenerationAttemptError("Learner topic", new GenerationClaimLostError("lost"));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  assert.deepEqual(warnings, [["Learner topic generation claim lost; a newer attempt is authoritative."]]);
  assert.deepEqual(errors, []);
});

test("unexpected generation errors retain the original error log", () => {
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  const failure = new Error("model failed");
  try {
    reportGenerationAttemptError("Learner topic", failure);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(errors, [["Learner topic generation attempt failed.", failure]]);
});

// The learner-api crash guard: `start()` drives `runOnce()` through `void`, so ANY rejection
// escaping it is an unhandled rejection that kills the process. A down Postgres surfaces in the
// reap/claim hooks, which run before a unit is ever claimed.
test("a failing reap is reported and the next pass still runs", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalError = console.error;
  const errors: unknown[][] = [];
  process.env.DATABASE_URL = "postgres://unused-by-this-test";
  console.error = (...args) => errors.push(args);

  const refused = new Error("ECONNREFUSED");
  let reaps = 0;
  let claims = 0;
  const supervisor = createGenerationSupervisor<string>({
    intervalMs: 60_000,
    maxConcurrent: 1,
    label: "Learner topic",
    reap: () => {
      reaps += 1;
      return reaps === 1 ? Promise.reject(refused) : Promise.resolve();
    },
    claimNext: () => {
      claims += 1;
      return Promise.resolve(undefined);
    },
    run: () => Promise.resolve()
  });

  try {
    await supervisor.runOnce();
    await supervisor.runOnce();
  } finally {
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }

  assert.deepEqual(errors, [["Learner topic generation attempt failed.", refused]]);
  // The first pass aborted before claiming; the second reaped cleanly and reached the queue,
  // proving the `claiming` latch was released rather than left stuck by the throw.
  assert.equal(reaps, 2);
  assert.equal(claims, 1);
});

// An outage is a state, not an event: the operator gets the two edges, never a per-tick restatement.
test("a database outage logs one paused line and one resumed line, whatever its length", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  const warnings: unknown[][] = [];
  const logs: unknown[][] = [];
  const errors: unknown[][] = [];
  process.env.DATABASE_URL = "postgres://unused-by-this-test";
  console.warn = (...args) => warnings.push(args);
  console.log = (...args) => logs.push(args);
  console.error = (...args) => errors.push(args);

  let reachable = false;
  const supervisor = createGenerationSupervisor<string>({
    intervalMs: 15_000,
    maxConcurrent: 1,
    label: "Learner topic",
    reap: () => {
      if (reachable) return Promise.resolve();
      return Promise.reject(
        new AggregateError(
          [Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" })],
          "ECONNREFUSED"
        )
      );
    },
    claimNext: () => Promise.resolve(undefined),
    run: () => Promise.resolve()
  });

  try {
    // A sustained outage: three consecutive passes fail before Postgres returns.
    await supervisor.runOnce();
    await supervisor.runOnce();
    await supervisor.runOnce();
    reachable = true;
    await supervisor.runOnce();
    await supervisor.runOnce();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }

  assert.deepEqual(warnings, [
    ["Learner topic generation paused: database unreachable (ECONNREFUSED). Retrying every 15s."]
  ]);
  assert.deepEqual(logs, [["Learner topic generation resumed: database reachable."]]);
  // The stack dump this replaced must be gone entirely, not merely shortened.
  assert.deepEqual(errors, []);
});

// A connectivity code must never become a way to hide a real defect.
test("a non-connectivity failure keeps its full report every pass", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalError = console.error;
  const originalWarn = console.warn;
  const errors: unknown[][] = [];
  const warnings: unknown[][] = [];
  process.env.DATABASE_URL = "postgres://unused-by-this-test";
  console.error = (...args) => errors.push(args);
  console.warn = (...args) => warnings.push(args);

  const duplicateKey = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
  const supervisor = createGenerationSupervisor<string>({
    intervalMs: 15_000,
    maxConcurrent: 1,
    label: "Learner scaffold",
    reap: () => Promise.reject(duplicateKey),
    claimNext: () => Promise.resolve(undefined),
    run: () => Promise.resolve()
  });

  try {
    await supervisor.runOnce();
    await supervisor.runOnce();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }

  assert.deepEqual(errors, [
    ["Learner scaffold generation attempt failed.", duplicateKey],
    ["Learner scaffold generation attempt failed.", duplicateKey]
  ]);
  assert.deepEqual(warnings, []);
});
