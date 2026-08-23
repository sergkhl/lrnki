import assert from "node:assert/strict";
import { test } from "node:test";
import type { DifficultyNodeContext } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  createIntrinsicDifficultyJudgmentPort,
  intrinsicDifficultyModelFacingText
} from "./intrinsicDifficultyAdapters";
import {
  buildDifficultyBandsSchema,
  buildDifficultyBandsValidator,
  difficultyComparisonSchema,
  difficultyComparisonValidator
} from "./toolSchemas";

function context(label: string): DifficultyNodeContext {
  return {
    derivedNodeId: `dn-${label}`,
    canonicalLabel: label,
    aliases: label === "Example Concept" ? ["Example Alias"] : [],
    declaredDomain: "example domain",
    groundingOrigin: "document_anchored",
    definitions: [`A concise definition explains ${label}.`],
    mentions: [`A mention relates ${label} to neighboring ideas.`]
  };
}

function adapterReturning(canned: unknown) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createIntrinsicDifficultyJudgmentPort(client), calls };
}

test("difficulty bands validator accepts exact coverage with in-range bands", () => {
  const parsed = buildDifficultyBandsValidator(2).parse({
    bands: [
      { conceptNumber: 2, band: 5, rationale: "dense" },
      { conceptNumber: 1, band: 1, rationale: "concrete" }
    ]
  });
  assert.equal(parsed.bands.length, 2);
});

test("difficulty bands validator fails closed on missing, duplicate, and out-of-range numbers", () => {
  // Missing a listed number (length mismatch).
  assert.throws(() => buildDifficultyBandsValidator(3).parse({
    bands: [
      { conceptNumber: 1, band: 2, rationale: "r" },
      { conceptNumber: 2, band: 3, rationale: "r" }
    ]
  }));
  // Duplicate number at the right length (a listed number left unbanded).
  assert.throws(() => buildDifficultyBandsValidator(2).parse({
    bands: [
      { conceptNumber: 1, band: 2, rationale: "r" },
      { conceptNumber: 1, band: 3, rationale: "r" }
    ]
  }), /banded more than once/);
  // Number outside the listed set.
  assert.throws(() => buildDifficultyBandsValidator(2).parse({
    bands: [
      { conceptNumber: 1, band: 2, rationale: "r" },
      { conceptNumber: 3, band: 3, rationale: "r" }
    ]
  }));
  // Band outside 1..5 and non-integers.
  assert.throws(() => buildDifficultyBandsValidator(1).parse({ bands: [{ conceptNumber: 1, band: 0, rationale: "r" }] }));
  assert.throws(() => buildDifficultyBandsValidator(1).parse({ bands: [{ conceptNumber: 1, band: 6, rationale: "r" }] }));
  assert.throws(() => buildDifficultyBandsValidator(1).parse({ bands: [{ conceptNumber: 1, band: 2.5, rationale: "r" }] }));
  assert.throws(() => buildDifficultyBandsValidator(1).parse({ bands: [{ conceptNumber: 1, band: 2, rationale: "" }] }));
});

test("difficulty comparison validator fails closed on malformed arguments", () => {
  assert.deepEqual(difficultyComparisonValidator.parse({ harder: "first", rationale: "denser" }), { harder: "first", rationale: "denser" });
  assert.throws(() => difficultyComparisonValidator.parse({ harder: "neither", rationale: "r" }));
  assert.throws(() => difficultyComparisonValidator.parse({ harder: "first" }));
  assert.throws(() => difficultyComparisonValidator.parse({ harder: "first", rationale: "r", extra: true }));
});

test("bandDomainSet renders the numbered menu, bounds the call, and returns number-cited entries", async () => {
  const { adapter, calls } = adapterReturning({
    bands: [
      { conceptNumber: 1, band: 2, rationale: "directly explained" },
      { conceptNumber: 2, band: 4, rationale: "integrates several ideas" }
    ]
  });
  const entries = await adapter.bandDomainSet({
    declaredDomain: "example domain",
    nodes: [context("Example Concept"), context("Second Concept")]
  });

  assert.deepEqual(entries, [
    { conceptNumber: 1, band: 2, rationale: "directly explained" },
    { conceptNumber: 2, band: 4, rationale: "integrates several ideas" }
  ]);
  const call = calls[0] as { model: string; toolName: string; maxRetries: number; messages: { content: string }[] };
  assert.equal(call.model, "kg-generated-node-judge");
  assert.equal(call.toolName, "submit_difficulty_bands");
  assert.equal(call.maxRetries, 2);
  assert.ok(call.messages.some((message) => message.content.includes("Concept 1: \"Example Concept\"")));
  assert.ok(call.messages.some((message) => message.content.includes("Concept 2: \"Second Concept\"")));
  assert.ok(call.messages.some((message) => message.content.includes("A concise definition explains Example Concept.")));
});

test("compareHarder presents both concepts symmetrically and returns only the direction", async () => {
  const { adapter, calls } = adapterReturning({ harder: "second", rationale: "heavier background load" });
  const result = await adapter.compareHarder({
    declaredDomain: "example domain",
    first: context("Example Concept"),
    second: context("Second Concept")
  });

  assert.deepEqual(result, { harder: "second" });
  const call = calls[0] as { toolName: string; messages: { content: string }[] };
  assert.equal(call.toolName, "submit_difficulty_comparison");
  assert.ok(call.messages.some((message) => message.content.includes("First concept: \"Example Concept\"")));
  assert.ok(call.messages.some((message) => message.content.includes("Second concept: \"Second Concept\"")));
});

test("adapter defaults to the operation-neutral generated-node judge alias", () => {
  assert.equal(createIntrinsicDifficultyJudgmentPort({} as LiteLlmForcedToolClient).model, "kg-generated-node-judge");
});

test("rubric prompts and schema descriptions remain domain-neutral", () => {
  const modelFacingText = [
    intrinsicDifficultyModelFacingText(),
    JSON.stringify(buildDifficultyBandsSchema(3)),
    JSON.stringify(difficultyComparisonSchema)
  ].join("\n").toLowerCase();
  for (const fixtureTerm of ["ownership", "rust", "market", "economics", "instructkg", "meselson", "aira", "compositional"]) {
    assert.equal(modelFacingText.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});
