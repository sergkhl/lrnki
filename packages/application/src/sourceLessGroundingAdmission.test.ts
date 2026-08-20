import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  DraftBlindClaimEvidence,
  GroundingGenerationPort,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort
} from "@lrnki/ports";
import type { StageBracket } from "./runProgressReporter";
import {
  createSourceLessGroundingAdmission,
  type GroundingAdmissionCandidate,
  type SourceLessGroundingAdmissionPolicy
} from "./sourceLessGroundingAdmission";

const policy: SourceLessGroundingAdmissionPolicy = {
  probe: { sampleCount: 2, probeConcurrency: 1, agreementThreshold: 0.75 },
  groundingDraftAttempts: 2,
  verificationSampleCount: 3,
  verificationDecision: "same_model_replicated_rejection",
  verificationRejectionSampleQuorum: 2,
  groundingClaimProjection: "sentence_and_semicolon",
  judgmentTargetBatchSize: 1,
  candidateConcurrency: 2,
  verificationConcurrency: 2
};

function judgmentPanel(
  judge: ClaimFactualityJudgmentPort["judge"]
): readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort] {
  return [
    { model: "fake-judge-a", judge },
    { model: "fake-judge-b", judge }
  ];
}

function candidate(candidateKey: string, canonicalLabel = candidateKey): GroundingAdmissionCandidate {
  return {
    candidateKey,
    canonicalLabel,
    declaredDomain: "systems science",
    context: { kind: "originating_topic", topic: "Feedback systems" }
  };
}

function bundle(label: string, context: GroundingAdmissionCandidate["context"], attempt = 1): GeneratedGroundingBundle {
  const notApplicable = { disposition: "not_applicable_by_grounding" as const, rationale: "generated" };
  return {
    groundingOrigin: "llm_grounded",
    definitions: [
      { passageType: "definition", text: `${label} definition one, attempt ${attempt}.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable },
      { passageType: "definition", text: `${label} definition two, attempt ${attempt}.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }
    ],
    mentions: [
      { passageType: "mention", text: `${label} mention, attempt ${attempt}.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }
    ],
    groundingAnchorReferences: context.kind === "scaffolded_anchor" ? [context.anchor.reference] : [],
    generatingModel: "fake-generator",
    rationale: `original rationale for ${label}`
  };
}

type HarnessOptions = {
  boundaryLabels?: readonly string[];
  embedding?: NodeEmbeddingPort;
  groundingGeneration?: GroundingGenerationPort;
  questionPlanning?: ClaimVerificationQuestionPlanningPort;
  answering?: ClaimVerificationAnsweringPort;
  factualityJudgments?: readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];
  policy?: SourceLessGroundingAdmissionPolicy;
};

function harness(options: HarnessOptions = {}) {
  const boundaryLabels = new Set(options.boundaryLabels ?? []);
  const probeDrawByLabel = new Map<string, number>();
  const probeCalls: string[] = [];
  const groundingCalls: Array<Parameters<GroundingGenerationPort["generate"]>[0]> = [];
  const planningCalls: Array<Parameters<ClaimVerificationQuestionPlanningPort["plan"]>[0]> = [];
  const answeringCalls: Array<Parameters<ClaimVerificationAnsweringPort["answer"]>[0]> = [];
  const judgmentCalls: Array<Parameters<ClaimFactualityJudgmentPort["judge"]>[0]> = [];
  const generationAttemptByLabel = new Map<string, number>();

  const probe: KnowledgeBoundaryProbePort = {
    model: "fake-probe",
    async probe(input) {
      probeCalls.push(input.conceptLabel);
      const draw = (probeDrawByLabel.get(input.conceptLabel) ?? 0) + 1;
      probeDrawByLabel.set(input.conceptLabel, draw);
      return {
        answer: boundaryLabels.has(input.conceptLabel)
          ? `${input.conceptLabel}:divergent:${draw}`
          : `${input.conceptLabel}:stable`
      };
    }
  };
  const embedding: NodeEmbeddingPort = options.embedding ?? {
    model: "fake-embedding",
    async embed(texts) {
      const unique = [...new Set(texts)];
      const indexByText = new Map(unique.map((text, index) => [text, index] as const));
      return texts.map((text) => {
        const vector = new Array<number>(Math.max(1, unique.length)).fill(0);
        vector[indexByText.get(text)!] = 1;
        return vector;
      });
    }
  };
  const groundingGeneration: GroundingGenerationPort = options.groundingGeneration ?? {
    model: "fake-generator",
    async generate(input) {
      groundingCalls.push(input);
      const attempt = (generationAttemptByLabel.get(input.canonicalLabel) ?? 0) + 1;
      generationAttemptByLabel.set(input.canonicalLabel, attempt);
      return bundle(input.canonicalLabel, input.context, attempt);
    }
  };
  const questionPlanning: ClaimVerificationQuestionPlanningPort = options.questionPlanning ?? {
    model: "fake-planner",
    async plan(input) {
      planningCalls.push(input);
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        question: `What independently establishes ${target.targetKey} for ${input.canonicalLabel}?`
      }));
    }
  };
  const answering: ClaimVerificationAnsweringPort = options.answering ?? {
    model: "fake-answerer",
    async answer(input) {
      answeringCalls.push(input);
      return [...input.questions].reverse().map((question) => ({
        questionKey: question.questionKey,
        answer: `Independent answer to ${question.question}`
      }));
    }
  };
  const rawFactualityJudgments = options.factualityJudgments ?? judgmentPanel(async (input) =>
    input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: "accepted" as const,
      rationale: "established"
    }))
  );
  const factualityJudgments = rawFactualityJudgments.map((judgment) => ({
    model: judgment.model,
    async judge(input: Parameters<ClaimFactualityJudgmentPort["judge"]>[0]) {
      judgmentCalls.push(input);
      return judgment.judge(input);
    }
  })) as [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];

  const admission = createSourceLessGroundingAdmission({
    knowledgeBoundaryProbe: probe,
    embedding,
    groundingGeneration,
    claimVerificationQuestionPlanning: questionPlanning,
    claimVerificationAnswering: answering,
    claimFactualityJudgments: factualityJudgments,
    policy: options.policy ?? policy
  });
  return {
    admission,
    probeCalls,
    groundingCalls,
    planningCalls,
    answeringCalls,
    judgmentCalls,
    generationAttemptByLabel
  };
}

function recordingStage() {
  const events: Array<{ stage: string; total: number | undefined }> = [];
  const stage: StageBracket = async (name, fn, total) => {
    events.push({ stage: name, total });
    return fn();
  };
  return { stage, events };
}

test("invalid policy is rejected during construction before any neural work", () => {
  assert.throws(() => harness({
    policy: { ...policy, probe: { ...policy.probe, sampleCount: 1 } }
  }), /sampleCount must be an integer of at least 2/);
  assert.throws(() => harness({
    policy: { ...policy, verificationSampleCount: 1 }
  }), /verificationSampleCount must be an integer of at least 2/);
  assert.throws(() => harness({
    policy: { ...policy, verificationDecision: "unknown" as SourceLessGroundingAdmissionPolicy["verificationDecision"] }
  }), /unknown verificationDecision/);
  assert.throws(() => harness({
    policy: { ...policy, verificationRejectionSampleQuorum: 1 }
  }), /verificationRejectionSampleQuorum must be an integer from 2 through 3/);
  assert.throws(() => harness({
    policy: { ...policy, verificationRejectionSampleQuorum: 4 }
  }), /verificationRejectionSampleQuorum must be an integer from 2 through 3/);
  assert.throws(() => harness({
    policy: { ...policy, judgmentTargetBatchSize: 2 as 1 }
  }), /judgmentTargetBatchSize must be exactly 1/);
  assert.throws(() => harness({
    policy: { ...policy, groundingClaimProjection: "unknown" as "sentence_and_semicolon" }
  }), /groundingClaimProjection must be sentence_and_semicolon/);
  assert.throws(() => harness({
    factualityJudgments: [{ model: "only-judge", async judge() { return []; } }] as never
  }), /exactly two initial factuality judgment models/);
  assert.throws(() => harness({
    factualityJudgments: [
      { model: "duplicate-judge", async judge() { return []; } },
      { model: "duplicate-judge", async judge() { return []; } }
    ]
  }), /models must be non-empty and distinct/);
});

test("invalid and duplicate candidates fail before opening a stage or calling a dependency", async () => {
  const h = harness();
  const { stage, events } = recordingStage();
  await assert.rejects(() => h.admission.forOperation(stage).admitBatch([
    candidate("same"),
    candidate("same", "Another label")
  ]), /duplicate candidateKey/);
  assert.deepEqual(events, []);
  assert.deepEqual(h.probeCalls, []);

  await assert.rejects(() => h.admission.forOperation(stage).admitBatch([{
    ...candidate("bad"),
    context: { kind: "originating_topic", topic: "   " }
  }]), /non-empty originating topic/);
  assert.deepEqual(events, []);
});

test("an empty batch is inert and opens no stage", async () => {
  const h = harness();
  const { stage, events } = recordingStage();
  assert.deepEqual(await h.admission.forOperation(stage).admitBatch([]), []);
  assert.deepEqual(events, []);
  assert.deepEqual(h.probeCalls, []);
});

test("a measured boundary outcome never reaches Grounding Generation", async () => {
  const h = harness({ boundaryLabels: ["Boundary concept"] });
  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("boundary", "Boundary concept"),
    candidate("core", "Core concept")
  ]);

  assert.equal(outcomes[0].disposition, "held_out");
  assert.equal(outcomes[0].probe.agreementScore, 0);
  assert.deepEqual(h.groundingCalls.map((call) => call.canonicalLabel), ["Core concept"]);
  assert.equal(outcomes[1].disposition, "admitted");
});

test("embedding unavailability propagates and returns no fabricated boundary result", async () => {
  const h = harness({
    embedding: {
      model: "down",
      async embed() { throw new Error("embedding transport down"); }
    }
  });
  let resultWasReturned = false;
  await assert.rejects(async () => {
    await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a")]);
    resultWasReturned = true;
  }, /embedding transport down/);
  assert.equal(resultWasReturned, false);
  assert.deepEqual(h.groundingCalls, []);
});

test("every generated passage becomes a known target and answering receives no target or draft text", async () => {
  const h = harness();
  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);

  assert.equal(outcome.disposition, "admitted");
  assert.deepEqual(h.planningCalls[0].targets.map((target) => target.targetKey), [
    "definition:0:claim:0",
    "definition:1:claim:0",
    "mention:0:claim:0"
  ]);
  assert.deepEqual(h.planningCalls[0].targets.map((target) => target.targetPurpose), [
    "definition",
    "definition",
    "support"
  ]);
  assert.deepEqual(Object.keys(h.answeringCalls[0]).sort(), ["canonicalLabel", "context", "declaredDomain", "questions"]);
  assert.ok(!("targets" in h.answeringCalls[0]));
  assert.ok(!("draft" in h.answeringCalls[0]));
  assert.equal(h.judgmentCalls.length, 12);
  assert.ok(h.judgmentCalls.every((call) => call.targets.length === 1));
  assert.ok(h.judgmentCalls.every((call) =>
    call.verificationAnswers.every((check) => check.targetKey === call.targets[0].targetKey)
  ));
  assert.deepEqual(
    [...new Set(h.judgmentCalls.map((call) => call.targets[0].targetKey))],
    ["definition:0:claim:0", "definition:1:claim:0", "mention:0:claim:0"],
    "every original passage is judged alone with only its own correlated answers"
  );
});

test("sentence and semicolon claims are judged alone while settlement keeps the original passage atomic", async () => {
  const h = harness({
    groundingGeneration: {
      model: "compound-generator",
      async generate(input) {
        const generated = bundle(input.canonicalLabel, input.context);
        return {
          ...generated,
          definitions: [
            { ...generated.definitions[0], text: "First assertion; conflicting equivalent. Final assertion." },
            { ...generated.definitions[1], text: "Independent safe definition." }
          ],
          mentions: []
        };
      }
    },
    factualityJudgments: judgmentPanel(async (input) => input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: target.targetKey === "definition:0:claim:1" ? "rejected" as const : "accepted" as const,
      rationale: target.targetKey === "definition:0:claim:1" ? "contradicted" : "established"
    })))
  });

  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);
  assert.deepEqual(h.planningCalls[0].targets, [
    { targetKey: "definition:0:claim:0", targetPurpose: "definition", text: "First assertion" },
    { targetKey: "definition:0:claim:1", targetPurpose: "support", text: "conflicting equivalent." },
    { targetKey: "definition:0:claim:2", targetPurpose: "support", text: "Final assertion." },
    { targetKey: "definition:1:claim:0", targetPurpose: "definition", text: "Independent safe definition." }
  ]);
  assert.ok(h.judgmentCalls.every((call) => call.targets.length === 1));
  assert.ok(outcome.disposition === "admitted");
  assert.deepEqual(outcome.disposition === "admitted"
    ? outcome.bundle.definitions.map((passage) => passage.text)
    : [], ["Independent safe definition."]);
});

test("a definition passage requires its first claim to define while later factual support stays support", async () => {
  const h = harness({
    groundingGeneration: {
      model: "definition-then-support-generator",
      async generate(input) {
        const generated = bundle(input.canonicalLabel, input.context);
        return {
          ...generated,
          definitions: [{
            ...generated.definitions[0],
            text: `${input.canonicalLabel} is defined by a stable mechanism. It can then produce a useful consequence.`
          }],
          mentions: []
        };
      }
    },
    factualityJudgments: judgmentPanel(async (input) => input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: target.targetPurpose === "definition" && !target.text.includes("defined")
        ? "rejected" as const
        : "accepted" as const,
      rationale: "purpose checked"
    })))
  });

  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);
  assert.deepEqual(h.planningCalls[0].targets.map((target) => target.targetPurpose), ["definition", "support"]);
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.definitions.length === 1);
});

test("unknown or incomplete planned target coverage fails before answering", async () => {
  let answerCalled = false;
  const h = harness({
    questionPlanning: {
      model: "bad-planner",
      async plan() { return [{ targetKey: "unknown", question: "What is true?" }]; }
    },
    answering: {
      model: "answerer",
      async answer() { answerCalled = true; return []; }
    }
  });
  await assert.rejects(
    () => h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a")]),
    /unknown targetKey/
  );
  assert.equal(answerCalled, false);
});

test("answer correlation rejects missing, unknown, or duplicate question keys before judgment", async () => {
  let judgeCalled = false;
  const h = harness({
    answering: {
      model: "bad-answerer",
      async answer(input) {
        return [
          { questionKey: input.questions[0].questionKey, answer: "first" },
          { questionKey: input.questions[0].questionKey, answer: "duplicate" },
          { questionKey: "unknown", answer: "unknown" }
        ];
      }
    },
    factualityJudgments: judgmentPanel(async () => { judgeCalled = true; return []; })
  });
  await assert.rejects(
    () => h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a")]),
    /duplicate questionKey|unknown questionKey/
  );
  assert.equal(judgeCalled, false);
});

test("judgment output cannot introduce text, duplicate targets, or omit a target", async () => {
  const h = harness({
    factualityJudgments: judgmentPanel(async (input) => input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: "accepted" as const,
      rationale: "accepted",
      text: "verifier-authored replacement"
    })) as never)
  });
  await assert.rejects(
    () => h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a")]),
    /malformed claim judgment/
  );
});

test("bundle settlement can only drop rejected original passages in original order", async () => {
  const h = harness({
    factualityJudgments: judgmentPanel(async (input) => input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: target.targetKey === "definition:1:claim:0" || target.targetKey === "mention:0:claim:0"
        ? "rejected" as const
        : "accepted" as const,
      rationale: target.targetKey === "definition:1:claim:0" ? "second definition false" : "checked"
    })))
  });
  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);
  assert.equal(outcome.disposition, "admitted");
  if (outcome.disposition !== "admitted") return;
  assert.deepEqual(outcome.bundle.definitions.map((passage) => passage.text), ["Concept A definition one, attempt 1."]);
  assert.deepEqual(outcome.bundle.mentions, []);
  assert.equal(outcome.bundle.rationale, "original rationale for Concept A", "settlement changes no metadata");
});

test("a single rejection outlier receives one bounded disagreement sample but cannot veto without replication", async () => {
  let primaryMentionVerdict = 0;
  const { stage, events } = recordingStage();
  const h = harness({
    factualityJudgments: [
      {
        model: "variable-primary",
        async judge(input) {
          const isMention = input.targets[0].targetKey === "mention:0:claim:0";
          if (isMention) primaryMentionVerdict += 1;
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: isMention && primaryMentionVerdict === 1
              ? "rejected" as const
              : "accepted" as const,
            rationale: isMention && primaryMentionVerdict === 1 ? "one panel verdict found a branch conflation" : "established"
          }));
        }
      },
      {
        model: "accepting-challenger",
        async judge(input) {
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: "accepted" as const,
            rationale: "established"
          }));
        }
      }
    ]
  });
  const [outcome] = await h.admission.forOperation(stage).admitBatch([candidate("a", "Concept A")]);
  assert.equal(outcome.disposition, "admitted");
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.mentions.length === 1);
  assert.equal(primaryMentionVerdict, 3);
  assert.equal(h.judgmentCalls.length, 14);
  assert.equal(h.planningCalls.length, 3);
  assert.deepEqual(h.planningCalls[2].targets.map((target) => target.targetKey), ["mention:0:claim:0"]);
  assert.equal(h.answeringCalls.length, 3);
  assert.equal(new Set(h.answeringCalls.flatMap((call) => call.questions.map((question) => question.questionKey))).size, 7);
  assert.deepEqual(events.filter((event) => event.stage === STAGE_TAGS.groundingVerificationQuestionPlanning), [
    { stage: STAGE_TAGS.groundingVerificationQuestionPlanning, total: 2 },
    { stage: STAGE_TAGS.groundingVerificationQuestionPlanning, total: 1 }
  ]);
  assert.deepEqual(events.filter((event) => event.stage === STAGE_TAGS.groundingFactualityRevision), [
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 12 },
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 2 }
  ]);
});

test("one judgment model repeating its rejection across independent samples vetoes the target", async () => {
  const { stage, events } = recordingStage();
  const h = harness({
    factualityJudgments: [
      {
        model: "rejecting-primary",
        async judge(input) {
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: target.targetKey === "mention:0:claim:0" ? "rejected" as const : "accepted" as const,
            rationale: target.targetKey === "mention:0:claim:0" ? "replicated branch conflation" : "established"
          }));
        }
      },
      {
        model: "accepting-challenger",
        async judge(input) {
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: "accepted" as const,
            rationale: "established"
          }));
        }
      }
    ]
  });
  const [outcome] = await h.admission.forOperation(stage).admitBatch([candidate("a", "Concept A")]);
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.mentions.length === 0);
  assert.equal(h.judgmentCalls.length, 12);
  assert.deepEqual(events.filter((event) => event.stage === STAGE_TAGS.groundingFactualityRevision), [
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 12 }
  ]);
});

test("two rejection votes split across model families do not impersonate replicated evidence", async () => {
  let primaryMentionCalls = 0;
  let challengerMentionCalls = 0;
  const h = harness({
    factualityJudgments: [
      {
        model: "rejecting-primary",
        async judge(input) {
          const isMention = input.targets[0].targetKey === "mention:0:claim:0";
          if (isMention) primaryMentionCalls += 1;
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: isMention && primaryMentionCalls === 1 ? "rejected" as const : "accepted" as const,
            rationale: "primary verdict"
          }));
        }
      },
      {
        model: "accepting-challenger",
        async judge(input) {
          const isMention = input.targets[0].targetKey === "mention:0:claim:0";
          if (isMention) challengerMentionCalls += 1;
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: isMention && challengerMentionCalls === 2 ? "rejected" as const : "accepted" as const,
            rationale: "challenger verdict"
          }));
        }
      }
    ]
  });
  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.mentions.length === 1);
  assert.equal(primaryMentionCalls, 3);
  assert.equal(challengerMentionCalls, 3);
});

test("the bounded disagreement sample can confirm a same-model objection and veto the target", async () => {
  let primaryMentionCalls = 0;
  const h = harness({
    factualityJudgments: [
      {
        model: "variable-primary",
        async judge(input) {
          const isMention = input.targets[0].targetKey === "mention:0:claim:0";
          if (isMention) primaryMentionCalls += 1;
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: isMention && primaryMentionCalls !== 2 ? "rejected" as const : "accepted" as const,
            rationale: isMention && primaryMentionCalls !== 2 ? "replicated after disagreement" : "accepted"
          }));
        }
      },
      {
        model: "accepting-challenger",
        async judge(input) {
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: "accepted" as const,
            rationale: "accepted"
          }));
        }
      }
    ]
  });

  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a", "Concept A")]);
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.mentions.length === 0);
  assert.equal(primaryMentionCalls, 3);
  assert.equal(h.judgmentCalls.length, 14);
  assert.equal(h.planningCalls.length, 3);
});

test("judgment dependency failure rejects the whole batch without returning partial outcomes", async () => {
  let returned = false;
  const h = harness({
    factualityJudgments: [
      {
        model: "rejecting-primary",
        async judge(input) {
          if (input.canonicalLabel === "Concept B") throw new Error("judge unavailable");
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: "accepted" as const,
            rationale: "primary acceptance"
          }));
        }
      },
      {
        model: "accepting-challenger",
        async judge(input) {
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            disposition: "accepted" as const,
            rationale: "challenger acceptance"
          }));
        }
      }
    ]
  });
  await assert.rejects(async () => {
    await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
      candidate("a", "Concept A"),
      candidate("b", "Concept B")
    ]);
    returned = true;
  }, /judge unavailable/);
  assert.equal(returned, false);
});

test("only candidates whose every definition is rejected regenerate with bounded feedback", async () => {
  const generationCalls: string[] = [];
  const feedbackByLabel = new Map<string, Array<string | undefined>>();
  const evidenceByLabel = new Map<string, Array<readonly DraftBlindClaimEvidence[] | undefined>>();
  const attempts = new Map<string, number>();
  const h = harness({
    groundingGeneration: {
      model: "generator",
      async generate(input) {
        generationCalls.push(input.canonicalLabel);
        feedbackByLabel.set(input.canonicalLabel, [
          ...(feedbackByLabel.get(input.canonicalLabel) ?? []),
          input.rejectionFeedback
        ]);
        evidenceByLabel.set(input.canonicalLabel, [
          ...(evidenceByLabel.get(input.canonicalLabel) ?? []),
          input.verificationEvidence
        ]);
        const attempt = (attempts.get(input.canonicalLabel) ?? 0) + 1;
        attempts.set(input.canonicalLabel, attempt);
        return bundle(input.canonicalLabel, input.context, attempt);
      }
    },
    factualityJudgments: judgmentPanel(async (input) => {
      const firstAttemptA = input.canonicalLabel === "Concept A"
        && input.targets[0].text.includes("attempt 1");
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: firstAttemptA && target.targetKey.startsWith("definition:")
          ? "rejected" as const
          : "accepted" as const,
        rationale: firstAttemptA ? "definition contradicted" : "established"
      }));
    })
  });
  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("a", "Concept A"),
    candidate("b", "Concept B")
  ]);

  assert.deepEqual(generationCalls, ["Concept A", "Concept B", "Concept A"]);
  assert.deepEqual(feedbackByLabel.get("Concept A"), [
    undefined,
    "Panel rationales may conflict and are not correction authority. Re-derive one internally consistent account; omit optional disputed detail rather than copying a proposed replacement. definition:0:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. definition contradicted definition:1:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. definition contradicted"
  ]);
  assert.deepEqual(feedbackByLabel.get("Concept B"), [undefined]);
  assert.deepEqual(evidenceByLabel.get("Concept B"), [undefined]);
  const retryEvidence = evidenceByLabel.get("Concept A")?.[1];
  assert.ok(retryEvidence);
  assert.equal(retryEvidence.length, 4, "two draft-blind samples for each rejected Definition Passage");
  assert.ok(retryEvidence.every((entry) => entry.targetKey.startsWith("definition:")));
  assert.deepEqual([...new Set(retryEvidence.map((entry) => entry.sampleIndex))], [0, 1]);
  assert.ok(retryEvidence.every((entry) => entry.answer.startsWith("Independent answer to")));
  assert.ok(retryEvidence.every((entry) => !entry.answer.includes("attempt 1")), "the answer model never sees draft text");
  assert.deepEqual(outcomes.map((outcome) => outcome.candidateKey), ["a", "b"]);
  assert.ok(outcomes[0].disposition === "admitted" && outcomes[0].bundle.definitions[0].text.includes("attempt 2"));
});

test("exhausting Grounding Bundle attempts returns a resolved rejected outcome", async () => {
  const h = harness({
    factualityJudgments: judgmentPanel(async (input) => input.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: target.targetKey.startsWith("definition:") ? "rejected" as const : "accepted" as const,
      rationale: "not established"
    })))
  });
  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([candidate("a")]);
  assert.deepEqual(outcome, {
    candidateKey: "a",
    disposition: "rejected",
    reason: "grounding_verification_exhausted",
    probe: {
      disposition: "core_knowledge",
      agreementScore: 1,
      rationale: "mean pairwise cosine 1.0000 over 2 draws >= threshold 0.75"
    },
    rationale: "Panel rationales may conflict and are not correction authority. Re-derive one internally consistent account; omit optional disputed detail rather than copying a proposed replacement. definition:0:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. not established definition:1:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. not established"
  });
});

test("a thrown required dependency rejects the whole batch without returning a partial array", async () => {
  let returned = false;
  const h = harness({
    groundingGeneration: {
      model: "throwing-generator",
      async generate(input) {
        if (input.canonicalLabel === "Concept B") throw new Error("generator unavailable");
        return bundle(input.canonicalLabel, input.context);
      }
    }
  });
  await assert.rejects(async () => {
    await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
      candidate("a", "Concept A"),
      candidate("b", "Concept B")
    ]);
    returned = true;
  }, /generator unavailable/);
  assert.equal(returned, false);
  assert.deepEqual(h.planningCalls, [], "no later verification wave starts from a partial generation result");
});

test("dependency completion order cannot perturb outcome order", async () => {
  const h = harness({
    groundingGeneration: {
      model: "out-of-order-generator",
      async generate(input) {
        if (input.canonicalLabel === "Slow") await new Promise((resolve) => setTimeout(resolve, 15));
        return bundle(input.canonicalLabel, input.context);
      }
    }
  });
  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("slow", "Slow"),
    candidate("fast", "Fast")
  ]);
  assert.deepEqual(outcomes.map((outcome) => outcome.candidateKey), ["slow", "fast"]);
});

test("stage waves and totals exactly follow initial and selective-retry batch sizes", async () => {
  const { stage, events } = recordingStage();
  const h = harness({
    factualityJudgments: judgmentPanel(async (input) => {
      const reject = input.canonicalLabel === "Concept A"
        && input.targets[0].text.includes("attempt 1");
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: reject && target.targetKey.startsWith("definition:") ? "rejected" as const : "accepted" as const,
        rationale: reject ? "retry" : "ok"
      }));
    })
  });
  await h.admission.forOperation(stage).admitBatch([
    candidate("a", "Concept A"),
    candidate("b", "Concept B")
  ]);

  assert.deepEqual(events, [
    { stage: STAGE_TAGS.knowledgeBoundaryProbe, total: 2 },
    { stage: STAGE_TAGS.groundingGeneration, total: 2 },
    { stage: STAGE_TAGS.groundingVerificationQuestionPlanning, total: 4 },
    { stage: STAGE_TAGS.groundingVerificationAnswering, total: 4 },
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 24 },
    { stage: STAGE_TAGS.groundingGeneration, total: 1 },
    { stage: STAGE_TAGS.groundingVerificationQuestionPlanning, total: 2 },
    { stage: STAGE_TAGS.groundingVerificationAnswering, total: 2 },
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 12 }
  ]);
});

test("the closed scaffolded-anchor context is preserved and mechanically attributed in the bundle", async () => {
  const h = harness();
  const anchored: GroundingAdmissionCandidate = {
    candidateKey: "anchored",
    canonicalLabel: "State transition",
    declaredDomain: "computer science",
    context: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "anchor-1",
        canonicalLabel: "Finite-state machine",
        definitionPassages: ["A finite-state machine transitions between a finite set of states."]
      }
    }
  };
  const [outcome] = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([anchored]);
  assert.equal(outcome.disposition, "admitted");
  assert.ok(outcome.disposition === "admitted" && outcome.bundle.groundingAnchorReferences[0] === "anchor-1");
  assert.deepEqual(h.groundingCalls[0].context, anchored.context);
});
