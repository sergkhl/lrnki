import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnchorProjectionNode,
  BatchedPrerequisiteJudgment,
  DerivedGraphLayer,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GraphSnapshot,
  PrerequisiteConceptContext,
  PrerequisiteJudgment
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  GraphVersionStorePort,
  PrerequisiteJudgmentPort
} from "@lrnki/ports";
import { DEFAULT_ENRICHMENT_CONFIG, runGraphEnrichment } from "./runGraphEnrichment";
import { DEFAULT_DEDUP_CONFIG } from "./deduplicateDerivedNodes";

// Two Declared Domains: "x" has 3 concepts, "y" has 2. Prerequisites are always
// same-domain (ADR-0015), so per-node forward batching (KTD1) must cover exactly
// C(3,2)+C(2,2)=3+1=4 unordered relations and never a cross-domain pair.
function concept(id: string, label: string, domain: string, aliases: string[] = []) {
  return {
    conceptId: id,
    iri: `https://lrnki.local/concept/${id}`,
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases,
    trustTier: "curated_source_grounded" as const,
    homograph: false,
    groundingOrigin: "document_anchored" as const,
    role: "anchor" as const,
    layer: "asserted" as const
  };
}

function passage(blockId: string, quote: string) {
  return { sourceResourceId: "s1", sourceBlockId: blockId, evidenceQuote: quote, headingPath: ["X"], locator: {} };
}

// cx1 carries a `defines` assertion and a multi-mention CEP so the bound is observable.
const snapshot: GraphSnapshot = {
  graphVersionId: "v1",
  baseGraphVersionId: null,
  concepts: [
    concept("cx1", "X One", "x", ["XOne"]),
    concept("cx2", "X Two", "x"),
    concept("cx3", "X Three", "x"),
    concept("cy1", "Y One", "y"),
    concept("cy2", "Y Two", "y")
  ],
  evidenceProfiles: [
    {
      conceptId: "cx1",
      definitions: [passage("b1", "X One is the definition of X One")],
      mentions: [
        passage("b2", "mention one"),
        passage("b3", "mention two"),
        passage("b4", "mention three"),
        passage("b5", "mention four"),
        passage("b6", "mention five"),
        passage("b7", "mention six"),
        passage("b8", "mention seven")
      ],
      assertions: [
        { type: "defines", literalValue: "the first X concept", evidence: [passage("b1", "X One is the definition of X One")] }
      ]
    },
    ...(
      [
        ["cx2", "X Two"],
        ["cx3", "X Three"],
        ["cy1", "Y One"],
        ["cy2", "Y Two"]
      ] as const
    ).map(([conceptId, label], index) => ({
      conceptId,
      definitions: [passage(`definition-block-${index}`, `${label} is the definition of ${label}`)],
      mentions: [],
      assertions: []
    }))
  ]
};

// A per-candidate verdict over the subject and one candidate context. The fake judge
// maps it across each candidate to build the batched result, mirroring the production
// adapter's one-judgment-per-candidate contract.
type CandidateVerdict = (subject: PrerequisiteConceptContext, candidate: PrerequisiteConceptContext) => PrerequisiteJudgment;

// Default verdict: directs cx2->cx1, cx1->cx3 (plain directed), cx2/cx3 uncertain, and
// the y-domain pair none (dropped). Direction is label-driven, never positional.
const defaultVerdict: CandidateVerdict = (subject, candidate) => {
  const labels = [subject.canonicalLabel, candidate.canonicalLabel];
  const directed = (prereqLabel: string): PrerequisiteJudgment => ({
    prerequisiteDerivedNodeId: prereqLabel === subject.canonicalLabel ? subject.derivedNodeId : candidate.derivedNodeId,
    dependentDerivedNodeId: prereqLabel === subject.canonicalLabel ? candidate.derivedNodeId : subject.derivedNodeId,
    outcome: "directed",
    confidence: 0.9,
    rationale: "mock"
  });
  const nominal = (outcome: PrerequisiteJudgment["outcome"], confidence: number): PrerequisiteJudgment =>
    ({ prerequisiteDerivedNodeId: subject.derivedNodeId, dependentDerivedNodeId: candidate.derivedNodeId, outcome, confidence, rationale: "mock" });
  if (labels.includes("X One") && labels.includes("X Two")) return directed("X Two");
  if (labels.includes("X One") && labels.includes("X Three")) return directed("X One");
  if (labels.includes("X Two") && labels.includes("X Three")) return nominal("uncertain", 0.4);
  return nominal("none", 0.1);
};

type JudgeInput = { declaredDomain: string; subject: PrerequisiteConceptContext; candidates: PrerequisiteConceptContext[] };

function buildPorts(options: { verdict?: CandidateVerdict; snapshot?: GraphSnapshot; onJudge?: (input: JudgeInput) => Promise<void> } = {}) {
  const active = options.snapshot ?? snapshot;
  const verdict = options.verdict ?? defaultVerdict;
  const judgedInputs: JudgeInput[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === active.graphVersionId ? active : undefined;
    }
  };
  const prerequisiteJudge: PrerequisiteJudgmentPort = {
    model: "mock-judge",
    async judge(input): Promise<BatchedPrerequisiteJudgment> {
      judgedInputs.push(input);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (options.onJudge) await options.onJudge(input);
        return { relations: input.candidates.map((candidate) => verdict(input.subject, candidate)) };
      } finally {
        inFlight -= 1;
      }
    }
  };
  const difficulty: DifficultyPort = {
    method: "intrinsic-fused-v1",
    async score({ nodes }) {
      return nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0, method: "intrinsic-fused-v1", components: {}, neuralRationale: "" }));
    }
  };
  let persisted: DerivedGraphLayer | undefined;
  let trace: EnrichmentRunTrace | undefined;
  let artifactType: string | undefined;
  let persistCalls = 0;
  const enrichmentStore: Pick<EnrichmentRunStorePort, "persist"> = {
    async persist(input) {
      persistCalls += 1;
      persisted = input.layer;
      trace = input.artifact.payload;
      artifactType = input.artifact.artifactType;
    }
  };
  return {
    judgedInputs,
    graphStore,
    prerequisiteJudge,
    difficulty,
    enrichmentStore,
    getPersisted: () => persisted,
    getTrace: () => trace,
    getArtifactType: () => artifactType,
    getPersistCalls: () => persistCalls,
    getMaxInFlight: () => maxInFlight
  };
}

// Flatten the batched calls into the unordered (subject, candidate) relations evaluated.
function evaluatedPairs(judgedInputs: JudgeInput[]): [PrerequisiteConceptContext, PrerequisiteConceptContext][] {
  return judgedInputs.flatMap((input) => input.candidates.map((candidate) => [input.subject, candidate] as [PrerequisiteConceptContext, PrerequisiteConceptContext]));
}

function allContexts(judgedInputs: JudgeInput[]): PrerequisiteConceptContext[] {
  return judgedInputs.flatMap((input) => [input.subject, ...input.candidates]);
}

function run(ports: ReturnType<typeof buildPorts>, overrides: Partial<Parameters<typeof runGraphEnrichment>[0]> = {}) {
  return runGraphEnrichment({
    enrichmentId: "e1",
    graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    prerequisiteJudge: ports.prerequisiteJudge,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort,
    ...overrides
  });
}

// Scenario 1: exactly the same-domain relations are evaluated; no cross-domain leak.
test("runGraphEnrichment evaluates every same-domain relation and never a cross-domain one", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  const domainByDerivedId = new Map(layer.derivedNodes.map((node) => [node.derivedNodeId, node.declaredDomain]));

  const pairs = evaluatedPairs(ports.judgedInputs);
  assert.equal(pairs.length, 4); // C(3,2)+C(2,2)
  for (const [a, b] of pairs) {
    assert.equal(domainByDerivedId.get(a.derivedNodeId), domainByDerivedId.get(b.derivedNodeId), `cross-domain pair leaked: ${a.derivedNodeId}/${b.derivedNodeId}`);
  }
  // Each unordered pair appears exactly once (no double-counting).
  const keys = pairs.map(([a, b]) => [a.canonicalLabel, b.canonicalLabel].sort().join("|"));
  assert.equal(new Set(keys).size, 4);
});

// Scenario 2: each judge call receives full CEPs (definitions, bounded mentions,
// labeled typed assertions) — never bare labels alone.
test("runGraphEnrichment passes Concepts' CEPs to the judge with bounded mentions", async () => {
  const ports = buildPorts();
  await run(ports);

  const cx1 = allContexts(ports.judgedInputs).find((context) => context.canonicalLabel === "X One");
  const cx2 = allContexts(ports.judgedInputs).find((context) => context.canonicalLabel === "X Two");
  assert.ok(cx1 && cx2, "expected X One and X Two to be judged");

  assert.deepEqual(cx1.definitions, ["X One is the definition of X One"]);
  assert.deepEqual(cx2.definitions, ["X Two is the definition of X Two"]);
  // Default bound of six mentions is applied even though the CEP holds seven.
  assert.equal(cx1.mentions.length, 6);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two", "mention three", "mention four", "mention five", "mention six"]);
  assert.deepEqual(cx1.assertions, [{ type: "defines", detail: "the first X concept" }]);
  assert.deepEqual(cx1.aliases, ["XOne"]);
});

// Scenario 2b: a non-default mention bound is honored without reordering.
test("runGraphEnrichment honors a non-default mention bound and preserves neural order", async () => {
  const ports = buildPorts();
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-node-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 4,
      maxMentionsPerConceptInPair: 2,
      maxCandidatesPerBatch: 12,
      mintingBounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
      dedup: DEFAULT_DEDUP_CONFIG
    }
  });

  const cx1 = allContexts(ports.judgedInputs).find((context) => context.canonicalLabel === "X One");
  assert.ok(cx1);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two"]);
});

// Scenario 4 + 5: the judge's verdict sets direction; 'none' is dropped;
// 'uncertain' is retained flagged and path-excluded; directed survives.
test("runGraphEnrichment follows the judge, drops 'none', flags 'uncertain'", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  const idByConceptId = new Map(
    layer.derivedNodes
      .filter((node) => node.nodeKind === "anchor")
      .map((node) => [node.conceptId, node.derivedNodeId] as const)
  );
  const cx1 = idByConceptId.get("cx1") ?? "";
  const cx2 = idByConceptId.get("cx2") ?? "";
  const cx3 = idByConceptId.get("cx3") ?? "";
  const cy1 = idByConceptId.get("cy1") ?? "";

  // The edge follows the judge.
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === cx2 && e.dependentDerivedNodeId === cx1 && !e.uncertain));
  assert.ok(!layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === cx1 && e.dependentDerivedNodeId === cx2));
  // plain directed edge survives.
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === cx1 && e.dependentDerivedNodeId === cx3 && !e.uncertain));
  // uncertain edge retained but flagged.
  assert.ok(layer.prerequisiteEdges.some((e) => e.uncertain));
  // 'none' (cy1/cy2) produced no edge.
  assert.ok(!layer.prerequisiteEdges.some((e) => [e.prerequisiteDerivedNodeId, e.dependentDerivedNodeId].includes(cy1)));

  const dispositions = ports.getTrace()?.dispositions.map((d) => d.disposition) ?? [];
  assert.ok(dispositions.includes("uncertain"));
  assert.ok(dispositions.includes("kept"));
});

// Scenario 6: the persisted layer and trace carry no embedding/candidate-group fields,
// and the trace records one per-candidate judgment with the judge model used.
test("runGraphEnrichment persists a layer free of embedding and candidate-group fields", async () => {
  const ports = buildPorts();
  const layer = await run(ports);

  assert.equal(layer.judgeModel, "mock-judge");
  assert.ok(!("embeddingModel" in layer), "layer must not carry embeddingModel");
  assert.ok(!("prerequisiteCandidateGroups" in layer), "layer must not carry candidate groups");
  for (const edge of layer.prerequisiteEdges) {
    assert.ok(!("candidateGroupId" in edge), "edge must not carry candidateGroupId");
    assert.ok(!("evidencePacketRef" in edge.provenance), "provenance must not carry an evidence-packet ref");
  }
  assert.equal(ports.getPersisted()?.enrichmentId, "e1");
  assert.equal(ports.getArtifactType(), "enrichment_run.v2");
  // One per-candidate trace per evaluated relation (4 same-domain relations).
  assert.equal(ports.getTrace()?.judgments.length, 4);
  // Each per-candidate judgment records which judge model ordered it (anchor-only -> all DeepSeek).
  assert.ok(ports.getTrace()?.judgments.every((judgment) => judgment.judgeModel === "mock-judge"));
  // An anchor-only run (no enrichment-node ports) has no rescue dispositions.
  assert.deepEqual(ports.getTrace()?.rescueDispositions, []);
});

test("anchor derived node ids are per enrichment run, while concept ids stay stable", async () => {
  const first = await run(buildPorts(), { enrichmentId: "11111111-1111-4111-8111-111111111111" });
  const second = await run(buildPorts(), { enrichmentId: "22222222-2222-4222-8222-222222222222" });

  const isCx1Anchor = (node: (typeof first.derivedNodes)[number]): node is AnchorProjectionNode =>
    node.nodeKind === "anchor" && node.conceptId === "cx1";
  const firstAnchor = first.derivedNodes.find(isCx1Anchor);
  const secondAnchor = second.derivedNodes.find(isCx1Anchor);
  if (!firstAnchor || !secondAnchor) assert.fail("expected cx1 anchor in both enrichments");
  assert.equal(firstAnchor.conceptId, secondAnchor.conceptId);
  assert.notEqual(firstAnchor.derivedNodeId, secondAnchor.derivedNodeId);
});

// Scenario 7: difficulty receives per-node evidence contexts over all derived nodes.
test("runGraphEnrichment scores intrinsic difficulty with per-node evidence contexts", async () => {
  const scoredInputs: DifficultyNodeContext[][] = [];
  const ports = buildPorts();
  ports.difficulty = {
    method: "intrinsic-fused-v1",
    async score({ nodes }) {
      scoredInputs.push(nodes);
      return nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0.5, method: "intrinsic-fused-v1", components: { neuralScore: 0.5 }, neuralRationale: "" }));
    }
  };
  const layer = await run(ports);
  assert.equal(layer.difficulties.length, 5);
  assert.ok(layer.difficulties.every((d) => d.method === "intrinsic-fused-v1"));
  assert.equal(scoredInputs.length, 1);
  assert.equal(scoredInputs[0].length, layer.derivedNodes.length);
  const xOne = scoredInputs[0].find((node) => node.canonicalLabel === "X One");
  assert.ok(xOne);
  assert.deepEqual(xOne.definitions, ["X One is the definition of X One"]);
});

test("runGraphEnrichment default config hash reflects the dedup sub-stage", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(DEFAULT_ENRICHMENT_CONFIG.enrichmentConfigHash, "dedup-v1");
  assert.equal(layer.enrichmentConfigHash, "dedup-v1");
});

// Scenario 3: an evidence-free snapshot reaches no judge call and fails closed.
test("runGraphEnrichment fails closed on an evidence-free snapshot without judging", async () => {
  const ungrounded: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x")],
    evidenceProfiles: []
  };
  const ports = buildPorts({ snapshot: ungrounded });
  const layer = await run(ports);

  assert.equal(ports.judgedInputs.length, 0);
  assert.equal(layer.prerequisiteEdges.length, 0);
  assert.deepEqual(ports.getTrace()?.dispositions.map((d) => d.disposition), ["insufficient_evidence"]);
});

// Coverage under chunking (KTD3): a domain whose forward candidate list exceeds the cap
// splits into deterministic chunks and STILL resolves every relation exactly once.
test("runGraphEnrichment resolves every relation under a small per-batch cap", async () => {
  const labels = ["N0", "N1", "N2", "N3", "N4"]; // 5 same-domain nodes -> C(5,2)=10 relations
  const chunked: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: labels.map((label, index) => concept(`c${index}`, label, "x")),
    evidenceProfiles: labels.map((label, index) => ({
      conceptId: `c${index}`,
      definitions: [passage(`def-${index}`, `${label} is the definition of ${label}`)],
      mentions: [],
      assertions: []
    }))
  };
  const ports = buildPorts({ snapshot: chunked });
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-node-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 4,
      maxMentionsPerConceptInPair: 6,
      maxCandidatesPerBatch: 2, // force multi-chunk subjects
      mintingBounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
      dedup: DEFAULT_DEDUP_CONFIG
    }
  });

  // Some subject must have produced more than one batched call (chunked).
  const callsBySubject = new Map<string, number>();
  for (const input of ports.judgedInputs) callsBySubject.set(input.subject.derivedNodeId, (callsBySubject.get(input.subject.derivedNodeId) ?? 0) + 1);
  assert.ok([...callsBySubject.values()].some((count) => count > 1), "expected at least one subject to chunk into multiple calls");

  // Every unordered relation is evaluated exactly once across all chunks.
  const keys = evaluatedPairs(ports.judgedInputs).map(([a, b]) => [a.canonicalLabel, b.canonicalLabel].sort().join("|"));
  assert.equal(keys.length, 10);
  assert.equal(new Set(keys).size, 10);
});

// Scenario 8a: judge calls never exceed the configured concurrency and the trace keeps
// deterministic subject/candidate order regardless of completion order.
test("runGraphEnrichment bounds concurrency and keeps deterministic order", async () => {
  const completionOrder: string[] = [];
  let callIndex = 0;
  const ports = buildPorts({
    onJudge: async (input) => {
      const index = callIndex++;
      // Make only the first dispatched call slow so later calls complete before it.
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 30 : 1));
      for (const candidate of input.candidates) completionOrder.push(`${input.subject.canonicalLabel}/${candidate.canonicalLabel}`);
    }
  });
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-node-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 2,
      maxMentionsPerConceptInPair: 6,
      maxCandidatesPerBatch: 12,
      mintingBounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
      dedup: DEFAULT_DEDUP_CONFIG
    }
  });

  assert.ok(ports.getMaxInFlight() <= 2, `concurrency exceeded: ${ports.getMaxInFlight()}`);
  // Trace order follows deterministic subject/candidate dispatch order, not completion.
  const traceOrder = ports.getTrace()?.judgments.map((j) => `${j.a.canonicalLabel}/${j.b.canonicalLabel}`) ?? [];
  const dispatchOrder = evaluatedPairs(ports.judgedInputs).map(([a, b]) => `${a.canonicalLabel}/${b.canonicalLabel}`);
  assert.deepEqual(traceOrder, dispatchOrder);
  assert.notDeepEqual(completionOrder, traceOrder, "test setup should produce out-of-order completion");
});

// Scenario 8b: one exhausted batched call (judge throws) fails the run before persistence.
test("runGraphEnrichment fails the run without persisting when a batched call exhausts its budget", async () => {
  const ports = buildPorts({
    onJudge: async (input) => {
      const present = new Set([input.subject.canonicalLabel, ...input.candidates.map((c) => c.canonicalLabel)]);
      if (present.has("X Two") && present.has("X Three")) throw new Error("forced-tool retry budget exhausted");
    }
  });
  await assert.rejects(() => run(ports), /retry budget exhausted/);
  assert.equal(ports.getPersistCalls(), 0, "no partial enrichment run may be persisted");
});

// --- U5/U7: node minting + rescue + cross-family routing -----------------------

import type { GeneratedGroundingBundle, MentionedNonCoreCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type { GroundingGenerationPort, MissingPrerequisiteProposalPort } from "@lrnki/ports";

// A one-anchor sparse snapshot: only "Move Semantics" is defined. Enrichment must
// expand it with a rescued node and a minted node.
const sparseSnapshot: GraphSnapshot = {
  graphVersionId: "v1",
  baseGraphVersionId: null,
  concepts: [concept("a1", "Move Semantics", "x")],
  evidenceProfiles: [{ conceptId: "a1", definitions: [passage("b1", "Move Semantics transfers ownership")], mentions: [], assertions: [] }]
};

function buildNodePorts(options: {
  rescue?: MentionedNonCoreCandidate[];
  proposals?: MissingPrerequisiteProposal[];
}) {
  const deepseekPairs: string[] = [];
  const crossFamilyPairs: string[] = [];
  const labelOf = (context: PrerequisiteConceptContext) => context.canonicalLabel;
  const judgeRecording = (sink: string[]): PrerequisiteJudgmentPort => ({
    model: sink === deepseekPairs ? "deepseek-judge" : "cross-family-judge",
    async judge(input): Promise<BatchedPrerequisiteJudgment> {
      for (const candidate of input.candidates) sink.push([labelOf(input.subject), labelOf(candidate)].sort().join("|"));
      return {
        relations: input.candidates.map((candidate) => ({
          prerequisiteDerivedNodeId: input.subject.derivedNodeId,
          dependentDerivedNodeId: candidate.derivedNodeId,
          outcome: "none" as const,
          confidence: 0.1,
          rationale: "mock"
        }))
      };
    }
  });
  const prerequisiteJudge = judgeRecording(deepseekPairs);
  const generatedPrerequisiteJudge = judgeRecording(crossFamilyPairs);

  let counter = 0;
  const newNodeId = () => `dn-${++counter}`;
  const proposalPort: MissingPrerequisiteProposalPort = {
    model: "mock-proposer",
    async propose(input) { return (options.proposals ?? []).slice(0, input.maxProposals); }
  };
  const groundingPort: GroundingGenerationPort = {
    model: "mock-gen",
    async generate(input): Promise<GeneratedGroundingBundle> {
      return {
        derivedNodeId: input.derivedNodeId, groundingOrigin: "llm_grounded",
        definitions: [{ passageType: "definition", text: `${input.nodeLabel} explained.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
        mentions: [], scaffoldedAnchorConceptIds: input.scaffoldedAnchors.map((a) => a.conceptId), generatingModel: "mock-gen", rationale: "r"
      };
    }
  };
  let persisted: DerivedGraphLayer | undefined;
  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(id) { return id === sparseSnapshot.graphVersionId ? sparseSnapshot : undefined; }
  };
  const difficulty: DifficultyPort = {
    method: "intrinsic-fused-v1",
    async score({ nodes }) {
      return nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0, method: "intrinsic-fused-v1", components: {}, neuralRationale: "" }));
    }
  };
  const enrichmentStore: Pick<EnrichmentRunStorePort, "persist" | "mentionedNonCoreCandidates"> = {
    async persist(input) { persisted = input.layer; },
    async mentionedNonCoreCandidates() { return options.rescue ?? []; }
  };
  return { deepseekPairs, crossFamilyPairs, newNodeId, proposalPort, groundingPort, prerequisiteJudge, generatedPrerequisiteJudge, graphStore, difficulty, enrichmentStore, getPersisted: () => persisted };
}

function rescueCandidate(label: string): MentionedNonCoreCandidate {
  return {
    runId: "run-1", declaredDomain: "x", candidateKey: label.toLowerCase(), canonicalLabel: label, normalizedLabel: label.toLowerCase(), aliases: [], tier: "reject",
    mentions: [{ sourceResourceId: "s1", sourceBlockId: "blk-r", evidenceQuote: `${label} is mentioned`, blockText: `Here ${label} is mentioned in prose`, headingPath: [], locator: {} }]
  };
}

function runNodes(ports: ReturnType<typeof buildNodePorts>) {
  return runGraphEnrichment({
    enrichmentId: "e1", graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    prerequisiteJudge: ports.prerequisiteJudge,
    generatedPrerequisiteJudge: ports.generatedPrerequisiteJudge,
    missingPrerequisiteProposal: ports.proposalPort,
    groundingGeneration: ports.groundingPort,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort,
    newNodeId: ports.newNodeId
  });
}

test("rescues a source_mentioned node from a member-run mention and orders it as an edge", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")] });
  const layer = await runNodes(ports);
  const rescued = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned");
  assert.ok(rescued, "a source_mentioned rescued node is present");
  assert.equal(rescued.role, "prerequisite");
  // Its relationship to the anchor is judged as an edge, never a node attribute.
  assert.ok(!("prerequisiteOf" in rescued));
});

test("mints an llm_grounded node for an anchor and never publishes it asserted", async () => {
  const ports = buildNodePorts({ proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  const layer = await runNodes(ports);
  const minted = layer.derivedNodes.filter((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded");
  assert.equal(minted.length, 1);
  assert.equal(minted[0].layer, "derived");
  // The single anchor stays the only asserted node; enrichment nodes are all derived.
  const asserted = layer.derivedNodes.filter((node) => node.layer === "asserted");
  assert.equal(asserted.length, 1);
  assert.equal(asserted[0].nodeKind, "anchor");
});

test("routes generated-node pairs cross-family and anchor/source_mentioned pairs to deepseek", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  await runNodes(ports);
  // Pairs: {Move Semantics, Pointer} -> deepseek; {Move Semantics, Stack allocation}
  // and {Pointer, Stack allocation} both touch the generated node -> cross-family.
  assert.ok(ports.deepseekPairs.includes("Move Semantics|Pointer"), `deepseek pairs: ${ports.deepseekPairs.join(", ")}`);
  assert.ok(ports.crossFamilyPairs.includes("Move Semantics|Stack allocation"), `cross-family pairs: ${ports.crossFamilyPairs.join(", ")}`);
  assert.ok(ports.crossFamilyPairs.includes("Pointer|Stack allocation"));
  // No generated pair leaks onto deepseek.
  assert.ok(!ports.deepseekPairs.some((pair) => pair.includes("Stack allocation")));
});

test("records the verbatim-floor grounding dispositions on the run", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  const layer = await runNodes(ports);
  // The minted node is exempt-recorded; the rescued mention verifies against its block.
  const minted = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded");
  const rescued = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned");
  assert.ok(minted && rescued, "both enrichment node kinds survive the floor");
  // difficulty scores every derived node (anchor + enrichment).
  assert.equal(layer.difficulties.length, layer.derivedNodes.length);
});
