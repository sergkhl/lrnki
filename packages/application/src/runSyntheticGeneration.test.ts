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
  PrerequisiteOrderingPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import type {
  GroundingAdmissionCandidate,
  GroundingAdmissionOutcome,
  SourceLessGroundingAdmission
} from "./sourceLessGroundingAdmission";
import { runSyntheticGeneration } from "./runSyntheticGeneration";

function fakeSynthesis(concepts: SynthesizedConcept[]): ConceptSetSynthesisPort {
  return { model: "fake-synth", async synthesize() { return concepts; } };
}

function groundingBundle(label: string): GeneratedGroundingBundle {
  const notApplicable = { disposition: "not_applicable_by_grounding" as const, rationale: "generated" };
  return {
    groundingOrigin: "llm_grounded",
    definitions: [{
      passageType: "definition",
      text: `${label} means X.`,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: notApplicable
    }],
    mentions: [{
      passageType: "mention",
      text: `${label} relates to the topic.`,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: notApplicable
    }],
    groundingAnchorReferences: [],
    generatingModel: "fake-grounding",
    rationale: "generated for a synthetic topic concept"
  };
}

const coreProbe = {
  disposition: "core_knowledge" as const,
  agreementScore: 1,
  rationale: "stable answers"
};
const boundaryProbe = {
  disposition: "boundary" as const,
  agreementScore: 0,
  rationale: "dispersed answers"
};

function fakeAdmission(input: {
  boundaryKeys?: readonly string[];
  rejectedKeys?: readonly string[];
  inspect?: (candidates: readonly GroundingAdmissionCandidate[]) => void;
} = {}): SourceLessGroundingAdmission {
  const boundary = new Set(input.boundaryKeys ?? []);
  const rejected = new Set(input.rejectedKeys ?? []);
  return {
    forOperation() {
      return {
        async admitBatch(candidates) {
          input.inspect?.(candidates);
          return candidates.map((candidate): GroundingAdmissionOutcome => {
            if (boundary.has(candidate.candidateKey)) {
              return {
                candidateKey: candidate.candidateKey,
                disposition: "held_out",
                reason: "knowledge_boundary",
                probe: boundaryProbe
              };
            }
            if (rejected.has(candidate.candidateKey)) {
              return {
                candidateKey: candidate.candidateKey,
                disposition: "rejected",
                reason: "grounding_verification_exhausted",
                probe: coreProbe,
                rationale: "definitions remained non-factual"
              };
            }
            return {
              candidateKey: candidate.candidateKey,
              disposition: "admitted",
              probe: coreProbe,
              bundle: groundingBundle(candidate.canonicalLabel)
            };
          });
        }
      };
    }
  };
}

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
      return input.nodes.map((node) => ({
        derivedNodeId: node.derivedNodeId,
        score: 0.5,
        method: "fake-difficulty",
        components: {},
        neuralRationale: "mock"
      }));
    }
  };
}

function capturingStore(): {
  store: EnrichmentRunStorePort;
  persisted: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> }[];
} {
  const persisted: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> }[] = [];
  const store: EnrichmentRunStorePort = {
    async persist(input) { persisted.push(input); },
    async getLayer() { return undefined; },
    async nonCoreRescueCandidates() { return []; }
  };
  return { store, persisted };
}

function baseInput(overrides: Partial<Parameters<typeof runSyntheticGeneration>[0]> = {}) {
  let nodeCounter = 0;
  return {
    enrichmentId: "synth-1",
    topic: "Some Topic",
    declaredDomain: "some domain",
    conceptSetSynthesis: fakeSynthesis([
      { conceptKey: "a", canonicalLabel: "Concept A", aliases: [] },
      { conceptKey: "b", canonicalLabel: "Concept B", aliases: ["B-prime"] }
    ]),
    sourceLessGroundingAdmission: fakeAdmission(),
    prerequisiteOrdering: fakeOrdering(),
    difficulty: fakeDifficulty(),
    enrichmentStore: capturingStore().store,
    newNodeId: () => `node-${++nodeCounter}`,
    ...overrides
  };
}

test("Synthetic Topic Generation crosses one batch admission interface and assembles owner-neutral admitted bundles", async () => {
  const { store, persisted } = capturingStore();
  const seen: GroundingAdmissionCandidate[][] = [];
  const layer = await runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    sourceLessGroundingAdmission: fakeAdmission({ inspect: (candidates) => seen.push([...candidates]) })
  }));

  assert.equal(seen.length, 1, "the caller delegates one finished batch instead of orchestrating neural ports");
  assert.deepEqual(seen[0], [
    { candidateKey: "a", canonicalLabel: "Concept A", declaredDomain: "some domain", context: { kind: "originating_topic", topic: "Some Topic" } },
    { candidateKey: "b", canonicalLabel: "Concept B", declaredDomain: "some domain", context: { kind: "originating_topic", topic: "Some Topic" } }
  ]);
  assert.equal(layer.graphVersionId, null);
  assert.deepEqual(layer.derivedNodes.map((node) => node.canonicalLabel), ["Concept A", "Concept B"]);
  for (const node of layer.derivedNodes) {
    assert.equal(node.nodeKind, "enrichment");
    assert.equal(node.role, "synthetic_primary");
    assert.ok(node.groundingOrigin === "llm_grounded" && !("derivedNodeId" in node.groundingBundle));
  }
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].artifact.graphVersionId, undefined);
});

test("a measured knowledge-boundary holdout stays inspectable and never becomes a node", async () => {
  const { store, persisted } = capturingStore();
  const layer = await runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    sourceLessGroundingAdmission: fakeAdmission({ boundaryKeys: ["b"] })
  }));

  assert.deepEqual(layer.derivedNodes.map((node) => node.canonicalLabel), ["Concept A"]);
  const dispositions = persisted[0].artifact.payload.syntheticProbeDispositions ?? [];
  assert.deepEqual(dispositions.map((disposition) => ({
    key: disposition.conceptKey,
    disposition: disposition.disposition,
    score: disposition.agreementScore,
    node: disposition.derivedNodeId
  })), [
    { key: "a", disposition: "core_knowledge", score: 1, node: "node-1" },
    { key: "b", disposition: "boundary", score: 0, node: null }
  ]);
});

test("an exhausted factual rejection fails the whole operation before persistence", async () => {
  const { store, persisted } = capturingStore();
  let nodeIds = 0;
  await assert.rejects(() => runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    sourceLessGroundingAdmission: fakeAdmission({ rejectedKeys: ["b"] }),
    newNodeId: () => `node-${++nodeIds}`
  })), /rejected Synthetic Topic Generation.*b: definitions remained non-factual/);

  assert.equal(nodeIds, 0, "node identity is not minted for a batch that cannot publish atomically");
  assert.equal(persisted.length, 0);
});

test("deduplication happens before admission and preserves the first concept identity", async () => {
  const seen: GroundingAdmissionCandidate[][] = [];
  const layer = await runSyntheticGeneration(baseInput({
    conceptSetSynthesis: fakeSynthesis([
      { conceptKey: "first", canonicalLabel: "  Concept A  ", aliases: ["first"] },
      { conceptKey: "duplicate", canonicalLabel: "concept a", aliases: ["duplicate"] },
      { conceptKey: "empty", canonicalLabel: "  ", aliases: [] }
    ]),
    sourceLessGroundingAdmission: fakeAdmission({ inspect: (candidates) => seen.push([...candidates]) })
  }));

  assert.deepEqual(seen[0].map((candidate) => candidate.candidateKey), ["first"]);
  assert.deepEqual(layer.derivedNodes.map((node) => node.aliases), [["first"]]);
});

test("the Synthetic contribution reaches shared completion with exact summary counts", async () => {
  const { store, persisted } = capturingStore();
  let summary: unknown;
  const layer = await runSyntheticGeneration(baseInput({
    enrichmentStore: store,
    sourceLessGroundingAdmission: fakeAdmission({ boundaryKeys: ["b"] }),
    onSummary: (value) => { summary = value; }
  }));

  assert.deepEqual(summary, { concepts: 2, core: 1, boundary: 1, nodes: 1, committedEdges: 0, uncertainEdges: 0 });
  assert.equal(layer, persisted[0].layer);
  assert.equal(layer.difficulties.length, layer.derivedNodes.length);
});

test("Declared Domain inference completes before the admission batch and persists its result", async () => {
  const seenDomains: string[] = [];
  const savedDomains: string[] = [];
  await runSyntheticGeneration(baseInput({
    declaredDomain: null,
    declaredDomainInference: { model: "fake-domain", async infer() { return { declaredDomain: "  molecular biology  " }; } },
    onDeclaredDomain: async (domain) => { savedDomains.push(domain); },
    sourceLessGroundingAdmission: fakeAdmission({
      inspect: (candidates) => seenDomains.push(...candidates.map((candidate) => candidate.declaredDomain))
    })
  }));
  assert.deepEqual(savedDomains, ["molecular biology"]);
  assert.deepEqual(seenDomains, ["molecular biology", "molecular biology"]);
});

test("a stage failure marks the operation failed and persists no partial layer", async () => {
  const events: string[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation() { events.push("begin"); },
    async enterStage(input) { events.push(`enter:${input.stage}`); },
    async recordProgress() {},
    async completeStage(input) { events.push(`stage:${input.stage}:${input.ok ? "ok" : "fail"}`); },
    async completeOperation(input) { events.push(`op:${input.status}`); },
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

  assert.equal(persisted.length, 0);
  assert.ok(events.includes("stage:concept-set-synthesis:fail"));
  assert.ok(events.includes("op:failed"));
});
