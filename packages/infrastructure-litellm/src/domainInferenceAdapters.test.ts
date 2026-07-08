import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  createDeclaredDomainInferencePort,
  declaredDomainInferenceDescriptor
} from "./domainInferenceAdapters";
import { readPromptFile, renderPromptFile } from "./promptFile";
import { declaredDomainInferenceSchema, declaredDomainInferenceValidator } from "./toolSchemas";

function adapterReturning(canned: { declaredDomain: string }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return declaredDomainInferenceValidator.parse(canned);
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createDeclaredDomainInferencePort(client), calls };
}

test("declared domain inference validator trims well-formed domain labels", () => {
  assert.deepEqual(declaredDomainInferenceValidator.parse({ declaredDomain: "  Field Study  " }), {
    declaredDomain: "Field Study"
  });
});

test("declared domain inference validator fails closed on malformed tool arguments", () => {
  assert.throws(() => declaredDomainInferenceValidator.parse({ declaredDomain: "" }));
  assert.throws(() => declaredDomainInferenceValidator.parse({ declaredDomain: "   " }));
  assert.throws(() => declaredDomainInferenceValidator.parse({ declaredDomain: 42 }));
  assert.throws(() => declaredDomainInferenceValidator.parse({ declaredDomain: "Field", extra: true }));
});

test("adapter maps validated forced-tool domain output", async () => {
  const { adapter } = adapterReturning({ declaredDomain: "  Learning Science  " });
  assert.deepEqual(await adapter.infer({ topic: "how spaced practice works" }), {
    declaredDomain: "Learning Science"
  });
});

test("adapter uses the domain inference alias and passes topic into the prompt", async () => {
  const { adapter, calls } = adapterReturning({ declaredDomain: "Learning Science" });
  await adapter.infer({ topic: " how spaced practice works " });

  assert.equal(readPromptFile(declaredDomainInferenceDescriptor.promptPath).model, "kg-domain-inference");
  const call = calls[0] as {
    model: string;
    toolName: string;
    toolDescription: string;
    parameters: unknown;
    tags: string[];
    messages: { content: string }[];
  };
  assert.equal(call.model, "kg-domain-inference");
  assert.equal(call.toolName, "submit_declared_domain");
  assert.equal(call.toolDescription, "Submit a concise Declared Domain inferred from one learner topic.");
  assert.deepEqual(call.parameters, declaredDomainInferenceSchema);
  assert.deepEqual(call.tags, [STAGE_TAGS.declaredDomainInference]);
  assert.ok(call.messages.some((message) => message.content.includes("how spaced practice works")));
});

test("domain inference prompt and schema descriptions remain domain-neutral", () => {
  const rendered = renderPromptFile(declaredDomainInferenceDescriptor.promptPath, { topic: "neutral sentinel" });
  const modelFacingText = [
    rendered.messages[0]?.content ?? "",
    JSON.stringify(declaredDomainInferenceSchema)
  ].join("\n").toLowerCase();
  for (const fixtureTerm of ["ownership", "rust", "market", "economics", "instructkg", "meselson", "aira"]) {
    assert.equal(modelFacingText.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});
