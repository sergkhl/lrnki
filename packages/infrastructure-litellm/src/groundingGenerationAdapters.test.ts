import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  claimFactualityChallengeDescriptor,
  claimFactualityJudgmentDescriptor,
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
  createGroundingGenerationPort
} from "./groundingGenerationAdapters";
import { ForcedToolExhaustionError, LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { resetLiteLlmFetchForTests, setLiteLlmFetchForTests, type LiteLlmFetchInit } from "./liteLlmFetch";
import { MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET } from "./toolSchemas";

afterEach(() => {
  resetLiteLlmFetchForTests();
});

function groundingAdapterReturning(canned: {
  definitions: { text: string }[];
  mentions: { text: string }[];
  rationale: string;
}, modelOverride?: string) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createGroundingGenerationPort(client, modelOverride), calls };
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
    identityContext: {
      aliases: ["Automatic storage duration"],
      peerConcepts: [{ canonicalLabel: "Region allocation", aliases: ["Region-managed allocation"] }]
    },
    context: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "copy",
        canonicalLabel: "Copy Trait",
        definitionPassages: ["Types with a known size can implement Copy."]
      }
    }
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
  assert.ok(call.messages.some((message) => message.content.includes("same identity: \"Automatic storage duration\"")));
  assert.ok(call.messages.some((message) => message.content.includes("nearby but distinct identities")));
  assert.ok(call.messages.some((message) => message.content.includes('"Region allocation" (alternate names "Region-managed allocation")')));
  assert.ok(call.messages.some((message) => message.content.includes("Copy Trait")));
  assert.ok(call.messages.some((message) => message.content.includes("Types with a known size")));
  assert.ok(call.messages.some((message) => message.content.includes("hard limit on every generated claim")));
  assert.ok(call.messages.some((message) => message.content.includes("Make every sentence independently checkable")));
  assert.ok(call.messages.some((message) => message.content.includes("one factual proposition per sentence")));
  assert.ok(call.messages.some((message) => message.content.includes("Definition Passage must stand alone")));
  assert.ok(call.messages.some((message) => message.content.includes("first sentence, including the text before any semicolon")));
  assert.ok(call.messages.some((message) => message.content.includes("criterion that makes something a member of that category")));
  assert.ok(call.messages.some((message) => message.content.includes("including 0, 1, 2, and 3 when meaningful")));
  assert.ok(call.messages.some((message) => message.content.includes("necessary, sufficient, typical")));
  assert.ok(call.messages.some((message) => message.content.includes("state only a cross-system invariant without qualification")));
  assert.ok(call.messages.some((message) => message.content.includes("minimal functional or membership criterion shared by all of them")));
  assert.ok(call.messages.some((message) => message.content.includes("Never turn a common or textbook case into a universal definition")));
  assert.ok(call.messages.some((message) => message.content.includes("component operation from a total outcome")));
  assert.ok(call.messages.some((message) => message.content.includes("absolute or exact language")));
  assert.ok(call.messages.some((message) => message.content.includes("Preserve exact identifier spelling and casing")));
  assert.ok(call.messages.some((message) => message.content.includes("Never write an unqualified broader-category claim")));
  const modelFacing = call.messages.map((message) => message.content).join("\n").toLowerCase();
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval", "topoisomerase", "telomerase", "primase", "origin of replication", "owner variable", "associated type", "rust trait", "heap allocation", "string memory representation", "rust string", "allocating scope", "producer and consumer"]) {
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
    identityContext: { aliases: [], peerConcepts: [] },
    context: { kind: "originating_topic", topic: "Feedback systems" }
  });
  assert.deepEqual(bundle.groundingAnchorReferences, []);
  const call = calls[0] as { messages: { content: string }[] };
  assert.ok(call.messages.some((message) => message.content.includes("Originating topic: \"Feedback systems\"")));
  assert.ok(call.messages.some((message) => message.content.includes("Candidate alternate names: none supplied.")));
  assert.ok(call.messages.some((message) => message.content.includes("Same-context peer concepts: none.")));
});

test("a scoped generation override drives both the provider call and Grounding Bundle provenance", async () => {
  const model = "kg-topic-expedition-generation";
  const { adapter, calls } = groundingAdapterReturning({
    definitions: [{ text: "A feedback loop routes an output signal back into a system input." }],
    mentions: [],
    rationale: "First-class topic concept."
  }, model);

  const bundle = await adapter.generate({
    declaredDomain: "systems science",
    canonicalLabel: "Feedback loop",
    identityContext: { aliases: [], peerConcepts: [] },
    context: { kind: "originating_topic", topic: "Feedback systems" }
  });

  assert.equal(adapter.model, model);
  assert.equal(bundle.generatingModel, model);
  assert.equal((calls[0] as { model: string }).model, model);
});

test("malformed Grounding Generation arguments fail closed through the forced-tool client", async () => {
  const client = {
    async call() { throw new Error("Expected at least one definition"); }
  } as unknown as LiteLlmForcedToolClient;
  await assert.rejects(() => createGroundingGenerationPort(client).generate({
    declaredDomain: "software engineering",
    canonicalLabel: "Stack allocation",
    identityContext: { aliases: [], peerConcepts: [] },
    context: { kind: "originating_topic", topic: "Memory management" }
  }), /definition/);
});

test("planning sees owner-neutral targets while the external answer model receives no target or draft text", async () => {
  const calls: Array<{ model: string; toolName: string; messages: { content: string }[]; parameters: Record<string, unknown> }> = [];
  const client = {
    async call(input: { model: string; toolName: string; messages: { content: string }[]; parameters: Record<string, unknown> }) {
      calls.push(input);
      if (input.toolName === "submit_claim_verification_questions") {
        return {
          questions: [
            { targetKey: "definition:0", question: "What distinguishes the two mechanisms?" },
            { targetKey: "mention:0", question: "What role does the mechanism have in the topic?" }
          ]
        };
      }
      const answerKeys = ((input.parameters.properties as Record<string, unknown>).answers as { required: string[] }).required;
      return {
        answers: Object.fromEntries([...answerKeys].reverse().map((questionKey) => [
          questionKey,
          `Independent answer for ${questionKey}`
        ]))
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
  assert.ok(calls[0].messages.some((message) => message.content.includes("category-boundary, and relation-and-process checks")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("neutrally try to falsify")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("assumes the draft's category, value, or universal scope")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("at most six questions per target")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("nested subtypes or uncommon implementations")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("category's membership criterion")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("inactive, or nonfunctional entities outside the subtype hierarchy")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("actor, object acted on or moved, reference object, direction, path")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("passage through a boundary, rotation around a reference")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("bulk path, initiation, completion, maintenance, repair, and alternative paths")));
  assert.ok(calls[0].messages.some((message) => message.content.includes("member form, constituent or participant role, holder or container")));
  assert.match(questions[0].question, /necessary defining features/);
  assert.match(questions[0].question, /Independent code-owned concept-identity check/);
  assert.match(questions[1].question, /originating topic "A broad topic"/);
  assert.match(questions[1].question, /Independent code-owned context-application check/);
  assert.match(questions[1].question, /commonly attributed consequences that do not actually follow/);
  assert.match(questions[1].question, /mechanism or behavior, required conditions/);
  assert.match(questions[3].question, /Independent code-owned category-boundary check/);
  assert.match(questions[3].question, /defining membership criterion/);
  assert.match(questions[3].question, /member forms, constituents or participant roles, holders or containers, representations, cardinalities/);
  assert.match(questions[3].question, /exhaustive requirements from common examples/);
  assert.match(questions[3].question, /actual member that a familiar narrowed definition would exclude/);
  assert.match(questions[5].question, /Independent code-owned relation-and-process check/);
  assert.match(questions[5].question, /actor, object acted on or moved, reference object, direction, path/);
  assert.match(questions[5].question, /passage, rotation, sliding, transfer, deformation, association, or dissociation/);
  assert.match(questions[5].question, /bulk path from initiation, completion, maintenance, repair, and alternatives/);
  assert.match(questions[5].question, /prominent auxiliary or boundary-case mechanism/);
  assert.deepEqual(questions.map((question) => question.targetKey), [
    "definition:0",
    "definition:0",
    "mention:0",
    "definition:0",
    "mention:0",
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
  assert.ok(calls[1].messages.some((message) => message.content.includes("valid member forms, constituents or participant roles, holders or containers")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("mutually exclusive branches")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("state the cross-system invariant separately from material variations")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("nested subtype is an exception")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("defining membership criterion first")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("not a subtype merely because its name, structure, ancestry")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("Preserve literal relation roles")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("not interchangeable merely because they can contribute to a similar outcome")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("distinguish the bulk path from initiation, completion, maintenance, repair, and alternative paths")));
  assert.ok(calls[1].messages.some((message) => message.content.includes("instead of inventing one")));
  assert.equal(calls[1].messages.some((message) => message.content.includes("Draft-only marker")), false);
  assert.equal(calls[1].messages.some((message) => message.content.includes("definition:0")), false);
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval", "topoisomerase", "telomerase", "primase", "origin of replication", "owner variable", "associated type", "rust trait"]) {
    assert.equal(calls[0].messages.some((message) => message.content.toLowerCase().includes(fixtureTerm)), false, `planner fixture-derived term leaked: ${fixtureTerm}`);
    assert.equal(calls[1].messages.some((message) => message.content.toLowerCase().includes(fixtureTerm)), false, `answerer fixture-derived term leaked: ${fixtureTerm}`);
  }
  assert.deepEqual(
    answers.map((answer) => answer.questionKey),
    questions.map((_, index) => `q:${index}`),
    "the adapter maps exact provider keys back to input order"
  );
});

test("answer correlation uses an exact key object for one, three, and six questions", async (t) => {
  const longKey = "candidate:definition:0:claim:0:verification:2:question:5";
  const keySets = [
    ["q:0"],
    ["q:0", "q:1", "q:2"],
    ["q:0", "q:1", "q:2", "q:3", "q:4", longKey]
  ];

  for (const keys of keySets) {
    await t.test(`${keys.length} key object`, async () => {
      const calls: Array<{ parameters: Record<string, unknown> }> = [];
      const client = {
        async call(input: { parameters: Record<string, unknown> }) {
          calls.push(input);
          return {
            answers: Object.fromEntries([...keys].reverse().map((key) => [key, `Answer for ${key}`]))
          };
        }
      } as unknown as LiteLlmForcedToolClient;
      const result = await createClaimVerificationAnsweringPort(client).answer({
        declaredDomain: "general",
        canonicalLabel: "Correlation sentinel",
        context: { kind: "originating_topic", topic: "Structural verification" },
        questions: keys.map((questionKey) => ({ questionKey, question: `Question for ${questionKey}` }))
      });

      assert.deepEqual(result, keys.map((questionKey) => ({ questionKey, answer: `Answer for ${questionKey}` })));
      const answersSchema = (calls[0]!.parameters.properties as Record<string, unknown>).answers as {
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      };
      assert.deepEqual(Object.keys(answersSchema.properties), keys);
      assert.deepEqual(answersSchema.required, keys);
      assert.equal(answersSchema.additionalProperties, false);
    });
  }
});

test("duplicate input question keys fail before the answer provider call", async () => {
  let calls = 0;
  const client = {
    async call() {
      calls += 1;
      return { answers: {} };
    }
  } as unknown as LiteLlmForcedToolClient;

  await assert.rejects(() => createClaimVerificationAnsweringPort(client).answer({
    declaredDomain: "general",
    canonicalLabel: "Correlation sentinel",
    context: { kind: "originating_topic", topic: "Structural verification" },
    questions: [
      { questionKey: "duplicate:key", question: "First question?" },
      { questionKey: "duplicate:key", question: "Second question?" }
    ]
  }), /duplicate input questionKey/);
  assert.equal(calls, 0);
});

test("the six-key answer contract records malformed and schema-invalid output across all three allowed attempts", async () => {
  const keys = [
    "q:0",
    "q:1",
    "q:2",
    "q:3",
    "q:4",
    "candidate:definition:0:claim:0:verification:2:question:5"
  ];
  const complete = Object.fromEntries(keys.map((key) => [key, `Answer for ${key}`]));
  const argumentAttempts = [
    '{"answers":',
    JSON.stringify({ answers: Object.fromEntries(keys.slice(0, -1).map((key) => [key, `Answer for ${key}`])) }),
    JSON.stringify({ answers: { ...complete, extra: "Unexpected answer" } })
  ];
  const requestBodies: Record<string, unknown>[] = [];
  let attempt = 0;
  setLiteLlmFetchForTests(async (_url: string, init: LiteLlmFetchInit) => {
    requestBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
    const argumentsText = argumentAttempts[Math.min(attempt, argumentAttempts.length - 1)]!;
    attempt += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: {
        name: "submit_claim_verification_answers",
        arguments: argumentsText
      } }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = new LiteLlmForcedToolClient({
    baseUrl: "http://localhost:4000",
    apiKey: "sk-local",
    timeoutMs: 5_000,
    maxRetries: 2
  });

  await assert.rejects(() => createClaimVerificationAnsweringPort(client).answer({
    declaredDomain: "general",
    canonicalLabel: "Correlation sentinel",
    context: { kind: "originating_topic", topic: "Structural verification" },
    questions: keys.map((questionKey) => ({ questionKey, question: `Question for ${questionKey}` }))
  }), (error: unknown) => {
    assert.ok(error instanceof ForcedToolExhaustionError);
    assert.equal(error.toolName, "submit_claim_verification_answers");
    assert.deepEqual(error.attempts.map(({ kind }) => kind), ["invalid_json", "schema_invalid", "schema_invalid"]);
    return true;
  });

  assert.equal(requestBodies.length, 3);
  for (const body of requestBodies.slice(1)) {
    const messages = body.messages as Array<{ role: string; content: string }>;
    assert.equal(messages.at(-1)?.role, "user");
    assert.match(messages.at(-1)?.content ?? "", /satisfies the provided schema/);
  }
});

test("code-owned verification checks preserve the shared six-question cap per target", async () => {
  const targetKeys = ["definition:0", "mention:0"] as const;
  const client = {
    async call() {
      return {
        questions: targetKeys.flatMap((targetKey) => Array.from(
          { length: MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET },
          (_, index) => ({ targetKey, question: `Model-planned ${targetKey} question ${index + 1}` })
        ))
      };
    }
  } as unknown as LiteLlmForcedToolClient;

  const questions = await createClaimVerificationQuestionPlanningPort(client).plan({
    declaredDomain: "general",
    canonicalLabel: "Bounded concept",
    context: { kind: "originating_topic", topic: "Bounded verification" },
    targets: targetKeys.map((targetKey) => ({
      targetKey,
      targetPurpose: targetKey.startsWith("definition:") ? "definition" as const : "support" as const,
      text: `${targetKey} claim`
    }))
  });

  for (const targetKey of targetKeys) {
    assert.equal(
      questions.filter((question) => question.targetKey === targetKey).length,
      MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET
    );
  }
  assert.equal(questions.filter((question) => question.question.startsWith("Model-planned definition:0")).length, 2);
  assert.equal(questions.filter((question) => question.question.startsWith("Model-planned mention:0")).length, 3);
});

test("the factuality adapter returns judgments only and cannot settle or rewrite an artifact", async () => {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return {
        judgments: [
          {
            targetKey: "definition:0",
            strongestLiteralClaim: "One mechanism applies to the whole category.",
            categoryBoundaryAudit: "One actual category member falls outside that mechanism boundary.",
            scopeAudit: "One established subtype uses another mechanism.",
            materialObjection: "The parent-category mechanism does not apply to that subtype.",
            disposition: "rejected",
            rationale: "The definition conflates two mechanisms."
          },
          {
            targetKey: "definition:1",
            strongestLiteralClaim: "The named concept has the stated defining condition.",
            categoryBoundaryAudit: "No established member is excluded by the defining condition.",
            scopeAudit: "No relevant subtype or process variation conflicts with the condition.",
            materialObjection: null,
            disposition: "accepted",
            rationale: "The definition is established."
          }
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
  const challengeCall = calls[1] as { model: string; toolName: string; tags: string[]; messages: { content: string }[] };
  assert.equal(call.model, "kg-claim-factuality-judge");
  assert.equal(challengeCall.model, "kg-claim-factuality-challenger");
  assert.equal(call.toolName, "submit_claim_factuality_judgments");
  assert.equal(challengeCall.toolName, call.toolName);
  assert.deepEqual(call.tags, ["grounding-factuality-revision"]);
  assert.deepEqual(challengeCall.tags, call.tags);
  assert.notEqual(claimFactualityChallengeDescriptor.promptPath, claimFactualityJudgmentDescriptor.promptPath);
  assert.equal(claimFactualityChallengeDescriptor.promptPath, "claim-factuality-challenge.prompt");
  assert.equal(claimFactualityChallengeDescriptor.modelOverride, undefined);
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
  assert.ok(call.messages.some((message) => message.content.includes("Evidence is not a vote")));
  assert.ok(call.messages.some((message) => message.content.includes("material exception, alternate classification, system variation, or narrower scope")));
  assert.ok(call.messages.some((message) => message.content.includes("questions labeled `Independent code-owned`")));
  assert.ok(call.messages.some((message) => message.content.includes("cannot outvote a conflicting independent check")));
  assert.ok(call.messages.some((message) => message.content.includes("textbook, common, approximate, or pedagogically convenient")));
  assert.ok(call.messages.some((message) => message.content.includes("reconstruct the established subtype hierarchy")));
  assert.ok(call.messages.some((message) => message.content.includes("Complete categoryBoundaryAudit independently")));
  assert.ok(call.messages.some((message) => message.content.includes("member form, constituent or participant role, holder or container")));
  assert.ok(call.messages.some((message) => message.content.includes("positive membership condition without saying `only`")));
  assert.ok(call.messages.some((message) => message.content.includes("separate the bulk path from initiation, completion, maintenance, repair, and alternative paths")));
  assert.ok(call.messages.some((message) => message.content.includes("prominent auxiliary mechanism impersonate the whole process")));
  assert.ok(call.messages.some((message) => message.content.includes("Do not turn subtype completeness into a factuality requirement")));
  assert.ok(call.messages.some((message) => message.content.includes("unasserted universal mechanism from silence")));
  assert.ok(call.messages.some((message) => message.content.includes("A definition need not inventory every true property")));
  assert.ok(call.messages.some((message) => message.content.includes("minimum-content check, not an exhaustive-description test")));
  assert.ok(call.messages.some((message) => message.content.includes("even one described elsewhere as essential, canonical, identifying, or necessary")));
  assert.ok(call.messages.some((message) => message.content.includes("Never use “missing an essential activity/property” as materialObjection")));
  assert.ok(call.messages.some((message) => message.content.includes("materially different sibling")));
  assert.ok(call.messages.some((message) => message.content.includes("This does not rescue an explicit narrow substrate")));
  assert.ok(call.messages.some((message) => message.content.includes("unqualified predicate attached to a parent category")));
  assert.ok(call.messages.some((message) => message.content.includes("test it against the parent category's defining membership criterion")));
  assert.ok(call.messages.some((message) => message.content.includes("Keep such non-members outside the subtype audit")));
  assert.ok(call.messages.some((message) => message.content.includes("Compare mechanism relations literally")));
  assert.ok(call.messages.some((message) => message.content.includes("Passage through a boundary is not rotation around a reference")));
  assert.ok(call.messages.some((message) => message.content.includes("Never describe a material variation in scopeAudit and then accept")));
  assert.ok(call.messages.some((message) => message.content.includes("materialObjection must be null only")));
  assert.ok(call.messages.some((message) => message.content.includes("Do not invent a quantifier that the target does not contain")));
  assert.ok(call.messages.some((message) => message.content.includes("does not create global uniqueness by itself")));
  assert.ok(call.messages.some((message) => message.content.includes("Do not invent a spatial, structural, temporal, or representational granularity")));
  assert.ok(call.messages.some((message) => message.content.includes("does not become point-like, discrete, sequence-defined")));
  assert.ok(call.messages.some((message) => message.content.includes("targetPurpose `definition` target must itself state the candidate concept's defining condition or mechanism")));
  assert.ok(call.messages.some((message) => message.content.includes("application code owns settlement")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("adversarial falsifier")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Context congruence")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("selects a different sense from the anchor")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("genuinely cross-context invariant")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Definition adequacy")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Do not invent a quantifier that the target does not contain")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("does not create global uniqueness by itself")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Do not invent a spatial, structural, temporal, or representational granularity")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("does not become point-like, discrete, sequence-defined")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("factually true comparison")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("If your reasoning finds such an objection, the disposition must be `rejected`")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("standard, textbook, typical, commonly taught")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("questions labeled `Independent code-owned`")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("cannot outvote a conflicting independent check")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Reconstruct the relevant subtype hierarchy")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Complete categoryBoundaryAudit separately")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("positive membership condition can exclude a real member without using `only`")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("separate the bulk path from initiation, completion, maintenance, repair, and alternative paths")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("every supplied answer repeats the same textbook simplification")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Do not turn subtype completeness into a factuality requirement")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("unasserted universal mechanism from silence")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("A definition need not inventory every true property")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("minimum-content check, not an exhaustive-description test")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("even one described elsewhere as essential, canonical, identifying, or necessary")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Never use “missing an essential activity/property” as materialObjection")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("materially different sibling")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("This does not rescue an explicit narrow substrate")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("unqualified predicate attached to a parent category")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("test it against the parent category's defining membership criterion")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Keep such non-members outside the subtype audit")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Compare mechanism relations literally")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("A broader outcome or umbrella verb cannot erase")));
  assert.ok(challengeCall.messages.some((message) => message.content.includes("Never describe a material variation in scopeAudit and then accept")));
  const judgmentFacing = call.messages.map((message) => message.content).join("\n").toLowerCase();
  for (const fixtureTerm of ["binary search", "pivot", "linked list", "logarithmic", "half-open interval", "topoisomerase", "telomerase", "primase", "origin of replication", "owner variable", "associated type", "rust trait"]) {
    assert.equal(judgmentFacing.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});
