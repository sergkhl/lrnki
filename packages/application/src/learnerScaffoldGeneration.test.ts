import assert from "node:assert/strict";
import test from "node:test";
import type { ScaffoldDetour, ScaffoldStep } from "@lrnki/domain-core";
import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import type { DerivedGraphNode, ScaffoldContentDraft, ScaffoldOutline } from "@lrnki/ports";
import {
  createScaffoldGeneration,
  type ScaffoldGenerationConfig,
  type ScaffoldGenerationConstruction,
  type ScaffoldOpeningStudySession
} from "./learnerScaffoldGeneration";

// Every test crosses the SAME process-lived interface production uses (plan 2026-07-16-004 U4):
// the factory's returned callable with a lifecycle-shaped store fake. The fakes implement ONLY
// the capabilities construction actually accepts — the Pick'd store subset compiles against
// exactly {getById, publishReady, releaseClaim, markFailed}.

const TEST_CONFIG: ScaffoldGenerationConfig = {
  maxSupportSteps: 3,
  outlineAttempts: 2,
  contentDraftAttempts: 2,
  // K=2 with a 0.5 agreement floor: the fake probe answers "stable" (identical → core) or
  // per-draw divergent strings (orthogonal embeddings → boundary).
  knowledgeBoundaryProbe: { sampleCount: 2, probeConcurrency: 1, agreementThreshold: 0.5 }
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
  return { microLesson: "A short lesson with an example.", question: "Q?", explanation: "because", correctAnswer: "Right", distractors: ["Wrong A", "Wrong B", "Wrong C"], ...overrides };
}

// The parent node most tests share: "Ownership" in domain "cs" with one verified definition.
function parentNode(): DerivedGraphNode {
  return fakeNode({
    derivedNodeId: "parent",
    label: "Ownership",
    grounding: {
      generatingModel: null,
      rationale: null,
      verbatimDisposition: "n/a",
      passages: [{ passageType: "definition", text: "Parent definition text.", groundingOrigin: "llm_grounded" }]
    }
  });
}

type Harness = {
  run: (request?: { detourId?: string; operationId?: string }) => Promise<void>;
  construction: ScaffoldGenerationConstruction;
  published: ScaffoldStep[][];
  releases: number;
  failures: number;
  getByIdCalls: number;
  sessionReads: number;
  outlineInputs: { retryFeedback?: string }[];
  probeLabels: string[];
  groundingInputs: { nodeLabel: string; scaffoldedAnchors: { conceptId: string; definitionQuotes: string[] }[]; topic?: string }[];
  contentCalls: number;
  judgeCalls: number;
  reporterEvents: { kind: string; detail: string }[];
  beginConfigHashes: (string | undefined)[];
};

function makeHarness(input: {
  session: ScaffoldOpeningStudySession | (() => ScaffoldOpeningStudySession);
  term?: string;
  detour?: Partial<ScaffoldDetour>;
  outlines?: ScaffoldOutline[];
  boundaryLabels?: string[];
  emptyGroundingLabels?: string[];
  overrides?: Partial<ScaffoldGenerationConstruction>;
}): Harness {
  const published: ScaffoldStep[][] = [];
  const state = { releases: 0, failures: 0, getByIdCalls: 0, sessionReads: 0, contentCalls: 0, judgeCalls: 0, probeDraw: 0 };
  const outlineInputs: { retryFeedback?: string }[] = [];
  const probeLabels: string[] = [];
  const groundingInputs: Harness["groundingInputs"] = [];
  const reporterEvents: { kind: string; detail: string }[] = [];
  const beginConfigHashes: (string | undefined)[] = [];
  const outlines = input.outlines ?? [{ steps: [{ label: "Affine types", rationale: "needed" }] }];
  let outlineCall = 0;
  const boundary = new Set(input.boundaryLabels ?? []);
  const emptyGrounding = new Set(input.emptyGroundingLabels ?? []);
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
  const construction: ScaffoldGenerationConstruction = {
    detours: {
      getById: async () => { state.getByIdCalls += 1; return detour; },
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
      model: "m",
      propose: async (proposeInput) => {
        outlineInputs.push({ retryFeedback: proposeInput.retryFeedback });
        const outline = outlines[Math.min(outlineCall, outlines.length - 1)];
        outlineCall += 1;
        return outline;
      }
    },
    content: { model: "m", generate: async () => { state.contentCalls += 1; return contentDraft(); } },
    congruence: { model: "j", judge: async () => { state.judgeCalls += 1; return { teachesStepLabel: true, isSimplerPrerequisite: true, rationale: "ok" }; } },
    knowledgeBoundaryProbe: {
      model: "p",
      probe: async ({ conceptLabel }) => {
        probeLabels.push(conceptLabel);
        state.probeDraw += 1;
        return { answer: boundary.has(conceptLabel) ? `divergent-${state.probeDraw}` : "stable" };
      }
    },
    nodeEmbedding: {
      model: "emb",
      // "stable" answers embed identically (agreement 1); divergent draws embed orthogonally
      // (agreement 0), routing the label to boundary under the 0.5 threshold.
      embed: async (texts) => texts.map((text, index) => {
        if (!text.startsWith("divergent")) return [1, 0, 0, 0];
        const vector = [0, 0, 0, 0];
        vector[index % 4] = 1;
        return vector;
      })
    },
    groundingGeneration: {
      model: "g",
      generate: async (generateInput) => {
        groundingInputs.push({ nodeLabel: generateInput.nodeLabel, scaffoldedAnchors: generateInput.scaffoldedAnchors, topic: generateInput.topic });
        const definitions = emptyGrounding.has(generateInput.nodeLabel)
          ? []
          : [{ text: `Generated definition of ${generateInput.nodeLabel}.` }];
        return {
          derivedNodeId: generateInput.derivedNodeId,
          groundingOrigin: "llm_grounded",
          definitions,
          mentions: [],
          scaffoldedAnchorConceptIds: [],
          generatingModel: "g",
          rationale: "r"
        } as unknown as GeneratedGroundingBundle;
      }
    },
    reporter: {
      beginOperation: async (begin: { configHash?: string }) => { beginConfigHashes.push(begin.configHash); reporterEvents.push({ kind: "begin", detail: "scaffold" }); },
      enterStage: async ({ stage }) => { reporterEvents.push({ kind: "enter", detail: stage }); },
      recordProgress: async () => {},
      completeStage: async () => {},
      completeOperation: async ({ status }) => { reporterEvents.push({ kind: "complete", detail: status }); },
      touch: async () => {}
    },
    config: TEST_CONFIG,
    configHash: "hash-under-test",
    newId: () => `x-${++idSeq}`,
    ...input.overrides
  };
  const generation = createScaffoldGeneration(construction);
  return {
    run: (request) => generation({ detourId: request?.detourId ?? "d-1", operationId: request?.operationId ?? "op-1" }),
    construction,
    published,
    outlineInputs,
    probeLabels,
    groundingInputs,
    reporterEvents,
    beginConfigHashes,
    get releases() { return state.releases; },
    get failures() { return state.failures; },
    get getByIdCalls() { return state.getByIdCalls; },
    get sessionReads() { return state.sessionReads; },
    get contentCalls() { return state.contentCalls; },
    get judgeCalls() { return state.judgeCalls; }
  };
}

// --- 1. Direct selected-term reuse (zero neural calls) -----------------------

test("a unique eligible frontier match publishes one pinned reference with ZERO neural calls", async () => {
  const session = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { parent: "frontier", "n-1": "frontier" },
    assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } }
  });
  const h = makeHarness({ session });
  await h.run();
  assert.equal(h.published.length, 1);
  const step = h.published[0][0];
  assert.equal(step.kind, "reference");
  assert.ok(step.kind === "reference");
  assert.deepEqual(
    { node: step.referencedDerivedNodeId, lesson: step.referencedConceptLessonId, item: step.referencedStudyItemId },
    { node: "n-1", lesson: "lesson-1", item: "item-1" }
  );
  assert.deepEqual(h.outlineInputs, [], "no outline call");
  assert.equal(h.contentCalls, 0, "no content call");
  assert.deepEqual(h.probeLabels, [], "no probe call");
  // The operation still records its config identity even with no neural stage.
  assert.deepEqual(h.beginConfigHashes, ["hash-under-test"]);
});

test("mastered and confidently floored matches are equally eligible for direct reuse", async () => {
  const shapes: { stateByNode: Record<string, "mastered" | "frontier" | "locked">; flooredNodeIds: string[] }[] = [
    { stateByNode: { "n-1": "mastered" }, flooredNodeIds: [] },
    { stateByNode: {}, flooredNodeIds: ["n-1"] }
  ];
  for (const shape of shapes) {
    const session = fakeSession({
      nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
      stateByNode: shape.stateByNode,
      assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } },
      flooredNodeIds: shape.flooredNodeIds
    });
    const h = makeHarness({ session });
    await h.run();
    assert.equal(h.published.length, 1);
    assert.equal(h.published[0][0].kind, "reference");
    assert.deepEqual(h.outlineInputs, []);
  }
});

// --- 2. Collisions never reference or clone; feedback re-outline -------------

test("parent, locked, ambiguous, cross-domain, and payload-incomplete collisions never reference OR clone; a repeated collision fails with no child rows", async () => {
  const collisionSessions: { label: string; session: ScaffoldOpeningStudySession }[] = [
    { label: "Ownership", session: fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" }, assets: { parent: { conceptLessonId: "l", studyItemId: "i" } } }) },
    {
      label: "Locked idea",
      session: fakeSession({
        nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Locked idea" })],
        stateByNode: { "n-1": "locked" },
        assets: { "n-1": { conceptLessonId: "l", studyItemId: "i" } }
      })
    },
    {
      label: "Dup",
      session: fakeSession({
        nodes: [parentNode(), fakeNode({ derivedNodeId: "a", label: "Dup" }), fakeNode({ derivedNodeId: "b", label: "Dup" })],
        stateByNode: { a: "frontier", b: "frontier" },
        assets: { a: { conceptLessonId: "l", studyItemId: "i" }, b: { conceptLessonId: "l2", studyItemId: "i2" } }
      })
    },
    {
      label: "Foreign concept",
      session: fakeSession({
        nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Foreign concept", declaredDomain: "biology" })],
        stateByNode: { "n-1": "frontier" },
        assets: { "n-1": { conceptLessonId: "l", studyItemId: "i" } }
      })
    },
    {
      label: "No assets",
      session: fakeSession({
        nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "No assets" })],
        stateByNode: { "n-1": "frontier" }
      })
    }
  ];
  for (const { label, session } of collisionSessions) {
    // Both outline attempts keep proposing the SAME colliding label: the retry drops it, no
    // safe step remains, so the detour fails deterministically with no cloned child rows.
    const h = makeHarness({
      session,
      term: label,
      outlines: [{ steps: [{ label, rationale: "collides" }] }]
    });
    await assert.rejects(h.run(), /No safe Support Step survived/);
    assert.equal(h.published.length, 0, `${label}: no publish`);
    assert.equal(h.failures, 1, `${label}: marked failed under the fence`);
    assert.equal(h.contentCalls, 0, `${label}: never cloned as a generated node`);
    assert.equal(h.outlineInputs.length, 2, `${label}: one feedback re-outline`);
    assert.match(h.outlineInputs[1].retryFeedback ?? "", new RegExp(`"${label}"`), `${label}: feedback names the rejected label`);
  }
});

test("one feedback re-outline may choose a distinct lower-level label, which is generated", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    outlines: [
      { steps: [{ label: "Ownership", rationale: "collides with the parent" }] },
      { steps: [{ label: "Affine types", rationale: "distinct and simpler" }] }
    ]
  });
  await h.run();
  assert.equal(h.outlineInputs.length, 2);
  assert.equal(h.outlineInputs[0].retryFeedback, undefined);
  assert.match(h.outlineInputs[1].retryFeedback ?? "", /"Ownership"/);
  assert.equal(h.published.length, 1);
  assert.equal(h.published[0][0].kind, "generated");
  assert.ok(h.published[0][0].kind === "generated");
  assert.equal(h.published[0][0].payload.label, "Affine types");
});

test("a duplicate proposed label triggers the re-outline; duplicates never produce two steps", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    outlines: [
      { steps: [{ label: "Affine types", rationale: "a" }, { label: "affine types", rationale: "duplicate" }] },
      { steps: [{ label: "Affine types", rationale: "a" }, { label: "Move semantics", rationale: "b" }] }
    ]
  });
  await h.run();
  assert.equal(h.outlineInputs.length, 2, "duplicate proposal triggered the feedback re-outline");
  assert.deepEqual(h.published[0].map((step) => step.kind === "generated" ? step.payload.label : ""), ["Affine types", "Move semantics"]);
});

// --- 3. One opening Study Session per attempt --------------------------------

test("ONE opening Study Session is read per attempt; later learner-state mutation does not change publication", async () => {
  let reads = 0;
  const open = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { "n-1": "frontier" },
    assets: { "n-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } }
  });
  // Any read after the first would see the candidate LOCKED with no assets — a publication
  // recomputing eligibility would fail. The pinned reference must come from the opening read.
  const mutated = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "n-1", label: "Borrow Checker" })],
    stateByNode: { "n-1": "locked" }
  });
  const h = makeHarness({ session: () => { reads += 1; return reads === 1 ? open : mutated; } });
  await h.run();
  assert.equal(reads, 1, "exactly one Study Session read");
  assert.equal(h.published.length, 1);
  assert.equal(h.published[0][0].kind, "reference");
});

test("two interleaved calls through one constructed callable share no per-attempt state", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  // One shared construction, two distinct detours resolved by id — both publish their own steps.
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
  let idSeq = 0;
  const h = makeHarness({
    session,
    overrides: {
      newId: () => `y-${++idSeq}`,
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
  assert.equal(published.size, 2);
  const stepIds = [...published.values()].flat().map((step) => step.scaffoldStepId);
  assert.equal(new Set(stepIds).size, stepIds.length, "no shared per-attempt identity state");
});

// --- 4. Probe + child grounding for every generated label --------------------

test("every generated label runs probe then child grounding; parent definitions travel ONLY as anchors", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({ session });
  await h.run();
  // K=2 probe draws for the one generated label.
  assert.deepEqual(h.probeLabels, ["Affine types", "Affine types"]);
  assert.equal(h.groundingInputs.length, 1);
  assert.deepEqual(h.groundingInputs[0].scaffoldedAnchors.map((anchor) => anchor.definitionQuotes), [["Parent definition text."]]);
  const step = h.published[0][0];
  assert.ok(step.kind === "generated");
  // The published lesson text is the CHILD's generated definition-derived content, never the
  // parent passage: content generation consumed the child grounding.
  assert.equal(h.contentCalls, 1);
});

test("a boundary label drops; a mixed reference/generated outline survives in order; empty generated definitions cannot publish", async () => {
  const session = fakeSession({
    nodes: [parentNode(), fakeNode({ derivedNodeId: "ref-1", label: "Move semantics" })],
    stateByNode: { "ref-1": "mastered" },
    assets: { "ref-1": { conceptLessonId: "lesson-1", studyItemId: "item-1" } }
  });
  const h = makeHarness({
    session,
    outlines: [{
      steps: [
        { label: "Move semantics", rationale: "reuse" },
        { label: "Esoteric frontier idea", rationale: "boundary" },
        { label: "Empty grounding idea", rationale: "no definitions" },
        { label: "Affine types", rationale: "generate" }
      ]
    }],
    boundaryLabels: ["Esoteric frontier idea"],
    emptyGroundingLabels: ["Empty grounding idea"],
    overrides: { config: { ...TEST_CONFIG, maxSupportSteps: 4 } }
  });
  await h.run();
  assert.deepEqual(h.published[0].map((step) => step.kind), ["reference", "generated"]);
  assert.deepEqual(h.published[0].map((step) => step.ordinal), [0, 1]);
  // The boundary label was probed but never grounded or drafted; the empty-grounding label was
  // grounded but produced no publishable content.
  assert.ok(h.probeLabels.includes("Esoteric frontier idea"));
  assert.ok(!h.groundingInputs.some((g) => g.nodeLabel === "Esoteric frontier idea"));
  assert.ok(h.groundingInputs.some((g) => g.nodeLabel === "Empty grounding idea"));
  assert.equal(h.contentCalls, 1, "content only for the surviving generated label");
});

// --- 5. Congruence re-pick preserved ------------------------------------------

test("a congruence NO drops the draft and retries within the bound; the accepted retry publishes", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  let judged = 0;
  const h = makeHarness({
    session,
    overrides: {
      congruence: { model: "j", judge: async () => { judged += 1; return judged === 1 ? { teachesStepLabel: false, isSimplerPrerequisite: true, rationale: "off-label" } : { teachesStepLabel: true, isSimplerPrerequisite: true, rationale: "ok" }; } }
    }
  });
  await h.run();
  assert.equal(h.contentCalls, 2, "one retry after the congruence NO");
  assert.equal(h.published[0][0].kind, "generated");
});

test("all congruence NOs skip the step; with nothing left the detour fails with no partial publish", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    overrides: {
      congruence: { model: "j", judge: async () => ({ teachesStepLabel: true, isSimplerPrerequisite: false, rationale: "same as term" }) }
    }
  });
  await assert.rejects(h.run(), /No safe Support Step survived/);
  assert.equal(h.contentCalls, 2, "exactly the bounded content attempts");
  assert.equal(h.published.length, 0, "no partial publish");
  assert.equal(h.failures, 1);
});

test("a judge infra error accepts the current draft (fail-open, rule 16)", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    overrides: { congruence: { model: "j", judge: async () => { throw new Error("judge upstream 503"); } } }
  });
  await h.run();
  assert.equal(h.contentCalls, 1, "no retry — the draft was accepted fail-open");
  assert.equal(h.published[0][0].kind, "generated");
});

// --- 6. One honest failure protocol -------------------------------------------

test("all-transient forced-tool exhaustion releases the claim under the fence, then rejects", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const transient = Object.assign(new Error("upstream unavailable"), {
    stageErrorDetail: { kind: "forced_tool_exhaustion", message: "upstream unavailable", attempts: [{ attempt: 0, kind: "network" }, { attempt: 1, kind: "http", status: 503 }] }
  });
  const h = makeHarness({
    session,
    overrides: { outline: { model: "m", propose: async () => { throw transient; } } }
  });
  await assert.rejects(h.run(), /upstream unavailable/);
  assert.equal(h.releases, 1, "claim released for the supervisor's bounded retry");
  assert.equal(h.failures, 0, "not marked failed");
  assert.equal(h.published.length, 0);
});

test("a deterministic model failure marks failed under the fence, then rejects", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const deterministic = Object.assign(new Error("model deviated"), {
    stageErrorDetail: { kind: "forced_tool_exhaustion", message: "model deviated", attempts: [{ attempt: 0, kind: "network" }, { attempt: 1, kind: "invalid_arguments" }] }
  });
  const h = makeHarness({
    session,
    overrides: { outline: { model: "m", propose: async () => { throw deterministic; } } }
  });
  await assert.rejects(h.run(), /model deviated/);
  assert.equal(h.failures, 1);
  assert.equal(h.releases, 0);
});

test("a missing or mismatched claim writes NOTHING and stops before neural spend", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  for (const detour of [
    { claimToken: "someone-else" },
    { status: "ready" as const }
  ]) {
    const h = makeHarness({ session, detour });
    await assert.rejects(h.run(), /claim lost/);
    assert.equal(h.sessionReads, 0, "no Study Session read after claim loss");
    assert.equal(h.outlineInputs.length, 0, "no neural spend after claim loss");
    assert.equal(h.releases + h.failures, 0, "no detour state written");
  }
});

test("a false fenced publish is claim loss: no markFailed overwrite of the new owner's state", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const writes: string[] = [];
  const h = makeHarness({
    session,
    overrides: {
      detours: {
        getById: async () => ({ detourId: "d-1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "parent", term: "Borrow checker", normalizedTerm: "borrow checker", status: "generating", latestOperationId: "op-1", claimToken: "op-1", steps: [] }),
        publishReady: async () => { writes.push("publish"); return false; },
        releaseClaim: async () => { writes.push("release"); return true; },
        markFailed: async () => { writes.push("fail"); return true; }
      }
    }
  });
  await assert.rejects(h.run(), /claim lost/);
  assert.deepEqual(writes, ["publish"], "no release or markFailed after the fence rejected");
});

// --- 8. Removed exports are gone -----------------------------------------------

test("removed helper/context/dependency exports are absent from the package barrel", async () => {
  const barrel = await import("./index") as Record<string, unknown>;
  for (const removed of ["runScaffoldGeneration", "resolveExactMatch", "buildScaffoldNodePayload"]) {
    assert.equal(barrel[removed], undefined, `${removed} must not be exported`);
  }
  assert.equal(typeof barrel.createScaffoldGeneration, "function");
});

test("a failed fenced terminal write does not overwrite the original error", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    overrides: {
      outline: { model: "m", propose: async () => { throw new Error("original deterministic failure"); } },
      detours: {
        getById: async () => ({ detourId: "d-1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "parent", term: "Borrow checker", normalizedTerm: "borrow checker", status: "generating", latestOperationId: "op-1", claimToken: "op-1", steps: [] }),
        publishReady: async () => true,
        releaseClaim: async () => true,
        markFailed: async () => { throw new Error("fence lost during terminal write"); }
      }
    }
  });
  await assert.rejects(h.run(), /original deterministic failure/);
});

// --- 7. Honest operation timeline ---------------------------------------------

test("the reporter sees begin-with-config-hash, the complete stage order, and a SUCCEEDED terminal only on ready", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({ session });
  await h.run();
  assert.deepEqual(h.beginConfigHashes, ["hash-under-test"]);
  const stages = h.reporterEvents.filter((event) => event.kind === "enter").map((event) => event.detail);
  assert.deepEqual(stages, [
    "scaffold-outline-generation",
    "knowledge-boundary-probe",
    "grounding-generation",
    "scaffold-content-generation",
    "scaffold-content-congruence"
  ]);
  assert.deepEqual(h.reporterEvents.at(-1), { kind: "complete", detail: "succeeded" });
});

test("a failed detour produces a FAILED — not succeeded — operation timeline", async () => {
  const session = fakeSession({ nodes: [parentNode()], stateByNode: { parent: "frontier" } });
  const h = makeHarness({
    session,
    boundaryLabels: ["Affine types"]
  });
  await assert.rejects(h.run(), /No safe Support Step survived/);
  assert.deepEqual(h.reporterEvents.at(-1), { kind: "complete", detail: "failed" });
  assert.equal(h.failures, 1);
});
