import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { ForcedToolExhaustionError, LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

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

// --- ADR-0006 fail-closed exhaustion, made inspectable -----------------------
// Reply with a fixed forced-tool arguments payload (string body) so a deviation repeats.
function replyWithArguments(argumentsText: string): void {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: argumentsText } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as unknown as typeof fetch;
}

test("exhausted schema-invalid args throw a fail-closed error carrying redacted detail", async () => {
  // `ok` must be a boolean; sending a string violates the strict validator every attempt.
  replyWithArguments(JSON.stringify({ ok: "not-a-boolean" }));
  await assert.rejects(
    () => client().call({ ...baseInput, maxRetries: 1 }),
    (error: unknown) => {
      assert.ok(error instanceof ForcedToolExhaustionError, "fail closed with the typed exhaustion error");
      const detail = error.stageErrorDetail;
      assert.equal(detail.kind, "forced_tool_exhaustion");
      assert.equal(detail.toolName, "submit_thing");
      assert.equal(detail.attempts?.length, 2, "first call + one re-prompt, both recorded");
      const last = detail.attempts!.at(-1)!;
      assert.equal(last.kind, "schema_invalid");
      assert.deepEqual(last.schemaIssuePaths, ["ok"], "violated PATH only, no values");
      assert.ok(last.redactedSnippet && last.redactedSnippet.length > 0, "a bounded snippet is captured");
      return true;
    }
  );
});

test("an HTTP failure records kind:http with the status, still fails closed", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(
    () => client().call({ ...baseInput, maxRetries: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof ForcedToolExhaustionError);
      const attempt = error.stageErrorDetail.attempts![0];
      assert.equal(attempt.kind, "http");
      assert.equal(attempt.status, 503);
      assert.equal(attempt.redactedSnippet, undefined, "no arguments to snippet on a transport failure");
      return true;
    }
  );
});

test("invalid JSON arguments are classified and the redacted snippet is bounded", async () => {
  replyWithArguments(`{"ok": ${"x".repeat(2000)}`); // truncated/invalid JSON, oversized
  await assert.rejects(
    () => client().call({ ...baseInput, maxRetries: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof ForcedToolExhaustionError);
      const attempt = error.stageErrorDetail.attempts![0];
      assert.equal(attempt.kind, "invalid_json");
      assert.ok(attempt.redactedSnippet!.endsWith("…[truncated]"), "oversized snippet is truncated");
      assert.ok(attempt.redactedSnippet!.length <= 520, "snippet stays bounded");
      return true;
    }
  );
});
