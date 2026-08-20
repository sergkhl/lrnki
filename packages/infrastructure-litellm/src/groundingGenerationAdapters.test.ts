import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimFactualityChallengeDescriptor,
  claimFactualityJudgmentDescriptor,
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
  createGroundingGenerationPort
} from "./groundingGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

function groundingAdapterReturning(canned: {
  definitions: { text: string }[];
  mentions: { text: string }[];
  rationale: string;
}) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createGroundingGenerationPort(client), calls };
}

test("generates an owner-neutral bundle conditioned on one closed scaffolded anchor", async () => {
  const { adapter, calls } = groundingAdapterReturning({
    definitions: [{ text: "Stack allocation places short-lived values in stack memory." }],
    mentions: [{ text: "Understanding stack allocation helps explain inexpensive value copying." }],
    rationale: "Stack allocation scaffolds the anchor behavior."
  });

  const bundle = await adapter.generate({
    declaredDomain: "software engineering",
    canonicalLabel: "Stack allocation",
    context: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "copy",
        canonicalLabel: "Copy Trait",
        definitionPassages: ["Types with a known size can implement Copy."]
      }
    },
    rejectionFeedback: "A prior definition contained a scope conflation."
  });

  assert.equal("derivedNodeId" in bundle, false);
  assert.equal(bundle.groundingOrigin, "llm_grounded");
  assert.equal(bundle.generatingModel, "kg-claim-extraction");
  assert.deepEqual(bundle.groundingAnchorReferences, ["copy"]);
  assert.equal(bundle.definitions[0].verbatimCheck.disposition, "not_applicable_by_grounding");
  assert.equal(bundle.mentions[0].passageType, "mention");

  const call = calls[0] as { model: string; toolName: string; messages: { content: string }[] };
  assert.equal(call.model, "kg-claim-extraction");
  assert.equal(call.toolName, "submit_generated_grounding_bundle");
  assert.ok(call.messages.some((message) => message.content.includes("Candidate concept: \"Stack allocation\"")));
  assert.ok(call.messages.some((message) => message.content.includes("Copy Trait")));
  assert.ok(call.messages.some((message) => message.content.includes("Types with a known size")));
  assert.ok(call.messages.some((message) => message.content.includes("hard limit on every generated claim")));
  assert.ok(call.messages.some((message) => message.content.includes("prior definition contained a scope conflation")));
  assert.ok(call.messages.some((message) => message.content.includes("Make every sentence independently checkable")));
  assert.ok(call.messages.some((message) => message.content.includes("one factual proposition per sentence")));
  assert.ok(call.messages.some((message) => message.content.includes("Definition Passage must stand alone")));
  assert.ok(call.messages.some((message) => message.content.includes("first sentence, including the text before any semicolon")));
  assert.ok(call.messages.some((message) => message.content.includes("criterion that makes something a member of that category")));
  assert.ok(call.messages.some((message) => message.content.includes("including 0, 1, 2, and 3 when meaningful")));
  assert.ok(call.messages.some((message) => message.content.includes("necessary, sufficient, typical")));
  assert.ok(call.messages.some((message) => message.content.includes("component operation from a total outcome")));
  assert.ok(call.messages.some((message) => message.content.includes("absolute or exact language")));
  assert.ok(call.messages.some((message) => message.content.includes("observations, not correction authority")));
  assert.ok(call.messages.some((message) => message.content.includes("Preserve exact identifier spelling and casing")));
  assert.ok(call.messages.some((message) => message.content.includes("Never write an unqualified broader-category claim")));
  assert.ok(call.messages.some((message) => message.content.includes("When feedback says a claim is not universal, narrow it")));
  assert.ok(call.messages.some((message) => message.content.includes("Do not evade a scope objection")));
  const modelFacing = call.messages.map((message) => message.content).join("\n").toLowerCase();
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval"]) {
    assert.equal(modelFacing.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});

test("originating-topic grounding produces no anchor references", async () => {
  const { adapter, calls } = groundingAdapterReturning({
    definitions: [{ text: "A feedback loop routes an output signal back into a system input." }],
    mentions: [],
    rationale: "First-class topic concept."
  });
  const bundle = await adapter.generate({
    declaredDomain: "systems science",
    canonicalLabel: "Feedback loop",
    context: { kind: "originating_topic", topic: "Feedback systems" }
  });
  assert.deepEqual(bundle.groundingAnchorReferences, []);
  const call = calls[0] as { messages: { content: string }[] };
  assert.ok(call.messages.some((message) => message.content.includes("Originating topic: \"Feedback systems\"")));
});

test("malformed Grounding Generation arguments fail closed through the forced-tool client", async () => {
  const client = {
    async call() { throw new Error("Expected at least one definition"); }
  } as unknown as LiteLlmForcedToolClient;
  await assert.rejects(() => createGroundingGenerationPort(client).generate({
    declaredDomain: "software engineering",
    canonicalLabel: "Stack allocation",
    context: { kind: "originating_topic", topic: "Memory management" }
  }), /definition/);
});

test("planning sees owner-neutral targets while the external answer model receives no target or draft text", async () => {
  const calls: Array<{ model: string; toolName: string; messages: { content: string }[] }> = [];
  const client = {
    async call(input: { model: string; toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      if (input.toolName === "submit_claim_verification_questions") {
        return {
          questions: [
            { targetKey: "definition:0", question: "What distinguishes the two mechanisms?" },
            { targetKey: "mention:0", question: "What role does the mechanism have in the topic?" }
          ]
        };
      }
      return {
        answers: [
          { questionKey: "q:2", answer: "It has a specific established role." },
          { questionKey: "q:0", answer: "The named concept has distinct necessary features." },
          { questionKey: "q:1", answer: "The mechanisms differ in their defining process." }
        ]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const context = { kind: "originating_topic" as const, topic: "A broad topic" };
  const targets = [
    { targetKey: "definition:0", targetPurpose: "definition" as const, text: "Draft-only marker defines the mechanism." },
    { targetKey: "mention:0", targetPurpose: "support" as const, text: "The mechanism contributes to the topic." }
  ] as const;

  const questions = await createClaimVerificationQuestionPlanningPort(client).plan({
    declaredDomain: "general",
    canonicalLabel: "Mechanism contrast",
    context,
    targets
  });
  const answers = await createClaimVerificationAnsweringPort(client).answer({
    declaredDomain: "general",
    canonicalLabel: "Mechanism contrast",
    context,
    questions: questions.map((question, index) => ({ questionKey: `q:${index}`, question: question.question }))
  });

  assert.equal(calls[0].toolName, "submit_claim_verification_questions");
  assert.equal(calls[0].model, "kg-claim-verification-planner");
  assert.ok(calls[0].messages.some((message) => message.content.includes("Draft-only marker")));
  assert.ok(calls[0].messages.some((message) => message.content.includes('{"targetKey":"definition:0","targetPurpose":"definition","text":"Draft-only marker defines the mechanism."}')));
  assert.ok(calls[0].messages.some((message) => message.content.includes("code-owned positive claim targets")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("Mask every proposed value, count, outcome, consequence")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("Split coordinated entities")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("type, representation, value, unit, scope")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("exact named or structurally identified anchor subject")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("target text itself carries every material scope limitation")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("boundary cases and counterexamples")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("candidate's established defining conditions or mechanism")));
  assert.match(questions[0].question, /necessary defining features/);
  assert.match(questions[1].question, /originating topic "A broad topic"/);
  assert.match(questions[1].question, /commonly attributed consequences that do not actually follow/);
  assert.match(questions[1].question, /mechanism or behavior, required conditions/);
  assert.deepEqual(questions.map((question) => question.targetKey), [
    "definition:0",
    "definition:0",
    "mention:0",
    "definition:0",
    "mention:0"
  ]);
  assert.equal(calls[1].toolName, "submit_claim_verification_answers");
  assert.equal(calls[1].model, "kg-claim-verification-answerer");
  assert.ok(calls[1].messages.some((message) => message.content.includes("closest commonly confused concepts")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("What distinguishes the two mechanisms?")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("Correct a false premise")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("State what an operation literally returns or stores")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("object, category, enum, wrapper, or tagged result")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("component operation from the overall outcome")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("boundary and counterexample cases")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("state the named concept's defining condition or mechanism")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("multiple established senses")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("mutually exclusive branches")));
  assert.equal(calls[1].messages.some((message) => message.content.includes("Draft-only marker")), false);
  assert.equal(calls[1].messages.some((message) => message.content.includes("definition:0")), false);
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval"]) {
    assert.equal(calls[0].messages.some((message) => message.content.toLowerCase().includes(fixtureTerm)), false, `planner fixture-derived term leaked: ${fixtureTerm}`);
    assert.equal(calls[1].messages.some((message) => message.content.toLowerCase().includes(fixtureTerm)), false, `answerer fixture-derived term leaked: ${fixtureTerm}`);
  }
  assert.deepEqual(answers.map((answer) => answer.questionKey), ["q:2", "q:0", "q:1"], "the adapter preserves opaque model correlation for application validation");
});

test("the factuality adapter returns judgments only and cannot settle or rewrite an artifact", async () => {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return {
        judgments: [
          { targetKey: "definition:0", disposition: "rejected", rationale: "The definition conflates two mechanisms." },
          { targetKey: "definition:1", disposition: "accepted", rationale: "The definition is established." }
        ]
      };
    }
  } as unknown as LiteLlmForcedToolClient;

  const input = {
    declaredDomain: "biology",
    canonicalLabel: "Respiration contrast",
    context: { kind: "originating_topic", topic: "Energy pathways" },
    targets: [
      { targetKey: "definition:0", targetPurpose: "definition", text: "Draft definition." },
      { targetKey: "definition:1", targetPurpose: "definition", text: "Accurate definition." }
    ],
    verificationAnswers: [
      { targetKey: "definition:0", questionKey: "q:0", question: "What distinguishes the relevant processes?", answer: "Independent characterization of the distinction." },
      { targetKey: "definition:1", questionKey: "q:1", question: "What is the accurate definition?", answer: "Independent characterization of the accurate definition." }
    ]
  } as const;
  const judgments = await createClaimFactualityJudgmentPort(client).judge(input);
  const challengerJudgments = await createClaimFactualityChallengePort(client).judge(input);

  assert.deepEqual(judgments, [
    { targetKey: "definition:0", disposition: "rejected", rationale: "The definition conflates two mechanisms." },
    { targetKey: "definition:1", disposition: "accepted", rationale: "The definition is established." }
  ]);
  assert.equal(judgments.some((judgment) => "text" in judgment), false);
  assert.deepEqual(challengerJudgments, judgments);
  const call = calls[0] as { model: string; toolName: string; tags: string[]; messages: { content: string }[] };
  const challengeCall = calls[1] as { model: string; toolName: string; tags: string[] };
  assert.equal(call.model, "kg-claim-factuality-judge");
  assert.equal(challengeCall.model, "kg-claim-factuality-challenger");
  assert.equal(call.toolName, "submit_claim_factuality_judgments");
  assert.equal(challengeCall.toolName, call.toolName);
  assert.deepEqual(call.tags, ["grounding-factuality-revision"]);
  assert.deepEqual(challengeCall.tags, call.tags);
  assert.equal(claimFactualityChallengeDescriptor.promptPath, claimFactualityJudgmentDescriptor.promptPath);
  assert.equal(claimFactualityChallengeDescriptor.modelOverride, "kg-claim-factuality-challenger");
  assert.ok(call.messages.some((message) => message.content.includes("Draft definition.")));
  assert.ok(call.messages.some((message) => message.content.includes('{"targetKey":"definition:0","targetPurpose":"definition","text":"Draft definition."}')));
  assert.ok(call.messages.some((message) => message.content.includes("Independent characterization of the distinction.")));
  assert.ok(call.messages.some((message) => message.content.includes("verification question as contaminated")));
  assert.ok(call.messages.some((message) => message.content.includes("material omission of a necessary qualifier")));
  assert.ok(call.messages.some((message) => message.content.includes("does not silently add missing words to the target")));
  assert.ok(call.messages.some((message) => message.content.includes("do not demand universality from a target that explicitly carries the exact limiting scope")));
  assert.ok(call.messages.some((message) => message.content.includes("different subject, sense, implementation, version")));
  assert.ok(call.messages.some((message) => message.content.includes("Resolve coordinated subjects and predicates distributively")));
  assert.ok(call.messages.some((message) => message.content.includes("component behavior from total outcome")));
  assert.ok(call.messages.some((message) => message.content.includes("boundary and counterexample cases")));
  assert.ok(call.messages.some((message) => message.content.includes("targetPurpose `definition` target must itself state the candidate concept's defining condition or mechanism")));
  assert.ok(call.messages.some((message) => message.content.includes("application code owns settlement")));
  const judgmentFacing = call.messages.map((message) => message.content).join("\n").toLowerCase();
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval"]) {
    assert.equal(judgmentFacing.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});
