import assert from "node:assert/strict";
import test from "node:test";

import { commandEnvelopeSchema, learnerCommandSchema } from "./app";

test("the command envelope admits authored keys and decimal state versions", () => {
  const parsed = commandEnvelopeSchema.parse({
    requestId: "request-1",
    expectedStateVersion: "42",
    command: {
      kind: "answer_option_select",
      expeditionKey: "critical-thinking",
      stopKey: "argument-structure",
      activityKey: "identify-conclusion",
      chosenOptionKey: "take-southern-road",
      source: { kind: "trail" }
    }
  });

  assert.equal(parsed.expectedStateVersion, "42");
  assert.equal(parsed.command.kind, "answer_option_select");
});

test("the command envelope refuses learner identity and transport extras", () => {
  const result = commandEnvelopeSchema.safeParse({
    requestId: "request-2",
    expectedStateVersion: "0",
    learnerRef: "another-learner",
    command: {
      kind: "adopt_expedition",
      expeditionKey: "critical-thinking"
    }
  });

  assert.equal(result.success, false);
});

test("Guardian challenge identities are opaque while content identifiers remain authored keys", () => {
  const accepted = learnerCommandSchema.safeParse({
    kind: "resume_guardian",
    expeditionKey: "critical-thinking",
    challengeId: "0f6a04d1-901ba2ce-2f113cca-9b03c202"
  });
  const refused = learnerCommandSchema.safeParse({
    kind: "resume_guardian",
    expeditionKey: "Critical Thinking",
    challengeId: "challenge"
  });

  assert.equal(accepted.success, true);
  assert.equal(refused.success, false);
});

test("matching commands admit qualifier-derived opaque pair identities", () => {
  const accepted = learnerCommandSchema.safeParse({
    kind: "answer_matching",
    expeditionKey: "critical-thinking",
    stopKey: "argument-structure",
    activityKey: "map-argument-parts",
    matches: [
      { leftKey: "0a12cd34ef56ab78", rightKey: "9876fedc5432ba10" }
    ],
    source: { kind: "trail" }
  });

  assert.equal(accepted.success, true);
});
