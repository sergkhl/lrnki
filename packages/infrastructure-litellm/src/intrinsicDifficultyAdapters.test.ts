import assert from "node:assert/strict";
import { test } from "node:test";
import type { DifficultyNodeContext } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  INTRINSIC_DIFFICULTY_JUDGE_MODEL,
  INTRINSIC_DIFFICULTY_SYSTEM_PROMPT,
  LiteLlmIntrinsicDifficultyJudgmentAdapter
} from "./intrinsicDifficultyAdapters";
import { intrinsicDifficultySchema, intrinsicDifficultyValidator } from "./toolSchemas";

const context: DifficultyNodeContext = {
  derivedNodeId: "dn-1",
  canonicalLabel: "Example Concept",
  aliases: ["Example Alias"],
  declaredDomain: "example domain",
  groundingOrigin: "document_anchored",
  definitions: ["A concise definition explains the concept."],
  mentions: ["A mention relates it to neighboring ideas."]
};

function adapterReturning(canned: { neuralScore: number; rationale: string }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: new LiteLlmIntrinsicDifficultyJudgmentAdapter(client, "mock-difficulty-judge"), calls };
}

test("intrinsic difficulty validator accepts well-formed boundary scores", () => {
  assert.deepEqual(intrinsicDifficultyValidator.parse({ neuralScore: 0, rationale: "concrete" }), { neuralScore: 0, rationale: "concrete" });
  assert.deepEqual(intrinsicDifficultyValidator.parse({ neuralScore: 1, rationale: "abstract" }), { neuralScore: 1, rationale: "abstract" });
});

test("intrinsic difficulty validator fails closed on invalid tool arguments", () => {
  assert.throws(() => intrinsicDifficultyValidator.parse({ neuralScore: -0.1, rationale: "r" }));
  assert.throws(() => intrinsicDifficultyValidator.parse({ neuralScore: 1.1, rationale: "r" }));
  assert.throws(() => intrinsicDifficultyValidator.parse({ neuralScore: "0.5", rationale: "r" }));
  assert.throws(() => intrinsicDifficultyValidator.parse({ neuralScore: 0.5 }));
  assert.throws(() => intrinsicDifficultyValidator.parse({ neuralScore: 0.5, rationale: "r", extra: true }));
});

test("adapter maps validated forced-tool output exactly", async () => {
  const { adapter } = adapterReturning({ neuralScore: 0.6, rationale: "moderate abstraction" });
  const result = await adapter.judge(context);
  assert.deepEqual(result, { neuralScore: 0.6, rationale: "moderate abstraction" });
});

test("adapter uses the independent judge alias and passes node evidence into the prompt", async () => {
  const { adapter, calls } = adapterReturning({ neuralScore: 0.4, rationale: "directly explained" });
  await adapter.judge(context);

  assert.equal(new LiteLlmIntrinsicDifficultyJudgmentAdapter({} as LiteLlmForcedToolClient).model, INTRINSIC_DIFFICULTY_JUDGE_MODEL);
  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "mock-difficulty-judge");
  assert.equal(call.toolName, "submit_intrinsic_difficulty");
  assert.ok(call.messages.some((message) => message.content.includes("Example Concept")));
  assert.ok(call.messages.some((message) => message.content.includes("A concise definition explains")));
  assert.ok(call.messages.some((message) => message.content.includes("Grounding origin: document_anchored")));
});

test("rubric prompt and schema descriptions remain domain-neutral", () => {
  const modelFacingText = [
    INTRINSIC_DIFFICULTY_SYSTEM_PROMPT,
    JSON.stringify(intrinsicDifficultySchema)
  ].join("\n").toLowerCase();
  for (const fixtureTerm of ["ownership", "rust", "market", "economics", "instructkg", "meselson", "aira"]) {
    assert.equal(modelFacingText.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});
