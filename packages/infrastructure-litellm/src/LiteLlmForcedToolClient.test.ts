import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { ForcedToolExhaustionError, LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { resetLiteLlmFetchForTests, setLiteLlmFetchForTests, type LiteLlmFetchInit } from "./liteLlmFetch";

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

afterEach(() => {
  resetLiteLlmFetchForTests();
});

// Capture the next request body and reply with one valid forced tool call.
function captureBody(): { read: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  setLiteLlmFetchForTests(async (_url: string, init: LiteLlmFetchInit) => {
    captured = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  return { read: () => captured };
}

function captureBodies(responses: Array<Response | Error>): { read: () => Array<{ body: Record<string, unknown>; init: LiteLlmFetchInit }> } {
  const captured: Array<{ body: Record<string, unknown>; init: LiteLlmFetchInit }> = [];
  let i = 0;
  setLiteLlmFetchForTests(async (_url: string, init: LiteLlmFetchInit) => {
    captured.push({ body: JSON.parse(init.body as string) as Record<string, unknown>, init });
    const response = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (response instanceof Error) throw response;
    return response;
  });
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

test("call passes an undici dispatcher so fetch honors the configured transport timeouts", async () => {
  const capture = captureBodies([
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  await client().call(baseInput);
  assert.ok(capture.read()[0]?.init.dispatcher, "dispatcher travels on the fetch request");
});

// --- ADR-0006 fail-closed exhaustion, made inspectable -----------------------
// Reply with a fixed forced-tool arguments payload (string body) so a deviation repeats.
function replyWithArguments(argumentsText: string): void {
  setLiteLlmFetchForTests(async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: argumentsText } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
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
  setLiteLlmFetchForTests(async () => new Response("nope", { status: 503 }));
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

test("a fetch TypeError with an undici cause is classified as a network failure", async () => {
  setLiteLlmFetchForTests(async () => {
    const error = new TypeError("fetch failed");
    Object.defineProperty(error, "cause", { value: { code: "ECONNREFUSED" } });
    throw error;
  });
  await assert.rejects(
    () => client().call({ ...baseInput, maxRetries: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof ForcedToolExhaustionError);
      const attempt = error.stageErrorDetail.attempts![0];
      assert.equal(attempt.kind, "network");
      assert.equal(attempt.code, "ECONNREFUSED");
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

test("schema-invalid retry adds corrective paths and a redacted argument snippet", async () => {
  const capture = captureBodies([
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: "wrong" }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  assert.deepEqual(await client().call({ ...baseInput, maxRetries: 1 }), { ok: true });
  const secondMessages = capture.read()[1]!.body.messages as Array<{ role: string; content: string }>;
  assert.equal(secondMessages.length, 3);
  assert.equal(secondMessages[1]!.role, "assistant");
  assert.match(secondMessages[1]!.content, /Previous tool arguments/);
  assert.match(secondMessages[1]!.content, /"ok":"wrong"/);
  assert.equal(secondMessages[2]!.role, "user");
  assert.match(secondMessages[2]!.content, /Violated schema paths: ok/);
  assert.match(secondMessages[2]!.content, /submit_thing/);
});

test("unknown-tool retry names the observed deviation and requires the exact tool", async () => {
  const capture = captureBodies([
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thong", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  assert.deepEqual(await client().call({ ...baseInput, maxRetries: 1 }), { ok: true });
  const secondMessages = capture.read()[1]!.body.messages as Array<{ role: string; content: string }>;
  assert.equal(secondMessages.length, 3);
  assert.match(secondMessages[1]!.content, /submit_thong/);
  assert.match(secondMessages[2]!.content, /Call exactly submit_thing/);
});

test("missing-arguments retry requires the exact tool with schema-valid arguments", async () => {
  const capture = captureBodies([
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing" } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  assert.deepEqual(await client().call({ ...baseInput, maxRetries: 1 }), { ok: true });
  const secondMessages = capture.read()[1]!.body.messages as Array<{ role: string; content: string }>;
  assert.equal(secondMessages.length, 3);
  assert.match(secondMessages[1]!.content, /submit_thing call omitted its arguments/);
  assert.match(secondMessages[2]!.content, /Call exactly submit_thing with arguments/);
});

test("unknown tool names are bounded in fail-closed attempt evidence", async () => {
  const oversized = `wrong_${"x".repeat(200)}`;
  setLiteLlmFetchForTests(async () => new Response(
    JSON.stringify({ choices: [{ message: { tool_calls: [
      { function: { name: `${oversized}\u0000`, arguments: "{}" } },
      { function: { name: oversized, arguments: "{}" } },
      { function: { name: "\u0000\u001f", arguments: "{}" } }
    ] } }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  ));
  await assert.rejects(
    () => client().call({ ...baseInput, maxRetries: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof ForcedToolExhaustionError);
      const attempt = error.attempts[0]!;
      assert.equal(attempt.kind, "no_tool_call");
      assert.equal(attempt.observedToolNames?.length, 1, "dedupe after sanitizing and bounding");
      assert.equal(attempt.observedToolNames?.[0]?.length, 100);
      assert.doesNotMatch(attempt.observedToolNames?.[0] ?? "", /[\x00-\x1f\x7f]/);
      return true;
    }
  );
});

test("HTTP-failure retry sends a byte-identical request body", async () => {
  const capture = captureBodies([
    new Response("nope", { status: 503 }),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  assert.deepEqual(await client().call({ ...baseInput, maxRetries: 1 }), { ok: true });
  const bodies = capture.read().map((call) => call.body);
  assert.deepEqual(bodies[1], bodies[0]);
});

test("HTTP retry after a model correction preserves the corrected request byte-for-byte", async () => {
  const capture = captureBodies([
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thong", arguments: "{}" } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
    new Response("nope", { status: 503 }),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  assert.deepEqual(await client().call({ ...baseInput, maxRetries: 2 }), { ok: true });
  const bodies = capture.read().map((call) => call.body);
  assert.notDeepEqual(bodies[1], bodies[0], "the model deviation adds one corrective exchange");
  assert.deepEqual(bodies[2], bodies[1], "the following HTTP retry resends that corrected body exactly");
});

test("a headers-timeout failure is terminal: exactly one HTTP call, classified kind:timeout", async () => {
  const capture = captureBodies([Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_HEADERS_TIMEOUT" } })]);
  await assert.rejects(() => client().call(baseInput), (error: unknown) => {
    assert.ok(error instanceof ForcedToolExhaustionError);
    assert.deepEqual(error.attempts.map((a) => a.kind), ["timeout"]);
    assert.equal(error.attempts[0].code, "UND_ERR_HEADERS_TIMEOUT");
    return true;
  });
  assert.equal(capture.read().length, 1);
});

test("an AbortSignal timeout is terminal: exactly one HTTP call", async () => {
  const timeoutError = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const capture = captureBodies([timeoutError]);
  await assert.rejects(() => client().call(baseInput), (error: unknown) => {
    assert.ok(error instanceof ForcedToolExhaustionError);
    assert.deepEqual(error.attempts.map((a) => a.kind), ["timeout"]);
    return true;
  });
  assert.equal(capture.read().length, 1);
});

test("a connection-reset failure stays retryable and succeeds on the next attempt", async () => {
  const capture = captureBodies([
    Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }),
    new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_thing", arguments: JSON.stringify({ ok: true }) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  ]);
  const result = await client().call(baseInput);
  assert.deepEqual(result, { ok: true });
  assert.equal(capture.read().length, 2);
});
