import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmAnswerGradingJudgeAdapter } from "./answerGradingAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { answerGradingValidator } from "./toolSchemas";

test("passes question, answer-key, and learner answer into the forced-tool prompt", async () => {
  const calls: { model: string; toolName: string; messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { model: string; toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      return { outcome: "partial", score: 0.5, rationale: "incomplete" };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmAnswerGradingJudgeAdapter(client, "kg-independent-judge");

  const result = await adapter.grade({ declaredDomain: "software engineering", question: "What is X?", answerKey: "X is a thing.", submittedAnswer: "X is kind of a thing" });

  assert.equal(result.outcome, "partial");
  assert.equal(result.score, 0.5);
  assert.equal(calls[0].model, "kg-independent-judge");
  assert.equal(calls[0].toolName, "submit_answer_grade");
  assert.ok(calls[0].messages.some((m) => m.content.includes("X is a thing.")));
  assert.ok(calls[0].messages.some((m) => m.content.includes("X is kind of a thing")));
});

test("validator rejects an out-of-enum outcome (fail-closed)", () => {
  assert.throws(() => answerGradingValidator.parse({ outcome: "mostly-right", score: 0.7, rationale: "x" }));
});

test("validator rejects a score outside [0,1] (fail-closed)", () => {
  assert.throws(() => answerGradingValidator.parse({ outcome: "correct", score: 1.5, rationale: "x" }));
  assert.throws(() => answerGradingValidator.parse({ outcome: "incorrect", score: -0.2, rationale: "x" }));
});
