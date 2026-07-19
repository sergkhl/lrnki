import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGroundingFactualityRevisionPort,
  createGroundingGenerationPort,
  createGroundingVerificationAnsweringPort,
  createGroundingVerificationQuestionPlanningPort
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
    scaffoldedAnchors: [{ conceptId: "copy", canonicalLabel: "Copy Trait", definitionQuotes: ["Types such as integers that have a known size at compile time implement Copy."] }],
    rejectionFeedback: "A prior definition contained a scope conflation."
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
  assert.ok(call.messages.some((message) => message.content.includes("prior definition contained a scope conflation")));
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

test("plans claim-targeted questions from the draft, then answers them without draft context", async () => {
  const calls: Array<{ toolName: string; messages: { content: string }[] }> = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      if (input.toolName === "submit_grounding_verification_questions") {
        return {
          questions: [
            { passageIndex: 0, question: "What distinguishes the two mechanisms?" },
            { passageIndex: 1, question: "What role does the mechanism have in the topic?" }
          ]
        };
      }
      return {
        answers: [
          { questionIndex: 2, answer: "It has a specific established role." },
          { questionIndex: 0, answer: "The named concept has distinct necessary features." },
          { questionIndex: 1, answer: "The mechanisms differ in their defining process." }
        ]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const draft = await adapterReturning({
    definitions: [{ text: "Draft-only marker defines the mechanism." }],
    mentions: [{ text: "The mechanism contributes to the topic." }],
    rationale: "draft"
  }).adapter.generate({
    derivedNodeId: "dn-context-isolation",
    declaredDomain: "general",
    nodeLabel: "Mechanism contrast",
    scaffoldedAnchors: [],
    topic: "A broad topic"
  });

  const questions = await createGroundingVerificationQuestionPlanningPort(client).plan({
    declaredDomain: "general",
    topic: "A broad topic",
    nodeLabel: "Mechanism contrast",
    draft
  });
  const answers = await createGroundingVerificationAnsweringPort(client).answer({
    declaredDomain: "general",
    topic: "A broad topic",
    nodeLabel: "Mechanism contrast",
    questions: questions.map((question) => question.question)
  });

  assert.equal(calls[0].toolName, "submit_grounding_verification_questions");
  assert.ok(calls[0].messages.some((message) => message.content.includes("Draft-only marker")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("nearest-alternative check")));
  assert.match(questions[0].question, /necessary defining features/);
  assert.ok(calls[0].messages.some((message) => message.content.includes("accounting convention")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("coordinated subjects")));
  assert.equal(calls[1].toolName, "submit_grounding_verification_answers");
  assert.ok(calls[1].messages.some((message) => message.content.includes("closest commonly confused concepts")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("What distinguishes the two mechanisms?")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("historical bookkeeping")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("each member individually")));
  assert.equal(calls[1].messages.some((message) => message.content.includes("Draft-only marker")), false);
  assert.deepEqual(answers, [
    "The named concept has distinct necessary features.",
    "The mechanisms differ in their defining process.",
    "It has a specific established role."
  ], "answers are restored to question order before the application joins them");
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
    verificationAnswers: [{
      passageIndex: 0,
      question: "What distinguishes the relevant processes?",
      answer: "Independent characterization of the distinction."
    }, {
      passageIndex: 1,
      question: "What is the accurate definition?",
      answer: "Independent characterization of the accurate definition."
    }]
  });

  assert.equal(revised.disposition, "accepted");
  assert.equal(revised.disposition === "accepted" && revised.bundle.derivedNodeId, draft.derivedNodeId);
  assert.equal(revised.disposition === "accepted" && revised.bundle.generatingModel, "kg-claim-extraction");
  assert.equal(revised.disposition === "accepted" && revised.bundle.groundingOrigin, "llm_grounded");
  assert.deepEqual(revised.disposition === "accepted" ? revised.bundle.definitions.map((passage) => passage.text) : [], ["Accurate definition."]);
  const call = calls[0] as { model: string; toolName: string; tags: string[]; messages: { content: string }[] };
  assert.equal(call.model, "kg-independent-judge");
  assert.equal(call.toolName, "submit_grounding_factuality_judgments");
  assert.deepEqual(call.tags, ["grounding-factuality-revision"]);
  assert.ok(call.messages.some((message) => message.content.includes("What distinguishes the relevant processes?")));
  assert.ok(call.messages.some((message) => message.content.includes("Independent characterization of the distinction.")));
  assert.ok(call.messages.some((message) => message.content.includes("Draft definition.")));
  assert.ok(call.messages.some((message) => message.content.includes("different-scope or historical value")));
  assert.ok(call.messages.some((message) => message.content.includes("collective versus distributive scope")));
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
    verificationAnswers: [{ passageIndex: 0, question: "What is the original definition?", answer: "An independent check." }]
  });

  assert.deepEqual(reviewed.disposition === "accepted" ? reviewed.bundle.definitions.map((passage) => passage.text) : [], ["The original definition remains intact."]);
});

test("rejects a whole draft when exact-span verdicts remove every definition", async () => {
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

  const reviewed = await createGroundingFactualityRevisionPort(client).revise({
    declaredDomain: "general",
    topic: "Review behavior",
    nodeLabel: "Rejected concept",
    draft,
    verificationAnswers: [{ passageIndex: 0, question: "Is the definition established?", answer: "An independent check." }]
  });

  assert.equal(reviewed.disposition, "rejected");
  assert.match(reviewed.disposition === "rejected" ? reviewed.rationale : "", /rejected every definition/);
});
