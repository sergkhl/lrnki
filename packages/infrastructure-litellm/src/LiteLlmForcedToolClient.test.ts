import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

// Deterministic-envelope tests for the transport (U1, R2/AE3). They assert the SHAPE
// of the request body — including the `metadata.tags` spend label — never any model
// output content (AGENTS rule 11). `fetch` is stubbed so the test never hits a network.

const validator = z.object({ ok: z.boolean() }).strict();
const baseInput = {
  model: "kg-prerequisite-ordering",
  messages: [{ role: "user" as const, content: "hi" }],
  toolName: "submit_thing",
  toolDescription: "Submit the thing.",
  parameters: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
  validator
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Capture the next request body and reply with one valid forced tool call.
function captureBody(): { read: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as unknown as typeof fetch;
  return { read: () => captured };
}

function client() {
  return new LiteLlmForcedToolClient({ baseUrl: "http://localhost:4000", apiKey: "sk-local", timeoutMs: 5000 });
}

test("call with tags includes metadata.tags in the request body", async () => {
  const capture = captureBody();
  const result = await client().call({ ...baseInput, tags: ["enrichment-judge"] });
  assert.deepEqual(result, { ok: true });
  const body = capture.read();
  assert.deepEqual(body.metadata, { tags: ["enrichment-judge"] });
});

test("call appends the ambient operation tag after the stage tag", async () => {
  const capture = captureBody();
  await runWithOperationTag("op-1", () => client().call({ ...baseInput, tags: ["enrichment-judge"] }));
  assert.deepEqual(capture.read().metadata, { tags: ["enrichment-judge", "op-1"] });
});

test("call with no tags omits metadata entirely (no empty key)", async () => {
  const capture = captureBody();
  await client().call(baseInput);
  const body = capture.read();
  assert.ok(!("metadata" in body), "no metadata key when no tags travel");
});

test("call with an empty tags array omits metadata entirely", async () => {
  const capture = captureBody();
  await client().call({ ...baseInput, tags: [] });
  const body = capture.read();
  assert.ok(!("metadata" in body), "empty tags array must not produce a metadata key");
});

test("tags pass-through does not alter the forced tool_choice or strict contract", async () => {
  const capture = captureBody();
  await client().call({ ...baseInput, tags: ["cep-extraction"] });
  const body = capture.read();
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "submit_thing" } });
  const tools = body.tools as Array<{ function: { strict: boolean } }>;
  assert.equal(tools[0].function.strict, true);
});
