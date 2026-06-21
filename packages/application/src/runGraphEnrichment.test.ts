import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnchorProjectionNode,
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

// Two Declared Domains: "x" has 3 concepts, "y" has 2. Prerequisites are always
// same-domain (ADR-0015), so the exhaustive judge (ADR-0019 reset) must see
// exactly C(3,2)+C(2,2)=3+1=4 unordered pairs and never a cross-domain pair.
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

type JudgeFn = (input: { declaredDomain: string; a: PrerequisiteConceptContext; b: PrerequisiteConceptContext }) => PrerequisiteJudgment | Promise<PrerequisiteJudgment>;

// Default mock: directs cx2->cx1, cx1/cx3 is a plain directed edge, cx2/cx3 is
// uncertain, and cy1/cy2 is none (dropped).
const defaultJudge: JudgeFn = (input) => {
  const labels = [input.a.canonicalLabel, input.b.canonicalLabel];
  const j = (p: string, d: string, outcome: PrerequisiteJudgment["outcome"], confidence: number): PrerequisiteJudgment =>
    ({ prerequisiteDerivedNodeId: p, dependentDerivedNodeId: d, outcome, confidence, rationale: "mock" });
  const idByLabel = new Map([[input.a.canonicalLabel, input.a.derivedNodeId], [input.b.canonicalLabel, input.b.derivedNodeId]]);
  if (labels.includes("X One") && labels.includes("X Two")) return j(idByLabel.get("X Two") ?? "", idByLabel.get("X One") ?? "", "directed", 0.9);
  if (labels.includes("X One") && labels.includes("X Three")) return j(idByLabel.get("X One") ?? "", idByLabel.get("X Three") ?? "", "directed", 0.9);
  if (labels.includes("X Two") && labels.includes("X Three")) return j(idByLabel.get("X Two") ?? "", idByLabel.get("X Three") ?? "", "uncertain", 0.4);
  return j(input.a.derivedNodeId, input.b.derivedNodeId, "none", 0.1);
};

function buildPorts(options: { judge?: JudgeFn; snapshot?: GraphSnapshot } = {}) {
  const active = options.snapshot ?? snapshot;
  const judgeFn = options.judge ?? defaultJudge;
  const judgedInputs: { declaredDomain: string; a: PrerequisiteConceptContext; b: PrerequisiteConceptContext }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === active.graphVersionId ? active : undefined;
    }
  };
  const prerequisiteJudge: PrerequisiteJudgmentPort = {
    model: "mock-judge",
    async judge(input) {
      judgedInputs.push(input);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await judgeFn(input);
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

// Scenario 1: exactly the same-domain pairs are judged; no cross-domain pair leaks.
test("runGraphEnrichment judges every same-domain pair and never a cross-domain pair", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  const domainByDerivedId = new Map(layer.derivedNodes.map((node) => [node.derivedNodeId, node.declaredDomain]));

  assert.equal(ports.judgedInputs.length, 4); // C(3,2)+C(2,2)
  for (const input of ports.judgedInputs) {
    assert.equal(domainByDerivedId.get(input.a.derivedNodeId), domainByDerivedId.get(input.b.derivedNodeId), `cross-domain pair leaked: ${input.a.derivedNodeId}/${input.b.derivedNodeId}`);
  }
});

// Scenario 2: each judge call receives both Concepts' full CEPs (definitions,
// bounded mentions, labeled typed assertions) — never bare labels alone.
test("runGraphEnrichment passes both Concepts' CEPs to the judge with bounded mentions", async () => {
  const ports = buildPorts();
  await run(ports);

  const cx1cx2 = ports.judgedInputs.find((i) => [i.a.canonicalLabel, i.b.canonicalLabel].includes("X One") && [i.a.canonicalLabel, i.b.canonicalLabel].includes("X Two"));
  assert.ok(cx1cx2, "expected the cx1/cx2 pair");
  const cx1 = cx1cx2.a.canonicalLabel === "X One" ? cx1cx2.a : cx1cx2.b;
  const cx2 = cx1cx2.a.canonicalLabel === "X Two" ? cx1cx2.a : cx1cx2.b;

  assert.deepEqual(cx1.definitions, ["X One is the definition of X One"]);
  assert.deepEqual(cx2.definitions, ["X Two is the definition of X Two"]);
  // Default bound of six mentions is applied even though the CEP holds seven.
  assert.equal(cx1.mentions.length, 6);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two", "mention three", "mention four", "mention five", "mention six"]);
  assert.deepEqual(cx1.assertions, [
    { type: "defines", detail: "the first X concept" }
  ]);
  assert.deepEqual(cx1.aliases, ["XOne"]);
});

// Scenario 2b: a non-default mention bound is honored without reordering.
test("runGraphEnrichment honors a non-default mention bound and preserves neural order", async () => {
  const ports = buildPorts();
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-pair-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 4,
      maxMentionsPerConceptInPair: 2,
      mintingBounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 }
    }
  });

  const cx1 = ports.judgedInputs.flatMap((i) => [i.a, i.b]).find((c) => c.canonicalLabel === "X One");
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

// Scenario 6: the persisted layer and trace carry no embedding/candidate-group fields.
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
  assert.equal(ports.getTrace()?.judgments.length, 4);
  // U4: each pair judgment records which judge model ordered it (anchor-only run -> all DeepSeek).
  assert.ok(ports.getTrace()?.judgments.every((judgment) => judgment.judgeModel === "mock-judge"));
  // U4: an anchor-only run (no enrichment-node ports) has no rescue dispositions.
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

test("runGraphEnrichment default config hash reflects intrinsic difficulty", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(DEFAULT_ENRICHMENT_CONFIG.enrichmentConfigHash, "intrinsic-difficulty-v3");
  assert.equal(layer.enrichmentConfigHash, "intrinsic-difficulty-v3");
  assert.notEqual(layer.enrichmentConfigHash, "cep-node-enrichment-rescue-judged-v2");
});

// Scenario 3: a concept pair with no CEP evidence cannot reach the judge and fails
// closed if an invalid (evidence-free) snapshot is injected.
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

// Scenario 8a: judge calls never exceed the configured concurrency and the trace
// keeps deterministic pair order regardless of completion order.
test("runGraphEnrichment bounds concurrency and keeps deterministic pair order", async () => {
  const completionOrder: string[] = [];
  let callIndex = 0;
  // Resolve later pairs first so completion order differs from input order.
  const judge: JudgeFn = async (input) => {
    const key = `${input.a.canonicalLabel}/${input.b.canonicalLabel}`;
    const index = callIndex++;
    // Make only the first sorted pair slow so later pairs complete before it.
    const delay = index === 0 ? 30 : 1;
    await new Promise((resolve) => setTimeout(resolve, delay));
    completionOrder.push(key);
    return { prerequisiteDerivedNodeId: input.a.derivedNodeId, dependentDerivedNodeId: input.b.derivedNodeId, outcome: "none", confidence: 0.1, rationale: "mock" };
  };
  const ports = buildPorts({ judge });
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-pair-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 2,
      maxMentionsPerConceptInPair: 6,
      mintingBounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 }
    }
  });

  assert.ok(ports.getMaxInFlight() <= 2, `concurrency exceeded: ${ports.getMaxInFlight()}`);
  // Trace order follows sorted pair order, not completion order.
  const traceOrder = ports.getTrace()?.judgments.map((j) => `${j.a.canonicalLabel}/${j.b.canonicalLabel}`) ?? [];
  const dispatchOrder = ports.judgedInputs.map((j) => `${j.a.canonicalLabel}/${j.b.canonicalLabel}`);
  assert.deepEqual(traceOrder, dispatchOrder);
  assert.notDeepEqual(completionOrder, traceOrder, "test setup should produce out-of-order completion");
});

// Scenario 8b: one exhausted pair (judge throws) fails the run before persistence.
test("runGraphEnrichment fails the run without persisting when a pair exhausts its budget", async () => {
  const judge: JudgeFn = (input) => {
    if (input.a.canonicalLabel === "X Two" && input.b.canonicalLabel === "X Three") {
      throw new Error("forced-tool retry budget exhausted");
    }
    return { prerequisiteDerivedNodeId: input.a.derivedNodeId, dependentDerivedNodeId: input.b.derivedNodeId, outcome: "none", confidence: 0.1, rationale: "mock" };
  };
  const ports = buildPorts({ judge });
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
    async judge(input) {
      sink.push([labelOf(input.a), labelOf(input.b)].sort().join("|"));
      return { prerequisiteDerivedNodeId: input.a.derivedNodeId, dependentDerivedNodeId: input.b.derivedNodeId, outcome: "none", confidence: 0.1, rationale: "mock" };
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
