import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmGroundingGenerationAdapter } from "./groundingGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function adapterReturning(canned: { definitions: { text: string }[]; mentions: { text: string }[]; rationale: string }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: new LiteLlmGroundingGenerationAdapter(client, "mock-grounding"), calls };
}

test("generates an llm-grounded bundle conditioned on scaffolded anchors", async () => {
  const { adapter, calls } = adapterReturning({
    definitions: [{ text: "Stack allocation places short-lived values in stack memory." }],
    mentions: [{ text: "Understanding stack allocation helps explain why Copy values can be duplicated cheaply." }],
    rationale: "Stack allocation scaffolds Copy trait behavior."
  });

  const bundle = await adapter.generate({
    derivedNodeId: "dn-stack-allocation",
    declaredDomain: "software engineering",
    nodeLabel: "Stack allocation",
    scaffoldedAnchors: [{ conceptId: "copy", canonicalLabel: "Copy Trait", definitionQuotes: ["Types such as integers that have a known size at compile time implement Copy."] }]
  });

  assert.equal(bundle.derivedNodeId, "dn-stack-allocation");
  assert.equal(bundle.groundingOrigin, "llm_grounded");
  assert.equal(bundle.generatingModel, "mock-grounding");
  assert.deepEqual(bundle.scaffoldedAnchorConceptIds, ["copy"]);
  assert.equal(bundle.definitions[0].groundingOrigin, "llm_grounded");
  assert.equal(bundle.definitions[0].verbatimCheck.disposition, "not_applicable_by_grounding");
  assert.equal(bundle.mentions[0].passageType, "mention");

  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "mock-grounding");
  assert.equal(call.toolName, "submit_generated_grounding_bundle");
  assert.ok(call.messages.some((message) => message.content.includes("Copy Trait")));
  assert.ok(call.messages.some((message) => message.content.includes("Types such as integers")));
});

test("malformed tool arguments fail closed through the forced-tool validator", async () => {
  const client = {
    async call() {
      throw new Error("Expected at least one definition");
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmGroundingGenerationAdapter(client, "mock-grounding");

  await assert.rejects(
    () => adapter.generate({
      derivedNodeId: "dn",
      declaredDomain: "software engineering",
      nodeLabel: "Stack allocation",
      scaffoldedAnchors: []
    }),
    /definition/
  );
});
