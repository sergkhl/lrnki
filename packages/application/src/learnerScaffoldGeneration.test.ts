import assert from "node:assert/strict";
import test from "node:test";
import {
  STAGE_TAGS,
  type GeneratedGroundingBundle,
  type ScaffoldDetour,
  type ScaffoldStep
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  DerivedGraphNode,
  ScaffoldContentDraft,
  ScaffoldOutline
} from "@lrnki/ports";
import {
  createScaffoldGeneration,
  type ScaffoldGenerationConfig,
  type ScaffoldGenerationConstruction,
  type ScaffoldOpeningStudySession
} from "./learnerScaffoldGeneration";
import {
  DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  type GroundingAdmissionCandidate,
  type GroundingAdmissionOutcome,
  type SourceLessGroundingAdmission
} from "./sourceLessGroundingAdmission";

// Every test crosses the same process-lived interface production uses. The admission fake is
// deliberately a finished deep-module seam: tests can settle labels, but cannot reach a raw
// probe, embedding, or grounding-generation dependency through Scaffold Generation.

const TEST_CONFIG: ScaffoldGenerationConfig = {
  maxSupportSteps: 3,
  outlineAttempts: 2,
  contentDraftAttempts: 2,
  positiveClaimProjection: "question_answer_pair_v1",
  sourceLessGroundingAdmission: {
    ...DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
    probe: { sampleCount: 2, probeConcurrency: 1, agreementThreshold: 0.75 },
    verificationSampleCount: 2,
    verificationRejectionSampleQuorum: 2,
    candidateConcurrency: 1,
    verificationExecution: {
      questionPlanningConcurrency: 1,
      answeringConcurrency: 1,
      factualityJudgmentConcurrency: 1
    }
  }
};

function fakeNode(overrides: Partial<DerivedGraphNode> & { derivedNodeId: string; label: string }): DerivedGraphNode {
  return {
    aliases: [],
    declaredDomain: "cs",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment",
    groundingOrigin: "llm_grounded",
    role: "prerequisite",
    hasStudyItem: true,
    grounding: null,
    ...overrides
  };
}

function fakeSession(input: {
  nodes: DerivedGraphNode[];
  stateByNode?: Record<string, "mastered" | "frontier" | "locked">;
  assets?: Record<string, { conceptLessonId: string; studyItemId: string }>;
  flooredNodeIds?: string[];
}): ScaffoldOpeningStudySession {
  return {
    detail: {
      summary: {} as never,
      nodes: input.nodes,
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: { stateByNode: input.stateByNode ?? {}, selectedFrontierTarget: null },
    neutralReferenceAssetsByNode: input.assets ?? {},
    flooredNodeIds: input.flooredNodeIds ?? []
  };
}

function contentDraft(overrides: Partial<ScaffoldContentDraft> = {}): ScaffoldContentDraft {
  return {
    microLesson: "A short lesson with an example.",
    question: "Q?",
    explanation: "because",
    correctAnswer: "Right",
    distractors: ["Wrong A", "Wrong B", "Wrong C"],
    ...overrides
  };
}

function parentNode(): DerivedGraphNode {
  return fakeNode({
    derivedNodeId: "parent",
    label: "Ownership",
    grounding: {
      generatingModel: null,
      rationale: null,
      verbatimDisposition: "n/a",
      passages: [{
        passageType: "definition",
        text: "Parent definition text.",
        groundingOrigin: "llm_grounded"
      }]
    }
  });
}

function admittedBundle(candidate: GroundingAdmissionCandidate): GeneratedGroundingBundle {
  const generated = {
    disposition: "not_applicable_by_grounding" as const,
    rationale: "generated"
  };
  return {
    groundingOrigin: "llm_grounded",
    definitions: [{
      passageType: "definition",
      text: `${candidate.canonicalLabel} is a generated prerequisite definition.`,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: generated
    }],
    mentions: [{
      passageType: "mention",
      text: `${candidate.canonicalLabel} supports the requested topic.`,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: generated
    }],
    groundingAnchorReferences: candidate.context.kind === "scaffolded_anchor"
      ? [candidate.context.anchor.reference]
      : [],
    generatingModel: "fake-grounding-generator",
    rationale: `grounding for ${candidate.canonicalLabel}`
  };
}

type AdmissionDisposition = "admitted" | "held_out" | "rejected";
type ClaimMode = "pass" | "reject";
type KeyMode = "pass" | "reject" | Error;
type CongruenceMode = "pass" | "reject" | Error;

type Harness = {
  run: (request?: { detourId?: string; operationId?: string }) => Promise<void>;
  construction: ScaffoldGenerationConstruction;
  published: ScaffoldStep[][];
  releases: number;
  failures: number;
  sessionReads: number;
  outlineInputs: { retryFeedback?: string }[];
  admissionBatches: readonly GroundingAdmissionCandidate[][];
  bundlesByLabel: ReadonlyMap<string, GeneratedGroundingBundle>;
  contentInputs: Array<Parameters<ScaffoldGenerationConstruction["content"]["generate"]>[0]>;
  claimPlanningInputs: Array<Parameters<ClaimVerificationQuestionPlanningPort["plan"]>[0]>;
  claimJudgmentInputs: Array<Parameters<ClaimFactualityJudgmentPort["judge"]>[0]>;
  keyInputs: Array<Parameters<AnswerKeyVerificationPort["verify"]>[0]>;
  reporterEvents: { kind: string; detail: string }[];
  beginConfigHashes: (string | undefined)[];
};

function makeHarness(input: {
  session: ScaffoldOpeningStudySession | (() => ScaffoldOpeningStudySession);
  term?: string;
  detour?: Partial<ScaffoldDetour>;
  outlines?: ScaffoldOutline[];
  admissionByLabel?: Record<string, AdmissionDisposition>;
  admissionError?: Error;
  contentDrafts?: Array<ScaffoldContentDraft | Error>;
  congruenceModes?: CongruenceMode[];
  claimModes?: ClaimMode[];
  claimPlanningError?: Error;
  claimAnsweringError?: Error;
  claimJudgmentError?: Error;
  keyModes?: KeyMode[];
  config?: ScaffoldGenerationConfig;
  overrides?: Partial<ScaffoldGenerationConstruction>;
}): Harness {
  const published: ScaffoldStep[][] = [];
  const state = { releases: 0, failures: 0, sessionReads: 0 };
  const outlineInputs: { retryFeedback?: string }[] = [];
  const admissionBatches: GroundingAdmissionCandidate[][] = [];
  const bundlesByLabel = new Map<string, GeneratedGroundingBundle>();
  const contentInputs: Harness["contentInputs"] = [];
  const claimPlanningInputs: Harness["claimPlanningInputs"] = [];
  const claimJudgmentInputs: Harness["claimJudgmentInputs"] = [];
  const keyInputs: Harness["keyInputs"] = [];
  const reporterEvents: Harness["reporterEvents"] = [];
  const beginConfigHashes: Harness["beginConfigHashes"] = [];
  const outlines = input.outlines ?? [{ steps: [{ label: "Affine types", rationale: "needed" }] }];
  let outlineCall = 0;
  let congruenceCall = 0;
  const detour: ScaffoldDetour = {
    detourId: "d-1",
    learnerStateRef: "L",
    enrichmentId: "e",
    parentDerivedNodeId: "parent",
    term: input.term ?? "Borrow checker",
    normalizedTerm: (input.term ?? "Borrow checker").toLowerCase(),
    status: "generating",
    latestOperationId: "op-1",
    claimToken: "op-1",
    steps: [],
    ...input.detour
  };
  let idSeq = 0;

  const sourceLessGroundingAdmission: SourceLessGroundingAdmission = {
    forOperation(stage) {
      return {
        async admitBatch(candidates) {
          admissionBatches.push([...candidates]);
          if (input.admissionError) throw input.admissionError;
          await stage(STAGE_TAGS.knowledgeBoundaryProbe, async () => {}, candidates.length);
          const grounded = candidates.filter((candidate) =>
            (input.admissionByLabel?.[candidate.canonicalLabel] ?? "admitted") !== "held_out"
          );
          if (grounded.length > 0) {
            await stage(STAGE_TAGS.groundingGeneration, async () => {}, grounded.length);
            await stage(STAGE_TAGS.groundingVerificationQuestionPlanning, async () => {}, grounded.length);
            await stage(STAGE_TAGS.groundingVerificationAnswering, async () => {}, grounded.length);
            await stage(STAGE_TAGS.groundingFactualityRevision, async () => {}, grounded.length);
          }
          return candidates.map((candidate): GroundingAdmissionOutcome => {
            const disposition = input.admissionByLabel?.[candidate.canonicalLabel] ?? "admitted";
            if (disposition === "held_out") {
              return {
                candidateKey: candidate.candidateKey,
                disposition: "held_out",
                reason: "knowledge_boundary",
                probe: { disposition: "boundary", agreementScore: 0.2, rationale: "held out" }
              };
            }
            if (disposition === "rejected") {
              return {
                candidateKey: candidate.candidateKey,
                disposition: "rejected",
                reason: "grounding_verification_exhausted",
                probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" },
                rationale: "grounding claims were rejected"
              };
            }
            const bundle = admittedBundle(candidate);
            bundlesByLabel.set(candidate.canonicalLabel, bundle);
            return {
              candidateKey: candidate.candidateKey,
              disposition: "admitted",
              probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" },
              bundle
            };
          });
        }
      };
    }
  };

  const claimQuestionPlanning: ClaimVerificationQuestionPlanningPort = {
    model: "fake-question-planner",
    async plan(request) {
      claimPlanningInputs.push(request);
      if (input.claimPlanningError) throw input.claimPlanningError;
      return request.targets.map((target) => ({
        targetKey: target.targetKey,
        question: `Is this accurate: ${target.text}`
      }));
    }
  };
  const claimAnswering: ClaimVerificationAnsweringPort = {
    model: "fake-answerer",
    async answer(request) {
      if (input.claimAnsweringError) throw input.claimAnsweringError;
      return request.questions.map((question) => ({
        questionKey: question.questionKey,
        answer: "Independent answer."
      }));
    }
  };
  const judge = async (
    request: Parameters<ClaimFactualityJudgmentPort["judge"]>[0]
  ): ReturnType<ClaimFactualityJudgmentPort["judge"]> => {
    claimJudgmentInputs.push(request);
    if (input.claimJudgmentError) throw input.claimJudgmentError;
    const questionKey = request.verificationAnswers[0]?.questionKey ?? "";
    const match = /scaffold-content:(\d+):/.exec(questionKey);
    const attempt = match ? Number(match[1]) : 0;
    const mode = input.claimModes?.[attempt] ?? "pass";
    return request.targets.map((target) => ({
      targetKey: target.targetKey,
      disposition: mode === "reject" ? "rejected" as const : "accepted" as const,
      rationale: mode === "reject" ? "fixture factual defect" : "fixture accepted"
    }));
  };
  const claimFactualityJudgments = [
    { model: "fake-primary-judge", judge },
    { model: "fake-challenger-judge", judge }
  ] as const;

  const answerKeyVerification: AnswerKeyVerificationPort = {
    model: "fake-answer-key-verifier",
    async verify(request) {
      const callIndex = keyInputs.length;
      keyInputs.push(request);
      const mode = input.keyModes?.[callIndex] ?? "pass";
      if (mode instanceof Error) throw mode;
      return request.candidates.map((candidate) => ({
        ordinal: candidate.ordinal,
        verdict: mode === "reject" && candidate.text === "Wrong A" ? "claim_true" : "unclear",
        reason: mode === "reject" ? "fixture ambiguity" : "fixture has no objection"
      }));
    }
  };

  const construction: ScaffoldGenerationConstruction = {
    detours: {
      getById: async () => detour,
      publishReady: async ({ claimToken, steps }) => {
        if (claimToken !== detour.claimToken) return false;
        published.push(steps);
        return true;
      },
      releaseClaim: async () => { state.releases += 1; return true; },
      markFailed: async () => { state.failures += 1; return true; }
    },
    readStudySession: async () => {
      state.sessionReads += 1;
      return typeof input.session === "function" ? input.session() : input.session;
    },
    outline: {
      model: "fake-outline",
      async propose(request) {
        outlineInputs.push({ retryFeedback: request.retryFeedback });
        const result = outlines[Math.min(outlineCall, outlines.length - 1)]!;
        outlineCall += 1;
        return result;
      }
    },
    content: {
      model: "fake-content",
      async generate(request) {
        const callIndex = contentInputs.length;
        contentInputs.push(request);
        const result = input.contentDrafts?.[Math.min(callIndex, (input.contentDrafts?.length ?? 1) - 1)] ?? contentDraft();
        if (result instanceof Error) throw result;
        return result;
      }
    },
    congruence: {
      model: "fake-congruence",
      async judge() {
        const mode = input.congruenceModes?.[Math.min(congruenceCall, (input.congruenceModes?.length ?? 1) - 1)] ?? "pass";
        congruenceCall += 1;
        if (mode instanceof Error) throw mode;
        return mode === "reject"
          ? { teachesStepLabel: false, isSimplerPrerequisite: true, rationale: "off-label fixture" }
          : { teachesStepLabel: true, isSimplerPrerequisite: true, rationale: "ok" };
      }
    },
    sourceLessGroundingAdmission,
    claimVerificationQuestionPlanning: claimQuestionPlanning,
    claimVerificationAnswering: claimAnswering,
    claimFactualityJudgments,
    answerKeyVerification,
    reporter: {
      beginOperation: async ({ configHash }) => {
        beginConfigHashes.push(configHash);
        reporterEvents.push({ kind: "begin", detail: "scaffold" });
      },
      enterStage: async ({ stage }) => { reporterEvents.push({ kind: "enter", detail: stage }); },
      recordProgress: async () => {},
      completeStage: async () => {},
      completeOperation: async ({ status }) => { reporterEvents.push({ kind: "complete", detail: status }); },
      touch: async () => {}
    },
    config: input.config ?? TEST_CONFIG,
    configHash: "hash-under-test",
    newId: () => `x-${++idSeq}`,
    ...input.overrides
  };
  const generation = createScaffoldGeneration(construction);
  return {
    run: (request) => generation({
      detourId: request?.detourId ?? "d-1",
      operationId: request?.operationId ?? "op-1"
    }),
    construction,
    published,
    outlineInputs,
    admissionBatches,
    bundlesByLabel,
    contentInputs,
    claimPlanningInputs,
    claimJudgmentInputs,
    keyInputs,
    reporterEvents,
    beginConfigHashes,
    get releases() { return state.releases; },
    get failures() { return state.failures; },
    get sessionReads() { return state.sessionReads; }
  };
}

function generatedSession(): ScaffoldOpeningStudySession {
  return fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
}

test("a unique eligible frontier match publishes one pinned reference with zero neural calls", async () => {
  const session = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { parent: "frontier", "n-1": "frontier" },
    assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } }
  });
  const h = makeHarness({ session });
  await h.run();
  assert.equal(h.published.length, 1);
  assert.deepEqual(h.published[0], [{
    scaffoldStepId: "x-1",
    ordinal: 0,
    kind: "reference",
    referencedDerivedNodeId: "n-1",
    referencedConceptLessonId: "lesson-1",
    referencedStudyItemId: "item-1"
  }]);
  assert.deepEqual(h.outlineInputs, []);
  assert.deepEqual(h.admissionBatches, []);
  assert.equal(h.contentInputs.length, 0);
  assert.equal(h.claimPlanningInputs.length, 0);
  assert.equal(h.keyInputs.length, 0);
  assert.deepEqual(h.beginConfigHashes, ["hash-under-test"]);
});

test("mastered and confidently floored matches remain eligible for direct reuse", async () => {
  const shapes: { stateByNode: Record<string, "mastered" | "frontier" | "locked">; flooredNodeIds: string[] }[] = [
    { stateByNode: { "n-1": "mastered" }, flooredNodeIds: [] },
    { stateByNode: {}, flooredNodeIds: ["n-1"] }
  ];
  for (const shape of shapes) {
    const h = makeHarness({
      session: fakeSession({
        nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
        stateByNode: shape.stateByNode,
        assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } },
        flooredNodeIds: shape.flooredNodeIds
      })
    });
    await h.run();
    assert.equal(h.published[0]![0]!.kind, "reference");
    assert.deepEqual(h.admissionBatches, []);
  }
});

test("settled generated labels cross Source-less Grounding Admission in one batch and persist their exact bundles", async () => {
  const h = makeHarness({
    session: generatedSession(),
    outlines: [{ steps: [
      { label: "Affine types", rationale: "first" },
      { label: "Move semantics", rationale: "second" }
    ] }]
  });
  await h.run();
  assert.equal(h.admissionBatches.length, 1);
  assert.deepEqual(h.admissionBatches[0]!.map(({ candidateKey, canonicalLabel, context }) => ({ candidateKey, canonicalLabel, context })), [
    {
      candidateKey: "scaffold-candidate:0",
      canonicalLabel: "Affine types",
      context: {
        kind: "scaffolded_anchor",
        anchor: { reference: "parent", canonicalLabel: "Ownership", definitionPassages: ["Parent definition text."] }
      }
    },
    {
      candidateKey: "scaffold-candidate:1",
      canonicalLabel: "Move semantics",
      context: {
        kind: "scaffolded_anchor",
        anchor: { reference: "parent", canonicalLabel: "Ownership", definitionPassages: ["Parent definition text."] }
      }
    }
  ]);
  const steps = h.published[0]!;
  assert.deepEqual(steps.map((step) => step.kind === "generated" ? step.payload.label : "reference"), ["Affine types", "Move semantics"]);
  assert.deepEqual(h.contentInputs.map((request) => request.groundingContext), [
    {
      kind: "scaffolded_anchor",
      anchor: { reference: "parent", canonicalLabel: "Ownership", definitionPassages: ["Parent definition text."] }
    },
    {
      kind: "scaffolded_anchor",
      anchor: { reference: "parent", canonicalLabel: "Ownership", definitionPassages: ["Parent definition text."] }
    }
  ]);
  for (const step of steps) {
    assert.ok(step.kind === "generated");
    assert.deepEqual(step.groundingBundle, h.bundlesByLabel.get(step.payload.label));
  }
});

test("held and rejected labels are omitted while safe reference and admitted peers survive in order", async () => {
  const session = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "ref", label: "Move semantics" })],
    stateByNode: { ref: "mastered" },
    assets: { ref: { conceptLessonId: "lesson-ref", studyItemId: "item-ref" } }
  });
  const h = makeHarness({
    session,
    outlines: [{ steps: [
      { label: "Move semantics", rationale: "reuse" },
      { label: "Boundary idea", rationale: "hold" },
      { label: "False grounding", rationale: "reject" },
      { label: "Affine types", rationale: "admit" }
    ] }],
    admissionByLabel: { "Boundary idea": "held_out", "False grounding": "rejected" },
    config: { ...TEST_CONFIG, maxSupportSteps: 4 }
  });
  await h.run();
  assert.equal(h.admissionBatches.length, 1);
  assert.deepEqual(h.admissionBatches[0]!.map((candidate) => candidate.canonicalLabel), [
    "Boundary idea",
    "False grounding",
    "Affine types"
  ]);
  assert.deepEqual(h.published[0]!.map((step) => step.kind), ["reference", "generated"]);
  assert.deepEqual(h.published[0]!.map((step) => step.ordinal), [0, 1]);
  assert.equal(h.contentInputs.length, 1, "only the admitted label enters content generation");
});

test("an admission dependency failure aborts the whole attempt without a partial reference publish", async () => {
  const session = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "ref", label: "Move semantics" })],
    stateByNode: { ref: "mastered" },
    assets: { ref: { conceptLessonId: "lesson-ref", studyItemId: "item-ref" } }
  });
  const h = makeHarness({
    session,
    outlines: [{ steps: [
      { label: "Move semantics", rationale: "reuse" },
      { label: "Affine types", rationale: "generate" }
    ] }],
    admissionError: new Error("admission dependency offline")
  });
  await assert.rejects(h.run(), /admission dependency offline/);
  assert.deepEqual(h.published, []);
  assert.equal(h.failures, 1);
});

test("a structural rejection consumes one complete attempt and supplies bounded feedback to the fresh draft", async () => {
  const h = makeHarness({
    session: generatedSession(),
    contentDrafts: [
      contentDraft({ distractors: ["Right", "Wrong B", "Wrong C"] }),
      contentDraft()
    ]
  });
  await h.run();
  assert.equal(h.contentInputs.length, 2);
  assert.match(h.contentInputs[1]!.retryFeedback ?? "", /duplicate options/);
  assert.equal(h.published[0]![0]!.kind, "generated");
});

test("a congruence rejection consumes one complete attempt and its reason reaches the retry", async () => {
  const h = makeHarness({
    session: generatedSession(),
    congruenceModes: ["reject", "pass"]
  });
  await h.run();
  assert.equal(h.contentInputs.length, 2);
  assert.match(h.contentInputs[1]!.retryFeedback ?? "", /off-label fixture/);
});

test("a replicated positive-claim rejection consumes one complete attempt and its target feedback reaches the retry", async () => {
  const h = makeHarness({
    session: generatedSession(),
    claimModes: ["reject", "pass"]
  });
  await h.run();
  assert.equal(h.contentInputs.length, 2);
  assert.match(h.contentInputs[1]!.retryFeedback ?? "", /positive-claim admission rejected the draft/);
  assert.match(h.contentInputs[1]!.retryFeedback ?? "", /lesson:0:text/);
});

test("an Answer-Key rejection consumes one complete attempt and its ambiguity feedback reaches the retry", async () => {
  const h = makeHarness({
    session: generatedSession(),
    keyModes: ["reject", "pass"]
  });
  await h.run();
  assert.equal(h.contentInputs.length, 2);
  assert.equal(h.keyInputs.length, 2);
  assert.match(h.contentInputs[1]!.retryFeedback ?? "", /distractor "Wrong A" was judged true/);
});

test("congruence unavailability skips only its veto and still runs required claim and key checks", async () => {
  const h = makeHarness({
    session: generatedSession(),
    congruenceModes: [new Error("congruence unavailable")]
  });
  await h.run();
  assert.equal(h.contentInputs.length, 1);
  assert.ok(h.claimJudgmentInputs.length > 0);
  assert.equal(h.keyInputs.length, 1);
  assert.equal(h.published[0]![0]!.kind, "generated");
});

test("required claim verification failure escapes unchanged without spending a second content draft", async () => {
  const h = makeHarness({
    session: generatedSession(),
    claimPlanningError: new Error("claim planner offline")
  });
  await assert.rejects(h.run(), /claim planner offline/);
  assert.equal(h.contentInputs.length, 1);
  assert.equal(h.keyInputs.length, 0);
  assert.equal(h.failures, 1);
});

test("required Answer-Key failure escapes unchanged without spending a second content draft", async () => {
  const h = makeHarness({
    session: generatedSession(),
    keyModes: [new Error("answer-key verifier offline")]
  });
  await assert.rejects(h.run(), /answer-key verifier offline/);
  assert.equal(h.contentInputs.length, 1);
  assert.equal(h.keyInputs.length, 1);
  assert.equal(h.failures, 1);
});

test("all resolved content rejections exhaust the bound atomically with no published child rows", async () => {
  const h = makeHarness({
    session: generatedSession(),
    congruenceModes: ["reject", "reject"]
  });
  await assert.rejects(h.run(), /No safe Support Step survived/);
  assert.equal(h.contentInputs.length, 2);
  assert.deepEqual(h.published, []);
  assert.equal(h.failures, 1);
});

test("if every generated label is held out, no survivor fails atomically", async () => {
  const h = makeHarness({
    session: generatedSession(),
    admissionByLabel: { "Affine types": "held_out" }
  });
  await assert.rejects(h.run(), /No safe Support Step survived/);
  assert.equal(h.contentInputs.length, 0);
  assert.deepEqual(h.published, []);
});

test("collision feedback can settle on a distinct generated label and duplicates never clone", async () => {
  const h = makeHarness({
    session: generatedSession(),
    outlines: [
      { steps: [{ label: "Ownership", rationale: "parent collision" }] },
      { steps: [
        { label: "Affine types", rationale: "fresh" },
        { label: "affine types", rationale: "duplicate" }
      ] }
    ]
  });
  await h.run();
  assert.equal(h.outlineInputs.length, 2);
  assert.match(h.outlineInputs[1]!.retryFeedback ?? "", /"Ownership"/);
  assert.deepEqual(h.admissionBatches[0]!.map((candidate) => candidate.canonicalLabel), ["Affine types"]);
  assert.equal(h.published[0]!.length, 1);
});

test("the opening Study Session is read exactly once even if later state would revoke reuse", async () => {
  let reads = 0;
  const open = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { "n-1": "frontier" },
    assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } }
  });
  const mutated = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { "n-1": "locked" }
  });
  const h = makeHarness({ session: () => { reads += 1; return reads === 1 ? open : mutated; } });
  await h.run();
  assert.equal(reads, 1);
  assert.equal(h.published[0]![0]!.kind, "reference");
});

test("two interleaved calls through one construction share no per-attempt identity state", async () => {
  const published = new Map<string, ScaffoldStep[]>();
  const detourFor = (detourId: string): ScaffoldDetour => ({
    detourId,
    learnerStateRef: "L",
    enrichmentId: "e",
    parentDerivedNodeId: "parent",
    term: `Term ${detourId}`,
    normalizedTerm: `term ${detourId}`,
    status: "generating",
    latestOperationId: `op-${detourId}`,
    claimToken: `op-${detourId}`,
    steps: []
  });
  let id = 0;
  const h = makeHarness({
    session: generatedSession(),
    overrides: {
      newId: () => `parallel-${++id}`,
      detours: {
        getById: async (detourId) => detourFor(detourId),
        publishReady: async ({ detourId, claimToken, steps }) => {
          if (claimToken !== `op-${detourId}`) return false;
          published.set(detourId, steps);
          return true;
        },
        releaseClaim: async () => true,
        markFailed: async () => true
      }
    }
  });
  await Promise.all([
    h.run({ detourId: "A", operationId: "op-A" }),
    h.run({ detourId: "B", operationId: "op-B" })
  ]);
  const ids = [...published.values()].flat().map((step) => step.scaffoldStepId);
  assert.equal(published.size, 2);
  assert.equal(new Set(ids).size, ids.length);
});

test("all-transient outline exhaustion releases the fenced claim", async () => {
  const transient = Object.assign(new Error("upstream unavailable"), {
    stageErrorDetail: {
      kind: "forced_tool_exhaustion",
      message: "upstream unavailable",
      attempts: [{ attempt: 0, kind: "network" }, { attempt: 1, kind: "http", status: 503 }]
    }
  });
  const h = makeHarness({
    session: generatedSession(),
    overrides: { outline: { model: "fake-outline", propose: async () => { throw transient; } } }
  });
  await assert.rejects(h.run(), /upstream unavailable/);
  assert.equal(h.releases, 1);
  assert.equal(h.failures, 0);
});

test("a deterministic outline failure marks the fenced detour failed", async () => {
  const deterministic = Object.assign(new Error("model deviated"), {
    stageErrorDetail: {
      kind: "forced_tool_exhaustion",
      message: "model deviated",
      attempts: [{ attempt: 0, kind: "invalid_arguments" }]
    }
  });
  const h = makeHarness({
    session: generatedSession(),
    overrides: { outline: { model: "fake-outline", propose: async () => { throw deterministic; } } }
  });
  await assert.rejects(h.run(), /model deviated/);
  assert.equal(h.failures, 1);
  assert.equal(h.releases, 0);
});

test("a missing or mismatched claim writes nothing and stops before any neural spend", async () => {
  for (const detour of [{ claimToken: "someone-else" }, { status: "ready" as const }]) {
    const h = makeHarness({ session: generatedSession(), detour });
    await assert.rejects(h.run(), /claim lost/);
    assert.equal(h.sessionReads, 0);
    assert.deepEqual(h.outlineInputs, []);
    assert.equal(h.releases + h.failures, 0);
  }
});

test("a stale publish fence prevents publication without overwriting the new owner's state", async () => {
  const writes: string[] = [];
  const h = makeHarness({
    session: generatedSession(),
    overrides: {
      detours: {
        getById: async () => ({
          detourId: "d-1",
          learnerStateRef: "L",
          enrichmentId: "e",
          parentDerivedNodeId: "parent",
          term: "Borrow checker",
          normalizedTerm: "borrow checker",
          status: "generating",
          latestOperationId: "op-1",
          claimToken: "op-1",
          steps: []
        }),
        publishReady: async () => { writes.push("publish"); return false; },
        releaseClaim: async () => { writes.push("release"); return true; },
        markFailed: async () => { writes.push("fail"); return true; }
      }
    }
  });
  await assert.rejects(h.run(), /claim lost/);
  assert.deepEqual(writes, ["publish"]);
});

test("the successful timeline includes both admission and content assurance waves in exact order", async () => {
  const h = makeHarness({ session: generatedSession() });
  await h.run();
  assert.deepEqual(h.beginConfigHashes, ["hash-under-test"]);
  assert.deepEqual(
    h.reporterEvents.filter((event) => event.kind === "enter").map((event) => event.detail),
    [
      STAGE_TAGS.scaffoldOutlineGeneration,
      STAGE_TAGS.knowledgeBoundaryProbe,
      STAGE_TAGS.groundingGeneration,
      STAGE_TAGS.groundingVerificationQuestionPlanning,
      STAGE_TAGS.groundingVerificationAnswering,
      STAGE_TAGS.groundingFactualityRevision,
      STAGE_TAGS.scaffoldContentGeneration,
      STAGE_TAGS.scaffoldContentCongruence,
      STAGE_TAGS.groundingVerificationQuestionPlanning,
      STAGE_TAGS.groundingVerificationAnswering,
      STAGE_TAGS.groundingFactualityRevision,
      STAGE_TAGS.optionSelectKeyVerification
    ]
  );
  assert.deepEqual(h.reporterEvents.at(-1), { kind: "complete", detail: "succeeded" });
});

test("a failed no-survivor detour records a failed operation timeline", async () => {
  const h = makeHarness({
    session: generatedSession(),
    admissionByLabel: { "Affine types": "held_out" }
  });
  await assert.rejects(h.run(), /No safe Support Step survived/);
  assert.deepEqual(h.reporterEvents.at(-1), { kind: "complete", detail: "failed" });
});

test("removed helper and dependency exports remain absent from the application barrel", async () => {
  const barrel = await import("./index") as Record<string, unknown>;
  for (const removed of [
    "runScaffoldGeneration",
    "resolveExactMatch",
    "buildScaffoldNodePayload",
    "knowledgeBoundaryProbe",
    "groundingGeneration"
  ]) {
    assert.equal(barrel[removed], undefined, `${removed} must not be exported`);
  }
  assert.equal(typeof barrel.createScaffoldGeneration, "function");
});
