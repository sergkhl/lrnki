import assert from "node:assert/strict";
import { test } from "node:test";
import { createLearnerApp } from "./app";
import type { DatabaseClient } from "./db";
import { FixedWindowRateLimiter } from "./auth";

// DB-free surface tests through Hono's fetch-native `app.request` (KTD6): validation,
// auth, and throttle behavior never reach the pool, so the stub client is never invoked.
const stubSql = new Proxy(() => {}, {
  apply() {
    throw new Error("unexpected database access");
  }
}) as unknown as DatabaseClient;

test("health responds without auth", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("authenticated routes refuse a missing bearer token", async () => {
  const app = createLearnerApp(stubSql);
  for (const path of ["/journal", "/leaderboard", "/duel-setup", "/me"]) {
    const res = await app.request(path);
    assert.equal(res.status, 401, path);
  }
  const write = await app.request("/expedition/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Tides" })
  });
  assert.equal(write.status, 401);
});

test("session route validates its body", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "1234" })
  });
  assert.equal(res.status, 400);
});

test("session route rejects a blank name without touching the store", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ learnerStateRef: "   ", pin: "1234" })
  });
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: "invalid_name" });
});

test("session route rate-limits a PIN sweep from one client", async () => {
  const app = createLearnerApp(stubSql);
  let last = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const res = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ learnerStateRef: " ", pin: String(1000 + attempt) })
    });
    last = res.status;
  }
  assert.equal(last, 429);
});

test("fixed window resets after the window elapses", () => {
  let at = 0;
  const limiter = new FixedWindowRateLimiter(2, 1000, () => at);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), false);
  at = 1001;
  assert.equal(limiter.allow("k"), true);
});
