import assert from "node:assert/strict";
import { test } from "node:test";
import { LEARNER_REF_COOKIE } from "@/lib/learnerSession";
import { enterSession, logoutSession, redirectToGate } from "./route";

test("successful session entry sets only the active learner cookie", () => {
  const response = enterSession("Alex");

  assert.equal(response.headers.get("Location"), "/learn");
  assert.equal(response.cookies.get(LEARNER_REF_COOKIE)?.value, "Alex");
});

test("logout clears the active learner cookie", () => {
  const response = logoutSession();

  assert.equal(response.headers.get("Location"), "/learn");
  assert.equal(response.cookies.get(LEARNER_REF_COOKIE)?.value, "");
  assert.equal(response.cookies.get(LEARNER_REF_COOKIE)?.maxAge, 0);
});

test("session refusals redirect without switching learners", () => {
  const response = redirectToGate("wrong_pin", "Alex");

  assert.equal(response.headers.get("Location"), "/learn?error=wrong_pin&ref=Alex");
  assert.equal(response.cookies.get(LEARNER_REF_COOKIE), undefined);
});
