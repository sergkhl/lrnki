import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGroundingFactualityRevisionPort,
  createGroundingGenerationPort
} from "./groundingGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function adapterReturning(canned: { definitions: { text: string }[]; mentions: { text: string }[]; rationale: string }) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createGroundingGenerationPort(client), calls };
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
  assert.equal(bundle.generatingModel, "kg-claim-extraction");
  assert.deepEqual(bundle.scaffoldedAnchorConceptIds, ["copy"]);
  assert.equal(bundle.definitions[0].groundingOrigin, "llm_grounded");
  assert.equal(bundle.definitions[0].verbatimCheck.disposition, "not_applicable_by_grounding");
  assert.equal(bundle.mentions[0].passageType, "mention");

  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "kg-claim-extraction");
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
  const adapter = createGroundingGenerationPort(client);

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

test("drops an exact-span-grounded false passage and keeps generated provenance", async () => {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return {
        judgments: [
          {
            index: 0,
            factual: false,
            problematicSpan: "Draft definition.",
            rationale: "The passage contains a scope conflation."
          },
          { index: 1, factual: true, problematicSpan: "", rationale: "The passage is accurate." }
        ]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const draft = await adapterReturning({
    definitions: [{ text: "Draft definition." }, { text: "Accurate definition." }],
    mentions: [],
    rationale: "draft"
  }).adapter.generate({
    derivedNodeId: "dn-respiration",
    declaredDomain: "biology",
    nodeLabel: "Respiration contrast",
    scaffoldedAnchors: [],
    topic: "Energy pathways"
  });

  const revised = await createGroundingFactualityRevisionPort(client).revise({
    declaredDomain: "biology",
    topic: "Energy pathways",
    nodeLabel: "Respiration contrast",
    draft,
    independentProbeAnswers: ["Independent characterization one.", "Independent characterization two."]
  });

  assert.equal(revised.derivedNodeId, draft.derivedNodeId);
  assert.equal(revised.generatingModel, "kg-claim-extraction");
  assert.equal(revised.groundingOrigin, "llm_grounded");
  assert.deepEqual(revised.definitions.map((passage) => passage.text), ["Accurate definition."]);
  const call = calls[0] as { model: string; toolName: string; tags: string[]; messages: { content: string }[] };
  assert.equal(call.model, "kg-independent-judge");
  assert.equal(call.toolName, "submit_grounding_factuality_judgments");
  assert.deepEqual(call.tags, ["grounding-factuality-revision"]);
  assert.ok(call.messages.some((message) => message.content.includes("Independent characterization one.")));
  assert.ok(call.messages.some((message) => message.content.includes("Draft definition.")));
});

test("preserves a passage when a false verdict does not quote an exact span", async () => {
  const client = {
    async call() {
      return {
        judgments: [{
          index: 0,
          factual: false,
          problematicSpan: "A paraphrase absent from the draft.",
          rationale: "The verdict is not grounded to the passage text."
        }]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const draft = await adapterReturning({
    definitions: [{ text: "The original definition remains intact." }],
    mentions: [],
    rationale: "draft"
  }).adapter.generate({
    derivedNodeId: "dn-monotonic",
    declaredDomain: "general",
    nodeLabel: "Monotonic review",
    scaffoldedAnchors: []
  });

  const reviewed = await createGroundingFactualityRevisionPort(client).revise({
    declaredDomain: "general",
    topic: "Review behavior",
    nodeLabel: "Monotonic review",
    draft,
    independentProbeAnswers: ["An independent check."]
  });

  assert.deepEqual(reviewed.definitions.map((passage) => passage.text), ["The original definition remains intact."]);
});

test("fails closed when exact-span verdicts reject every definition", async () => {
  const client = {
    async call() {
      return {
        judgments: [{
          index: 0,
          factual: false,
          problematicSpan: "Unsupported definition.",
          rationale: "The only definition is false."
        }]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const draft = await adapterReturning({
    definitions: [{ text: "Unsupported definition." }],
    mentions: [],
    rationale: "draft"
  }).adapter.generate({
    derivedNodeId: "dn-rejected",
    declaredDomain: "general",
    nodeLabel: "Rejected concept",
    scaffoldedAnchors: []
  });

  await assert.rejects(
    () => createGroundingFactualityRevisionPort(client).revise({
      declaredDomain: "general",
      topic: "Review behavior",
      nodeLabel: "Rejected concept",
      draft,
      independentProbeAnswers: ["An independent check."]
    }),
    /rejected every definition/
  );
});
