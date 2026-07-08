import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { createNeuralClients } from "./neuralClients";
import { resetLiteLlmFetchForTests, setLiteLlmFetchForTests, type LiteLlmFetchInit } from "./liteLlmFetch";

// Pins the shared client-construction policy through the request body (same
// deterministic-envelope idiom as LiteLlmForcedToolClient.test.ts): the sampling
// decisions are measured and load-bearing, so a drift in any client's knobs must
// fail here, not silently diverge between composition roots.

const validator = z.object({ ok: z.boolean() }).strict();
const baseInput = {
  model: "kg-prerequisite-ordering",
  messages: [{ role: "user" as const, content: "hi" }],
  toolName: "submit_thing",
  toolDescription: "Submit the thing.",
  parameters: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
  validator
};

afterEach(() => {
  resetLiteLlmFetchForTests();
});

function captureRequest(): { read: () => { url: string; body: Record<string, unknown> } } {
  let captured = { url: "", body: {} as Record<string, unknown> };
  setLiteLlmFetchForTests(async (url: string, init: LiteLlmFetchInit) => {
    captured = { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
    return new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  return { read: () => captured };
}

test("deterministic client sends temperature 0 and seed 7", async () => {
  const capture = captureRequest();
  await createNeuralClients().deterministicClient.call(baseInput);
  const { body } = capture.read();
  assert.equal(body.temperature, 0);
  assert.equal(body.seed, 7);
});

test("probe client sends moderate temperature 0.7 and NO seed, so K draws disperse", async () => {
  const capture = captureRequest();
  await createNeuralClients().probeClient.call(baseInput);
  const { body } = capture.read();
  assert.equal(body.temperature, 0.7);
  assert.equal("seed" in body, false);
});

test("discovery client stays at default sampling (no temperature, no seed)", async () => {
  const capture = captureRequest();
  await createNeuralClients().discoveryClient.call(baseInput);
  const { body } = capture.read();
  assert.equal("temperature" in body, false);
  assert.equal("seed" in body, false);
});

test("overrides take precedence over env for the base config", async () => {
  const capture = captureRequest();
  await createNeuralClients({ baseUrl: "http://calibration:9999" }).deterministicClient.call(baseInput);
  assert.ok(capture.read().url.startsWith("http://calibration:9999/"));
});
