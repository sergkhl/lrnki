import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  executeForcedToolStage,
  stageConfigHash,
  withModelOverride,
  type NeuralStageDescriptor
} from "./forcedToolStage";
import { renderPromptFile } from "./promptFile";
import { buildPrerequisiteOrderingSchema, buildPrerequisiteOrderingValidator } from "./toolSchemas";

type PilotInput = { declaredDomain: string; nodes: Array<{ canonicalLabel: string; aliases: string[]; definitions: string[]; mentions: string[]; assertions: Array<{ type: string; detail: string }> }> };
type OrderingArgs = { edges: Array<{ prerequisiteNumber: number; dependentNumber: number; confidence: number; rationale: string }> };

const pilotDescriptor: NeuralStageDescriptor<PilotInput, OrderingArgs, OrderingArgs> = {
  promptPath: "prerequisite-ordering.prompt",
  stageTag: STAGE_TAGS.prerequisiteOrdering,
  schema: (input) => buildPrerequisiteOrderingSchema(input.nodes.length),
  validator: (input) => buildPrerequisiteOrderingValidator(input.nodes.length),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    nodes: [
      { canonicalLabel: "Sentinel A", aliases: [], definitions: ["A definition"], mentions: [], assertions: [] },
      { canonicalLabel: "Sentinel B", aliases: [], definitions: [], mentions: ["B mention"], assertions: [] }
    ]
  },
  maxRetries: 1,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    concepts: input.nodes.map((node, index) => ({
      ...node,
      role: `Concept ${index + 1}`,
      aliasesSuffix: node.aliases.length ? ` (aka ${node.aliases.map((alias) => `"${alias}"`).join(", ")})` : "",
      definitionLines: node.definitions.length
        ? node.definitions.map((quote, quoteIndex) => `    [${quoteIndex + 1}] "${quote}"`).join("\n")
        : "    (none)",
      mentionLines: node.mentions.length
        ? node.mentions.map((quote, quoteIndex) => `    [${quoteIndex + 1}] "${quote}"`).join("\n")
        : "    (none)",
      assertionBlock: ""
    }))
  }),
  mapResult: (args) => args
};

test("renders prompt files into system and user messages", () => {
  const rendered = renderPromptFile("prerequisite-ordering.prompt", pilotDescriptor.templateData(pilotDescriptor.sentinelInput));
  assert.equal(rendered.model, "kg-prerequisite-ordering");
  assert.equal(rendered.toolName, "submit_prerequisite_ordering");
  assert.equal(rendered.messages.length, 2);
  assert.match(rendered.messages[0].content, /You order a set of domain concepts/);
  assert.match(rendered.messages[1].content, /Declared domain: sentinel domain\./);
  assert.match(rendered.messages[1].content, /Concept 1: "Sentinel A"\./);
  assert.match(rendered.messages[1].content, /Definitions:\n    \[1\] "A definition"/);
});

test("generic executor renders, builds schema from input, passes tags and maps result", async () => {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return { edges: [{ prerequisiteNumber: 1, dependentNumber: 2, confidence: 0.7, rationale: "r" }] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const result = await executeForcedToolStage(client, pilotDescriptor, pilotDescriptor.sentinelInput);
  assert.equal(result.edges[0]?.dependentNumber, 2);
  const call = calls[0] as { model: string; toolName: string; tags: string[]; maxRetries: number; parameters: { properties?: unknown } };
  assert.equal(call.model, "kg-prerequisite-ordering");
  assert.equal(call.toolName, "submit_prerequisite_ordering");
  assert.deepEqual(call.tags, [STAGE_TAGS.prerequisiteOrdering]);
  assert.equal(call.maxRetries, 1);
  assert.ok(call.parameters.properties);
});

test("one descriptor override changes execution and hash without mutating the base descriptor", async () => {
  const calls: Array<{ model: string }> = [];
  const client = {
    async call(input: { model: string }) {
      calls.push(input);
      return { edges: [] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const overridden = withModelOverride(pilotDescriptor, "kg-topic-expedition-prerequisite-ordering");

  await executeForcedToolStage(client, overridden, pilotDescriptor.sentinelInput);

  assert.equal(pilotDescriptor.modelOverride, undefined);
  assert.equal(overridden.modelOverride, "kg-topic-expedition-prerequisite-ordering");
  assert.equal(calls[0]?.model, "kg-topic-expedition-prerequisite-ordering");
  assert.notEqual(stageConfigHash(overridden), stageConfigHash(pilotDescriptor));
});

test("stage config hash includes prompt bytes, schema, and scalar descriptor identity", () => {
  const hash = stageConfigHash(pilotDescriptor);
  assert.match(hash, /^[a-f0-9]{64}$/);
  const changedStageHash = stageConfigHash({ ...pilotDescriptor, stageTag: STAGE_TAGS.intrinsicDifficulty });
  assert.notEqual(hash, changedStageHash);
});
