import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LiteLlmEmbeddingClient } from "./LiteLlmEmbeddingClient";

// Deterministic-envelope tests for the embedding transport (U1, R2/R13). They assert
// the SHAPE of the request/response handling — endpoint, order preservation, the
// `metadata.tags` spend label, and fail-closed parsing — never any embedding content
// (AGENTS rule 11). `fetch` is stubbed so the test never hits a network. maxRetries: 0
// keeps the error-path tests from sleeping through the real back-off.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function client() {
  return new LiteLlmEmbeddingClient({ baseUrl: "http://localhost:4000", apiKey: "sk-local", timeoutMs: 5000, maxRetries: 0 });
}

// Reply with the given JSON body + status, capturing the request url + body.
function stubResponse(body: unknown, status = 200): { read: () => { url: string; body: Record<string, unknown> }; calls: () => number } {
  let captured = { url: "", body: {} as Record<string, unknown> };
  let count = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    count += 1;
    captured = { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { read: () => captured, calls: () => count };
}

test("happy path: posts to /v1/embeddings and parses data[].embedding preserving input order", async () => {
  const capture = stubResponse({
    // Deliberately out of order with index fields — the client must restore request order.
    data: [
      { index: 1, embedding: [0.3, 0.4] },
      { index: 0, embedding: [0.1, 0.2] }
    ]
  });
  const vectors = await client().embed({ model: "kg-node-embedding", texts: ["first", "second"] });
  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
  const req = capture.read();
  assert.ok(req.url.endsWith("/v1/embeddings"), "posts to the embeddings endpoint");
  assert.equal(req.body.model, "kg-node-embedding");
  assert.deepEqual(req.body.input, ["first", "second"]);
});

test("edge: empty input returns [] without an HTTP call", async () => {
  const capture = stubResponse({ data: [] });
  const vectors = await client().embed({ model: "kg-node-embedding", texts: [] });
  assert.deepEqual(vectors, []);
  assert.equal(capture.calls(), 0, "no network call for an empty input");
});

test("error path: a missing embedding field fails closed", async () => {
  stubResponse({ data: [{ index: 0 }] });
  await assert.rejects(() => client().embed({ model: "m", texts: ["x"] }), /not a non-empty finite-number vector/);
});

test("error path: non-numeric entries fail closed", async () => {
  stubResponse({ data: [{ index: 0, embedding: [0.1, "nan"] }] });
  await assert.rejects(() => client().embed({ model: "m", texts: ["x"] }), /finite-number vector/);
});

test("error path: a vector-count mismatch fails closed", async () => {
  stubResponse({ data: [{ index: 0, embedding: [0.1] }] });
  await assert.rejects(() => client().embed({ model: "m", texts: ["a", "b"] }), /shape mismatch/);
});

test("error path: inconsistent vector dimensions fail closed", async () => {
  stubResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }, { index: 1, embedding: [0.3] }] });
  await assert.rejects(() => client().embed({ model: "m", texts: ["a", "b"] }), /inconsistent vector dimensions/);
});

test("error path: HTTP non-200 surfaces as an error after the retry budget", async () => {
  stubResponse({ error: "boom" }, 500);
  await assert.rejects(() => client().embed({ model: "m", texts: ["x"] }), /failed with 500/);
});

test("tag: the node-embedding tag travels in metadata.tags", async () => {
  const capture = stubResponse({ data: [{ index: 0, embedding: [0.1] }] });
  await client().embed({ model: "m", texts: ["x"], tags: ["node-embedding"] });
  assert.deepEqual(capture.read().body.metadata, { tags: ["node-embedding"] });
});

test("tag: no tags omits metadata entirely", async () => {
  const capture = stubResponse({ data: [{ index: 0, embedding: [0.1] }] });
  await client().embed({ model: "m", texts: ["x"] });
  assert.ok(!("metadata" in capture.read().body), "no metadata key when no tags travel");
});
