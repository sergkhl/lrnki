import assert from "node:assert/strict";
import test from "node:test";
import { createLiteLlmDispatcher } from "./liteLlmFetch";

test("equal timeouts share one module-scoped dispatcher; distinct timeouts do not", () => {
  const a = createLiteLlmDispatcher(5000);
  const b = createLiteLlmDispatcher(5000);
  const c = createLiteLlmDispatcher(6000);
  assert.equal(a, b);
  assert.notEqual(a, c);
});
