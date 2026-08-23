import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
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
  verificationSampleCount: 3,
  verificationDecision: "same_model_replicated_rejection",
  verificationRejectionSampleQuorum: 2,
  groundingClaimProjection: "sentence_and_semicolon",
  judgmentTargetBatchSize: 1,
  candidateConcurrency: 2,
  verificationExecution: {
    questionPlanningConcurrency: 2,
    answeringConcurrency: 2,
    factualityJudgmentConcurrency: 2
  }
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
    aliases: [],
    declaredDomain: "systems science",
    context: { kind: "originating_topic", topic: "Feedback systems" }
  };
}

function bundle(label: string, context: GroundingAdmissionCandidate["context"]): GeneratedGroundingBundle {
  const notApplicable = { disposition: "not_applicable_by_grounding" as const, rationale: "generated" };
  return {
    groundingOrigin: "llm_grounded",
    definitions: [
      { passageType: "definition", text: `${label} definition one.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable },
      { passageType: "definition", text: `${label} definition two.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }
    ],
    mentions: [
      { passageType: "mention", text: `${label} mention.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }
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
      return bundle(input.canonicalLabel, input.context);
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
    judgmentCalls
  };
}

function recordingStage() {
  const events: Array<{ stage: string; total: number | undefined }> = [];
  const active = new Set<string>();
  const overlappedStages = new Set<string>();
  const stage: StageBracket = async (name, fn, total) => {
    events.push({ stage: name, total });
    if (active.has(name)) overlappedStages.add(name);
    active.add(name);
    try {
      return await fn();
    } finally {
      active.delete(name);
    }
  };
  return { stage, events, overlappedStages };
}

function testDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lifecycleStage() {
  type Event =
    | { kind: "opened"; stage: string; total: number | undefined }
    | { kind: "closed"; stage: string; ok: true }
    | { kind: "closed"; stage: string; ok: false; error: unknown };
  const events: Event[] = [];
  const open = new Set<string>();
  const stage: StageBracket = async (name, fn, total) => {
    events.push({ kind: "opened", stage: name, total });
    open.add(name);
    try {
      const result = await fn();
      events.push({ kind: "closed", stage: name, ok: true });
      return result;
    } catch (error) {
      events.push({ kind: "closed", stage: name, ok: false, error });
      throw error;
    } finally {
      open.delete(name);
    }
  };
  return { stage, events, open };
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
  for (const field of [
    "questionPlanningConcurrency",
    "answeringConcurrency",
    "factualityJudgmentConcurrency"
  ] as const) {
    assert.throws(() => harness({
      policy: {
        ...policy,
        verificationExecution: { ...policy.verificationExecution, [field]: 0 }
      }
    }), new RegExp(`verificationExecution\\.${field} must be a positive integer`));
  }
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

  await assert.rejects(() => h.admission.forOperation(stage).admitBatch([{
    ...candidate("bad-alias"),
    aliases: ["   "]
  }]), /non-empty alias/);
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

test("the admission interface derives immutable aliases and same-context peers without scope leakage", async () => {
  const h = harness();
  const candidates: GroundingAdmissionCandidate[] = [
    {
      ...candidate("a", "Concept A"),
      aliases: ["Concept Alpha", "concept-alpha", "Concept A"]
    },
    {
      ...candidate("b", "Concept B"),
      aliases: ["B alternate"]
    },
    {
      ...candidate("b-duplicate", "concept b"),
      aliases: ["b-alternate"]
    },
    {
      ...candidate("other-topic", "Other topic concept"),
      context: { kind: "originating_topic", topic: "Different topic" }
    },
    {
      ...candidate("other-domain", "Other domain concept"),
      declaredDomain: "control engineering"
    }
  ];

  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch(candidates);

  assert.deepEqual(outcomes.map((outcome) => outcome.candidateKey), candidates.map((entry) => entry.candidateKey));
  assert.equal(h.groundingCalls.length, candidates.length, "each core candidate receives exactly one initial draft");
  const input = h.groundingCalls.find((call) => call.canonicalLabel === "Concept A");
  assert.deepEqual(input?.identityContext, {
    aliases: ["Concept Alpha"],
    peerConcepts: [{ canonicalLabel: "Concept B", aliases: ["B alternate"] }]
  });
  assert.equal(Object.isFrozen(input?.identityContext), true);
  assert.equal(Object.isFrozen(input?.identityContext.aliases), true);
  assert.equal(Object.isFrozen(input?.identityContext.peerConcepts), true);
});

test("an all-boundary batch omits conditional grounding and verification brackets", async () => {
  const h = harness({ boundaryLabels: ["Boundary A", "Boundary B"] });
  const { stage, events } = recordingStage();
  const outcomes = await h.admission.forOperation(stage).admitBatch([
    candidate("a", "Boundary A"),
    candidate("b", "Boundary B")
  ]);
  assert.deepEqual(outcomes.map((outcome) => outcome.disposition), ["held_out", "held_out"]);
  assert.deepEqual(events.map((event) => event.stage), [STAGE_TAGS.knowledgeBoundaryProbe]);
  assert.deepEqual(h.groundingCalls, []);
  assert.deepEqual(h.planningCalls, []);
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

test("verification packets flow from planning through answering and judgment without whole-batch barriers", async () => {
  const plannerRelease = testDeferred();
  const answerRelease = testDeferred();
  let planningStarted = 0;
  let planningCompleted = 0;
  let answeringStarted = 0;
  let answeringCompleted = 0;
  let judgmentStarted = 0;
  let answerOverlappedPlanning = false;
  let judgmentOverlappedAnswering = false;
  let everyRoleBracketWasOpen = false;
  const timeline = lifecycleStage();
  const verificationStages: ReadonlySet<string> = new Set([
    STAGE_TAGS.groundingVerificationQuestionPlanning,
    STAGE_TAGS.groundingVerificationAnswering,
    STAGE_TAGS.groundingFactualityRevision
  ]);

  const h = harness({
    questionPlanning: {
      model: "gated-planner",
      async plan(input) {
        const callIndex = planningStarted++;
        try {
          if (callIndex > 0) await plannerRelease.promise;
          return input.targets.map((target) => ({
            targetKey: target.targetKey,
            question: `Independent question for ${target.targetKey}`
          }));
        } finally {
          planningCompleted += 1;
        }
      }
    },
    answering: {
      model: "gated-answerer",
      async answer(input) {
        const callIndex = answeringStarted++;
        if (callIndex === 0) {
          answerOverlappedPlanning = planningCompleted < 4;
          everyRoleBracketWasOpen = [...verificationStages].every((stage) => timeline.open.has(stage));
          plannerRelease.resolve();
        }
        try {
          if (callIndex > 0) await answerRelease.promise;
          return input.questions.map((question) => ({
            questionKey: question.questionKey,
            answer: `Independent answer for ${question.questionKey}`
          }));
        } finally {
          answeringCompleted += 1;
        }
      }
    },
    factualityJudgments: judgmentPanel(async (input) => {
      judgmentStarted += 1;
      if (judgmentStarted === 1) {
        judgmentOverlappedAnswering = answeringCompleted < 4;
        answerRelease.resolve();
      }
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: "accepted" as const,
        rationale: "established"
      }));
    })
  });

  const outcomes = await h.admission.forOperation(timeline.stage).admitBatch([
    candidate("a", "Concept A"),
    candidate("b", "Concept B")
  ]);
  assert.deepEqual(outcomes.map((outcome) => outcome.disposition), ["admitted", "admitted"]);
  assert.equal(answerOverlappedPlanning, true, "an answered packet starts before the final plan resolves");
  assert.equal(judgmentOverlappedAnswering, true, "a judgment starts before the final answer resolves");
  assert.equal(everyRoleBracketWasOpen, true, "all three role brackets open before the first packet is released");
});

test("each verification role honors its own cap and both judge families share one judgment cap", async () => {
  const saturationTracker = (cap: number) => {
    const firstWave = testDeferred();
    let entered = 0;
    let active = 0;
    let peak = 0;
    return {
      async run<T>(work: () => T | Promise<T>): Promise<T> {
        entered += 1;
        active += 1;
        peak = Math.max(peak, active);
        if (entered === cap) firstWave.resolve();
        await firstWave.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        try {
          return await work();
        } finally {
          active -= 1;
        }
      },
      peak: () => peak
    };
  };
  const planner = saturationTracker(2);
  const answerer = saturationTracker(3);
  const judges = saturationTracker(4);
  const capPolicy: SourceLessGroundingAdmissionPolicy = {
    ...policy,
    verificationExecution: {
      questionPlanningConcurrency: 2,
      answeringConcurrency: 3,
      factualityJudgmentConcurrency: 4
    }
  };
  const h = harness({
    policy: capPolicy,
    questionPlanning: {
      model: "tracked-planner",
      plan: (input) => planner.run(() => input.targets.map((target) => ({
        targetKey: target.targetKey,
        question: `Question for ${target.targetKey}`
      })))
    },
    answering: {
      model: "tracked-answerer",
      answer: (input) => answerer.run(() => input.questions.map((question) => ({
        questionKey: question.questionKey,
        answer: `Answer for ${question.questionKey}`
      })))
    },
    factualityJudgments: [
      {
        model: "tracked-judge-a",
        judge: (input) => judges.run(() => input.targets.map((target) => ({
          targetKey: target.targetKey,
          disposition: "accepted" as const,
          rationale: "judge A acceptance"
        })))
      },
      {
        model: "tracked-judge-b",
        judge: (input) => judges.run(() => input.targets.map((target) => ({
          targetKey: target.targetKey,
          disposition: "accepted" as const,
          rationale: "judge B acceptance"
        })))
      }
    ]
  });

  await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("a"),
    candidate("b"),
    candidate("c")
  ]);
  assert.equal(planner.peak(), 2);
  assert.equal(answerer.peak(), 3);
  assert.equal(judges.peak(), 4, "judge A and judge B use one combined limiter");
});

test("out-of-order packet completion cannot change candidate, target, sample, or judge ordering", async () => {
  const judge = (family: "A" | "B"): ClaimFactualityJudgmentPort => ({
    model: `ordering-judge-${family}`,
    async judge(input) {
      const questionKey = input.verificationAnswers[0]!.questionKey;
      const sample = Number(/:verification:(\d+):/.exec(questionKey)![1]);
      await delay(family === "A" ? (sample === 0 ? 12 : 1) : (sample === 0 ? 1 : 12));
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: target.targetKey.startsWith("definition:") ? "rejected" as const : "accepted" as const,
        rationale: `${family}${sample}:${target.targetKey}`
      }));
    }
  });
  const h = harness({
    policy: {
      ...policy,
      verificationExecution: {
        questionPlanningConcurrency: 4,
        answeringConcurrency: 4,
        factualityJudgmentConcurrency: 8
      }
    },
    questionPlanning: {
      model: "ordering-planner",
      async plan(input) {
        if (input.canonicalLabel === "Slow") await delay(8);
        return [...input.targets].reverse().map((target) => ({
          targetKey: target.targetKey,
          question: `Question for ${target.targetKey}`
        }));
      }
    },
    answering: {
      model: "ordering-answerer",
      async answer(input) {
        const sample = Number(/:verification:(\d+):/.exec(input.questions[0]!.questionKey)![1]);
        await delay(sample === 0 ? 6 : 1);
        return [...input.questions].reverse().map((question) => ({
          questionKey: question.questionKey,
          answer: `Answer for ${question.questionKey}`
        }));
      }
    },
    factualityJudgments: [judge("A"), judge("B")]
  });

  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("slow", "Slow"),
    candidate("fast", "Fast")
  ]);
  assert.deepEqual(outcomes.map((outcome) => outcome.candidateKey), ["slow", "fast"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.disposition), ["rejected", "rejected"]);
  for (const outcome of outcomes) {
    if (outcome.disposition !== "rejected") continue;
    const orderedMarkers = [
      "A0:definition:0:claim:0",
      "A1:definition:0:claim:0",
      "B0:definition:0:claim:0",
      "B1:definition:0:claim:0",
      "A0:definition:1:claim:0"
    ];
    const positions = orderedMarkers.map((marker) => outcome.rationale.indexOf(marker));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  }
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
  assert.deepEqual(outcome.bundle.definitions.map((passage) => passage.text), ["Concept A definition one."]);
  assert.deepEqual(outcome.bundle.mentions, []);
  assert.equal(outcome.bundle.rationale, "original rationale for Concept A", "settlement changes no metadata");
});

test("a single rejection outlier receives one bounded disagreement sample but cannot veto without replication", async () => {
  let primaryMentionVerdict = 0;
  const { stage, events, overlappedStages } = recordingStage();
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
  assert.deepEqual([...overlappedStages], [], "a disagreement wave never overlaps an earlier bracket with the same stage name");
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

test("planner, answerer, and judge failures stop queued work, drain in-flight calls, and preserve the origin", async (t) => {
  const cases = [
    {
      role: "question_planning" as const,
      stage: STAGE_TAGS.groundingVerificationQuestionPlanning,
      maximumCalls: 6
    },
    {
      role: "answering" as const,
      stage: STAGE_TAGS.groundingVerificationAnswering,
      maximumCalls: 6
    },
    {
      role: "factuality_judgment" as const,
      stage: STAGE_TAGS.groundingFactualityRevision,
      maximumCalls: 36
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.role, async () => {
      const origin = new Error(`${scenario.role} origin`);
      const secondStarted = testDeferred();
      const originObserved = testDeferred();
      const releaseInFlight = testDeferred();
      let targetCalls = 0;
      let activeTargetCalls = 0;
      let drained = false;
      const failAndDrain = async <T>(produce: () => T | Promise<T>): Promise<T> => {
        const callIndex = targetCalls++;
        activeTargetCalls += 1;
        try {
          if (callIndex === 0) {
            await secondStarted.promise;
            originObserved.resolve();
            throw origin;
          }
          if (callIndex === 1) {
            secondStarted.resolve();
            await releaseInFlight.promise;
            return await produce();
          }
          throw new Error(`${scenario.role} queued work started after the origin failed`);
        } finally {
          activeTargetCalls -= 1;
          if (activeTargetCalls === 0) drained = true;
        }
      };
      const plan = async (input: Parameters<ClaimVerificationQuestionPlanningPort["plan"]>[0]) => {
        const produce = () => input.targets.map((target) => ({
          targetKey: target.targetKey,
          question: `Question for ${target.targetKey}`
        }));
        return scenario.role === "question_planning" ? failAndDrain(produce) : produce();
      };
      const answer = async (input: Parameters<ClaimVerificationAnsweringPort["answer"]>[0]) => {
        const produce = () => input.questions.map((question) => ({
          questionKey: question.questionKey,
          answer: `Answer for ${question.questionKey}`
        }));
        return scenario.role === "answering" ? failAndDrain(produce) : produce();
      };
      const judge = async (input: Parameters<ClaimFactualityJudgmentPort["judge"]>[0]) => {
        const produce = () => input.targets.map((target) => ({
          targetKey: target.targetKey,
          disposition: "accepted" as const,
          rationale: "established"
        }));
        return scenario.role === "factuality_judgment" ? failAndDrain(produce) : produce();
      };
      const timeline = lifecycleStage();
      const h = harness({
        policy: {
          ...policy,
          verificationExecution: {
            questionPlanningConcurrency: 2,
            answeringConcurrency: 2,
            factualityJudgmentConcurrency: 2
          }
        },
        questionPlanning: { model: "failure-planner", plan },
        answering: { model: "failure-answerer", answer },
        factualityJudgments: [
          { model: "failure-judge-a", judge },
          { model: "failure-judge-b", judge }
        ]
      });

      let resultWasReturned = false;
      let settled = false;
      const admissionPromise = h.admission.forOperation(timeline.stage).admitBatch([
        candidate("a"),
        candidate("b"),
        candidate("c")
      ]).then((result) => {
        resultWasReturned = true;
        return result;
      });
      void admissionPromise.then(
        () => { settled = true; },
        () => { settled = true; }
      );

      await originObserved.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(settled, false, "the batch waits for already-running work to drain");
      assert.equal(targetCalls, 2, "the role cap is full when the first call fails");
      releaseInFlight.resolve();

      let caught: unknown;
      try {
        await admissionPromise;
      } catch (error) {
        caught = error;
      }
      assert.equal(caught, origin, "the first dependency error escapes by identity");
      assert.equal(resultWasReturned, false, "no partial admission result escapes");
      assert.equal(drained, true);
      assert.equal(activeTargetCalls, 0);
      assert.equal(targetCalls, 2);
      assert.ok(targetCalls < scenario.maximumCalls, "queued calls never start after abort");

      const verificationStages: ReadonlySet<string> = new Set([
        STAGE_TAGS.groundingVerificationQuestionPlanning,
        STAGE_TAGS.groundingVerificationAnswering,
        STAGE_TAGS.groundingFactualityRevision
      ]);
      const opened = timeline.events.filter((event) => event.kind === "opened" && verificationStages.has(event.stage));
      const closed = timeline.events.filter((event) => event.kind === "closed" && verificationStages.has(event.stage));
      assert.equal(opened.length, 3);
      assert.equal(closed.length, 3, "every opened verification bracket closes");
      const originClose = closed.find((event) => event.stage === scenario.stage);
      assert.ok(originClose?.kind === "closed" && !originClose.ok);
      assert.equal(originClose.error, origin);
      for (const event of closed) {
        if (event.kind !== "closed" || event.ok || event.stage === scenario.stage) continue;
        assert.equal(
          typeof event.error === "object"
            && event.error !== null
            && "stageErrorDetail" in event.error
            && typeof event.error.stageErrorDetail === "object"
            && event.error.stageErrorDetail !== null
            && "message" in event.error.stageErrorDetail
            && String(event.error.stageErrorDetail.message).includes(`upstream ${scenario.role} failure`),
          true,
          `${event.stage} closes with an explicit upstream-abort detail`
        );
      }
    });
  }
});

test("each core candidate gets one grounding draft and a rejected draft is not regenerated", async () => {
  const generationCalls: string[] = [];
  const h = harness({
    groundingGeneration: {
      model: "generator",
      async generate(input) {
        generationCalls.push(input.canonicalLabel);
        return bundle(input.canonicalLabel, input.context);
      }
    },
    factualityJudgments: judgmentPanel(async (input) => {
      const rejectConceptA = input.canonicalLabel === "Concept A";
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: rejectConceptA && target.targetKey.startsWith("definition:")
          ? "rejected" as const
          : "accepted" as const,
        rationale: rejectConceptA ? "definition contradicted" : "established"
      }));
    })
  });
  const outcomes = await h.admission.forOperation(async (_name, fn) => fn()).admitBatch([
    candidate("a", "Concept A"),
    candidate("b", "Concept B")
  ]);

  assert.deepEqual(generationCalls, ["Concept A", "Concept B"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.candidateKey), ["a", "b"]);
  assert.equal(outcomes[0].disposition, "rejected");
  assert.ok(outcomes[0].disposition === "rejected" && outcomes[0].rationale.includes("definition contradicted"));
  assert.equal(outcomes[1].disposition, "admitted");
});

test("rejecting every Definition Passage returns a resolved rejected outcome", async () => {
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
    rationale: "definition:0:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. not established definition:1:claim:0: Rejected because fake-judge-a, fake-judge-b replicated an objection across at least 2 of 2 independently planned verification samples. not established"
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

test("stage waves and totals contain exactly one grounding-generation wave", async () => {
  const { stage, events } = recordingStage();
  const h = harness({
    factualityJudgments: judgmentPanel(async (input) => {
      const reject = input.canonicalLabel === "Concept A";
      return input.targets.map((target) => ({
        targetKey: target.targetKey,
        disposition: reject && target.targetKey.startsWith("definition:") ? "rejected" as const : "accepted" as const,
        rationale: reject ? "rejected" : "ok"
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
    { stage: STAGE_TAGS.groundingFactualityRevision, total: 24 }
  ]);
});

test("the closed scaffolded-anchor context is preserved and mechanically attributed in the bundle", async () => {
  const h = harness();
  const anchored: GroundingAdmissionCandidate = {
    candidateKey: "anchored",
    canonicalLabel: "State transition",
    aliases: [],
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
