import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { createNodeMergeAdjudicationPort } from "./dedupAdapters";
import { resetLiteLlmFetchForTests, setLiteLlmFetchForTests, type LiteLlmFetchInit } from "./liteLlmFetch";

// Deterministic-envelope tests for the merge-adjudication adapter (U2, R3/R12). The
// canned tool call is an INPUT FIXTURE exercising the adapter's deterministic map +
// fail-closed argument validation — never an assertion about which pair SHOULD merge
// (AGENTS rule 11). `fetch` is stubbed so the test never hits a network. maxRetries: 0
// keeps the rejection path from sleeping through the back-off.

afterEach(() => {
  resetLiteLlmFetchForTests();
});

// Reply with one forced tool call carrying `args`, capturing the request body.
function stubToolCall(args: unknown): { read: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  setLiteLlmFetchForTests(async (_url: string, init: LiteLlmFetchInit) => {
    captured = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_node_merge_decision", arguments: JSON.stringify(args) } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  return { read: () => captured };
}

function adapter() {
  const client = new LiteLlmForcedToolClient({ baseUrl: "http://localhost:4000", apiKey: "sk-local", timeoutMs: 5000, maxRetries: 0 });
  return createNodeMergeAdjudicationPort(client);
}

const pair = {
  declaredDomain: "demo",
  a: { label: "Alpha", aliases: ["A"], evidence: ["alpha is defined here"] },
  b: { label: "Alpha (variant)", aliases: [], evidence: ["the alpha variant"] }
};

test("maps a canned merge decision to the typed decision (deterministic map, not a judgment assertion)", async () => {
  stubToolCall({ decision: "merge", rationale: "same concept" });
  const result = await adapter().adjudicate(pair);
  assert.deepEqual(result, { decision: "merge", rationale: "same concept" });
});

test("maps a canned keep_distinct decision likewise", async () => {
  stubToolCall({ decision: "keep_distinct", rationale: "different concepts" });
  const result = await adapter().adjudicate(pair);
  assert.deepEqual(result, { decision: "keep_distinct", rationale: "different concepts" });
});

test("fail-closed: a response missing decision is rejected at the boundary", async () => {
  stubToolCall({ rationale: "no decision field" });
  await assert.rejects(() => adapter().adjudicate(pair));
});

test("fail-closed: an out-of-enum decision is rejected at the boundary", async () => {
  stubToolCall({ decision: "maybe", rationale: "invalid" });
  await assert.rejects(() => adapter().adjudicate(pair));
});

test("requests carry the node-merge-adjudication stage tag and the forced tool", async () => {
  const capture = stubToolCall({ decision: "keep_distinct", rationale: "x" });
  await adapter().adjudicate(pair);
  const body = capture.read();
  assert.deepEqual(body.metadata, { tags: ["node-merge-adjudication"] });
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "submit_node_merge_decision" } });
});
