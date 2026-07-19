import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ArtifactEnvelope,
  ConceptDifficulty,
  DerivedGraphLayer,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GeneratedGroundingBundle,
  SynthesizedConcept,
  WholeSetOrdering
} from "@lrnki/domain-core";
import type {
  ConceptSetSynthesisPort,
  DifficultyPort,
  EnrichmentRunStorePort,
  GroundingFactualityRevisionPort,
  GroundingGenerationPort,
  GroundingVerificationAnsweringPort,
  GroundingVerificationQuestionPlanningPort,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort,
  PrerequisiteOrderingPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { runSyntheticGeneration } from "./runSyntheticGeneration";

// --- Fakes (rule 11: deterministic envelopes, no network) ------------------

function fakeSynthesis(concepts: SynthesizedConcept[]): ConceptSetSynthesisPort {
  return { model: "fake-synth", async synthesize() { return concepts; } };
}

// A concept whose label is in `boundaryLabels` returns a DISTINCT answer every draw
// (dispersion → boundary); any other concept returns the SAME answer every draw
// (agreement → core_knowledge).
function fakeProbe(boundaryLabels: Set<string>): KnowledgeBoundaryProbePort {
  const counters = new Map<string, number>();
  return {
    model: "fake-probe",
    async probe({ conceptLabel }) {
      if (boundaryLabels.has(conceptLabel)) {
        const n = (counters.get(conceptLabel) ?? 0) + 1;
        counters.set(conceptLabel, n);
        return { answer: `${conceptLabel}#${n}` };
      }
      return { answer: `${conceptLabel} is a stable concept.` };
    }
  };
}

// Within one embed() call, identical answer strings share a basis dimension (cosine 1),
// distinct strings are orthogonal (cosine 0) — so a core concept's K identical draws score
// agreement 1 and a boundary concept's K distinct draws score 0.
function fakeEmbedding(): NodeEmbeddingPort {
  return {
    model: "fake-embedding",
    async embed(texts: string[]) {
      const uniq = [...new Set(texts)];
      const indexOf = new Map(uniq.map((t, i) => [t, i] as const));
      const dim = Math.max(uniq.length, 1);
      return texts.map((t) => {
        const v = new Array<number>(dim).fill(0);
        v[indexOf.get(t)!] = 1;
        return v;
      });
    }
  };
}

function fakeGrounding(): GroundingGenerationPort {
  return {
    model: "fake-grounding",
    async generate(input): Promise<GeneratedGroundingBundle> {
      const notApplicable = { disposition: "not_applicable_by_grounding" as const, rationale: "generated" };
      return {
        derivedNodeId: input.derivedNodeId,
        groundingOrigin: "llm_grounded",
        definitions: [{ passageType: "definition", text: `${input.nodeLabel} means X.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }],
        mentions: [{ passageType: "mention", text: `${input.nodeLabel} relates to the topic.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }],
        scaffoldedAnchorConceptIds: [],
        generatingModel: "fake-grounding",
        rationale: "generated for a synthetic topic concept"
      };
    }
  };
}

function fakeVerificationQuestionPlanning(
  inspect?: (input: Parameters<GroundingVerificationQuestionPlanningPort["plan"]>[0]) => void
): GroundingVerificationQuestionPlanningPort {
  return {
    model: "fake-independent-planner",
    async plan(input) {
      inspect?.(input);
      return [...input.draft.definitions, ...input.draft.mentions].map((_, passageIndex) => ({
        passageIndex,
        question: `What fact establishes passage ${passageIndex} for ${input.nodeLabel}?`
      }));
    }
  };
}

function fakeVerificationAnswering(
  inspect?: (input: Parameters<GroundingVerificationAnsweringPort["answer"]>[0]) => void
): GroundingVerificationAnsweringPort {
  return {
    model: "fake-independent-answerer",
    async answer(input) {
      inspect?.(input);
      return input.questions.map((question) => `Independent answer to: ${question}`);
    }
  };
}

function fakeGroundingRevision(
  inspect?: (input: Parameters<GroundingFactualityRevisionPort["revise"]>[0]) => void
): GroundingFactualityRevisionPort {
  return {
    model: "fake-independent-reviser",
    async revise(input) {
      inspect?.(input);
      return {
        disposition: "accepted",
        bundle: {
          ...input.draft,
          rationale: "atomic facts reviewed against draft-blind answers; no passage added"
        }
      };
    }
  };
}

// Orders the two sorted nodes as 1 -> 2 (a single certain edge) when there are >=2 nodes.
function fakeOrdering(): PrerequisiteOrderingPort {
  return {
    model: "fake-ordering",
    async order(input): Promise<WholeSetOrdering> {
      if (input.nodes.length < 2) return { edges: [] };
      return { edges: [{ prerequisiteNumber: 1, dependentNumber: 2, confidence: 0.95, rationale: "mock" }] };
    }
  };
}

function fakeDifficulty(): DifficultyPort {
  return {
    method: "fake-difficulty",
    async score(input: { nodes: DifficultyNodeContext[] }): Promise<ConceptDifficulty[]> {
      return input.nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0.5, method: "fake-difficulty", components: {}, neuralRationale: "mock" }));
    }
  };
}

function capturingStore(): { store: EnrichmentRunStorePort; persisted: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> }[] } {
  const persisted: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> }[] = [];
  const store: EnrichmentRunStorePort = {
    async persist(input) { persisted.push(input); },
    async getLayer() { return undefined; },
    async nonCoreRescueCandidates() { return []; }
  };
  return { store, persisted };
}

let nodeCounter = 0;
const seqNodeId = () => `node-${++nodeCounter}`;

function baseInput(overrides: Partial<Parameters<typeof runSyntheticGeneration>[0]> = {}) {
  return {
    enrichmentId: "synth-1",
    topic: "Some Topic",
    declaredDomain: "some domain",
    conceptSetSynthesis: fakeSynthesis([
      { conceptKey: "a", canonicalLabel: "Concept A", aliases: [] },
      { conceptKey: "b", canonicalLabel: "Concept B", aliases: ["B-prime"] }
    ]),
    knowledgeBoundaryProbe: fakeProbe(new Set()),
    embedding: fakeEmbedding(),
    groundingGeneration: fakeGrounding(),
    groundingVerificationQuestionPlanning: fakeVerificationQuestionPlanning(),
    groundingVerificationAnswering: fakeVerificationAnswering(),
    groundingFactualityRevision: fakeGroundingRevision(),
    prerequisiteOrdering: fakeOrdering(),
    difficulty: fakeDifficulty(),
    enrichmentStore: capturingStore().store,
    newNodeId: seqNodeId,
    ...overrides
  };
}

test("a topic yields a layer of llm_grounded synthetic_primary nodes, zero anchors, null version (AE1, R3/R4)", async () => {
  const { store, persisted } = capturingStore();
  const layer = await runSyntheticGeneration(baseInput({ enrichmentStore: store }));

  assert.equal(layer.graphVersionId, null);
  assert.equal(layer.derivedNodes.length, 2);
  for (const node of layer.derivedNodes) {
    assert.equal(node.nodeKind, "enrichment");
    assert.equal(node.groundingOrigin, "llm_grounded");
    assert.equal(node.role, "synthetic_primary");
    assert.ok(!("conceptId" in node), "a synthetic layer has no anchor projections");
  }
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].layer.graphVersionId, null);
  assert.equal(persisted[0].artifact.graphVersionId, undefined);
});

test("a boundary concept is an uncertain disposition, not a trusted node (AE2)", async () => {
  const { store, persisted } = capturingStore();
  const layer = await runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    knowledgeBoundaryProbe: fakeProbe(new Set(["Concept B"]))
  }));

  // Only the core concept became a node.
  assert.equal(layer.derivedNodes.length, 1);
  assert.equal(layer.derivedNodes[0].canonicalLabel, "Concept A");

  const dispositions = persisted[0].artifact.payload.syntheticProbeDispositions ?? [];
  const boundary = dispositions.find((d) => d.canonicalLabel === "Concept B");
  assert.ok(boundary);
  assert.equal(boundary!.disposition, "boundary");
  assert.equal(boundary!.derivedNodeId, null);
  const core = dispositions.find((d) => d.canonicalLabel === "Concept A");
  assert.equal(core!.disposition, "core_knowledge");
  assert.ok(core!.derivedNodeId);
});

test("no node carries a source citation; every node carries a Grounding Bundle (AE3, R3)", async () => {
  const { store, persisted } = capturingStore();
  const layer = await runSyntheticGeneration(baseInput({ enrichmentStore: store }));

  for (const node of layer.derivedNodes) {
    assert.ok(node.groundingOrigin === "llm_grounded" && "groundingBundle" in node);
    for (const passage of [...node.groundingBundle.definitions, ...node.groundingBundle.mentions]) {
      assert.equal(passage.verbatimCheck.disposition, "not_applicable_by_grounding");
    }
  }
  for (const disposition of persisted[0].artifact.payload.groundingDispositions) {
    assert.equal(disposition.outcome, "not_applicable_by_grounding");
  }
});

test("grounding is reviewed through claim-targeted questions answered without draft context", async () => {
  const planned: Parameters<GroundingVerificationQuestionPlanningPort["plan"]>[0][] = [];
  const answered: Parameters<GroundingVerificationAnsweringPort["answer"]>[0][] = [];
  const reviewed: Parameters<GroundingFactualityRevisionPort["revise"]>[0][] = [];
  const layer = await runSyntheticGeneration(baseInput({
    groundingVerificationQuestionPlanning: fakeVerificationQuestionPlanning((input) => planned.push(input)),
    groundingVerificationAnswering: fakeVerificationAnswering((input) => answered.push(input)),
    groundingFactualityRevision: fakeGroundingRevision((input) => reviewed.push(input))
  }));

  assert.equal(planned.length, 2);
  assert.equal(planned[0].draft.generatingModel, "fake-grounding", "planning sees the draft");
  assert.equal(answered.length, 2);
  assert.deepEqual(Object.keys(answered[0]).sort(), ["declaredDomain", "nodeLabel", "questions", "topic"], "answering has no draft field");
  assert.equal(answered[0].questions.length, 2);
  assert.equal(reviewed.length, 2);
  assert.equal(reviewed[0].verificationAnswers.length, 2);
  assert.equal(reviewed[0].verificationAnswers[0].passageIndex, 0);
  assert.match(reviewed[0].verificationAnswers[0].answer, /Independent answer/);
  for (const node of layer.derivedNodes) {
    assert.equal(node.groundingOrigin, "llm_grounded");
    assert.equal(node.groundingBundle.generatingModel, "fake-grounding");
    assert.match(node.groundingBundle.definitions[0].text, /means X/);
  }
});

test("a wholly rejected draft is selectively regenerated and accepted nodes keep canonical concept order", async () => {
  const generationCounts = new Map<string, number>();
  const generationFeedback = new Map<string, Array<string | undefined>>();
  const planned: string[] = [];
  const answered: string[] = [];
  const groundingGeneration: GroundingGenerationPort = {
    model: "fake-redrafting-grounding",
    async generate(input) {
      generationFeedback.set(input.nodeLabel, [...(generationFeedback.get(input.nodeLabel) ?? []), input.rejectionFeedback]);
      const attempt = (generationCounts.get(input.nodeLabel) ?? 0) + 1;
      generationCounts.set(input.nodeLabel, attempt);
      const draft = await fakeGrounding().generate(input);
      return {
        ...draft,
        definitions: draft.definitions.map((passage) => ({
          ...passage,
          text: `${passage.text} Draft attempt ${attempt}.`
        }))
      };
    }
  };
  const groundingFactualityRevision: GroundingFactualityRevisionPort = {
    model: "fake-selective-reviser",
    async revise(input) {
      if (input.nodeLabel === "Concept A" && input.draft.definitions[0].text.includes("attempt 1")) {
        return { disposition: "rejected", rationale: "every definition contained an exact-span-grounded defect" };
      }
      return { disposition: "accepted", bundle: input.draft };
    }
  };

  const layer = await runSyntheticGeneration(baseInput({
    groundingGeneration,
    groundingVerificationQuestionPlanning: fakeVerificationQuestionPlanning((input) => planned.push(input.nodeLabel)),
    groundingVerificationAnswering: fakeVerificationAnswering((input) => answered.push(input.nodeLabel)),
    groundingFactualityRevision
  }));

  assert.deepEqual(Object.fromEntries(generationCounts), { "Concept A": 2, "Concept B": 1 });
  assert.deepEqual(generationFeedback.get("Concept A"), [undefined, "every definition contained an exact-span-grounded defect"]);
  assert.deepEqual(generationFeedback.get("Concept B"), [undefined]);
  assert.deepEqual(planned, ["Concept A", "Concept B", "Concept A"]);
  assert.deepEqual(answered, ["Concept A", "Concept B", "Concept A"]);
  assert.deepEqual(layer.derivedNodes.map((node) => node.canonicalLabel), ["Concept A", "Concept B"]);
  const conceptA = layer.derivedNodes[0];
  assert.ok(conceptA.groundingOrigin === "llm_grounded" && "groundingBundle" in conceptA);
  assert.match(conceptA.groundingBundle.definitions[0].text, /Draft attempt 2/);
});

test("exhausting the grounding draft budget fails without persistence", async () => {
  const { store, persisted } = capturingStore();
  let revisionCalls = 0;
  const rejectingRevision: GroundingFactualityRevisionPort = {
    model: "fake-rejecting-reviser",
    async revise() {
      revisionCalls += 1;
      return { disposition: "rejected", rationale: "every definition was rejected" };
    }
  };

  await assert.rejects(
    () => runSyntheticGeneration(baseInput({
      conceptSetSynthesis: fakeSynthesis([{ conceptKey: "a", canonicalLabel: "Concept A", aliases: [] }]),
      groundingFactualityRevision: rejectingRevision,
      enrichmentStore: store
    })),
    /exhausted 2 draft attempts/
  );

  assert.equal(revisionCalls, 2);
  assert.equal(persisted.length, 0);
});

test("an incomplete verification plan fails before answering or persistence", async () => {
  const { store, persisted } = capturingStore();
  let answeringCalled = false;
  const incompletePlanning: GroundingVerificationQuestionPlanningPort = {
    model: "fake-incomplete-planner",
    async plan() {
      return [{ passageIndex: 0, question: "What establishes the definition?" }];
    }
  };

  await assert.rejects(
    () => runSyntheticGeneration(baseInput({
      enrichmentStore: store,
      groundingVerificationQuestionPlanning: incompletePlanning,
      groundingVerificationAnswering: fakeVerificationAnswering(() => { answeringCalled = true; })
    })),
    /did not cover every passage/
  );

  assert.equal(answeringCalled, false);
  assert.equal(persisted.length, 0);
});

test("a factuality reviewer cannot introduce learner-facing passage text or persist a partial layer", async () => {
  const { store, persisted } = capturingStore();
  const rewritingRevision: GroundingFactualityRevisionPort = {
    model: "fake-rewriting-reviewer",
    async revise(input) {
      return {
        disposition: "accepted",
        bundle: {
          ...input.draft,
          definitions: [{
            ...input.draft.definitions[0],
            text: "A verifier-authored replacement claim."
          }]
        }
      };
    }
  };

  await assert.rejects(
    () => runSyntheticGeneration(baseInput({
      enrichmentStore: store,
      groundingFactualityRevision: rewritingRevision
    })),
    /introduced new passage text/
  );

  assert.equal(persisted.length, 0);
});

// The one handoff contract (plan 2026-07-11-001 U4/R11): the synthetic facts the front
// half prepares — grounded nodes, null version, probe dispositions, and the combined
// summary hook — reach the completion seam, and the producer returns the layer completion
// persisted. The shared back-half policy matrix itself is proved once in
// completeDerivedGraphLayer.test.ts, never re-asserted here.
test("hands the synthetic contribution to the completion seam and returns its layer", async () => {
  const { store, persisted } = capturingStore();
  let summary: unknown;
  const layer = await runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    knowledgeBoundaryProbe: fakeProbe(new Set(["Concept B"])),
    onSummary: (value) => {
      summary = value;
    }
  }));
  assert.deepEqual(summary, { concepts: 2, core: 1, boundary: 1, nodes: 1, committedEdges: 0, uncertainEdges: 0 });
  assert.equal(persisted.length, 1);
  assert.equal(layer, persisted[0].layer, "the producer returns the layer completion persisted");
  assert.equal(layer.difficulties.length, layer.derivedNodes.length);
  assert.equal(persisted[0].artifact.payload.syntheticProbeDispositions?.length, 2);
});

test("a stage failure marks the operation failed with a readable timeline and persists no partial layer", async () => {
  const events: string[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation() { events.push("begin"); },
    async enterStage(i) { events.push(`enter:${i.stage}`); },
    async recordProgress() {},
    async completeStage(i) { events.push(`stage:${i.stage}:${i.ok ? "ok" : "fail"}`); },
    async completeOperation(i) { events.push(`op:${i.status}`); },
    async touch() {}
  };
  const { store, persisted } = capturingStore();
  const throwingSynthesis: ConceptSetSynthesisPort = {
    model: "boom",
    async synthesize() { throw new Error("synthesis exhausted"); }
  };

  await assert.rejects(() => runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    conceptSetSynthesis: throwingSynthesis,
    reporter
  })), /synthesis exhausted/);

  assert.equal(persisted.length, 0, "no partial layer is persisted on a stage failure");
  assert.ok(events.includes("stage:concept-set-synthesis:fail"));
  assert.ok(events.includes("op:failed"));
});
