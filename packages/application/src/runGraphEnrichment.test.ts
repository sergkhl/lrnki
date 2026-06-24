import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnchorProjectionNode,
  DerivedGraphLayer,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GraphSnapshot,
  PrerequisiteConceptContext,
  PrerequisiteOrderingCorrection,
  WholeSetOrdering
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  GraphVersionStorePort,
  PrerequisiteOrderingPort
} from "@lrnki/ports";
import { DEFAULT_ENRICHMENT_CONFIG, runGraphEnrichment, type GraphEnrichmentConfig } from "./runGraphEnrichment";
import { DEFAULT_DEDUP_CONFIG } from "./deduplicateDerivedNodes";

// Two Declared Domains: "x" has 3 concepts, "y" has 2. Ordering is always same-domain
// (ADR-0015), so the whole-set reshape (R1) issues exactly ONE ordering call per domain
// over that domain's evidenced nodes and never mixes domains in one call.
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

// cx1 carries a `defines` assertion and a multi-mention CEP so the mention bound is observable.
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

type OrderInput = { declaredDomain: string; nodes: PrerequisiteConceptContext[]; correction?: PrerequisiteOrderingCorrection };
type Responder = (input: OrderInput) => WholeSetOrdering;

// A canned edge over two canonical labels; only edges whose endpoints are in the call's
// node set are emitted (mirrors a sane model). Confidence defaults high (survives the cut).
function edgeOf(prerequisiteLabel: string, dependentLabel: string, confidence = 0.9, rationale = "mock"): WholeSetOrdering["edges"][number] {
  return { prerequisiteLabel, dependentLabel, confidence, rationale };
}
function presentEdges(input: OrderInput, edges: WholeSetOrdering["edges"]): WholeSetOrdering {
  const labels = new Set(input.nodes.map((n) => n.canonicalLabel));
  return { edges: edges.filter((e) => labels.has(e.prerequisiteLabel) && labels.has(e.dependentLabel)) };
}

// Default ordering: in domain "x" assert X Two -> X One and X One -> X Three (acyclic);
// in domain "y" assert nothing. Label-driven, no positional meaning.
const defaultResponder: Responder = (input) =>
  presentEdges(input, [edgeOf("X Two", "X One"), edgeOf("X One", "X Three")]);

function buildPorts(options: { responder?: Responder; snapshot?: GraphSnapshot; onOrder?: (input: OrderInput) => Promise<void> } = {}) {
  const active = options.snapshot ?? snapshot;
  const responder = options.responder ?? defaultResponder;
  const calls: OrderInput[] = [];

  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === active.graphVersionId ? active : undefined;
    }
  };
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      calls.push(input);
      if (options.onOrder) await options.onOrder(input);
      return responder(input);
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
    calls,
    graphStore,
    prerequisiteOrdering,
    difficulty,
    enrichmentStore,
    getPersisted: () => persisted,
    getTrace: () => trace,
    getArtifactType: () => artifactType,
    getPersistCalls: () => persistCalls
  };
}

function configWith(overrides: Partial<GraphEnrichmentConfig>): GraphEnrichmentConfig {
  return { ...DEFAULT_ENRICHMENT_CONFIG, dedup: DEFAULT_DEDUP_CONFIG, ...overrides };
}

function run(ports: ReturnType<typeof buildPorts>, overrides: Partial<Parameters<typeof runGraphEnrichment>[0]> = {}) {
  return runGraphEnrichment({
    enrichmentId: "e1",
    graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    prerequisiteOrdering: ports.prerequisiteOrdering,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort,
    ...overrides
  });
}

const idByLabel = (layer: DerivedGraphLayer) =>
  new Map(layer.derivedNodes.map((node) => [node.canonicalLabel, node.derivedNodeId] as const));

// R1 grouping: exactly one ordering call per domain, each over that domain's nodes only.
test("issues exactly one ordering call per Declared Domain, never cross-domain", async () => {
  const ports = buildPorts();
  await run(ports);
  assert.equal(ports.calls.length, 2, "one call for domain x and one for domain y");
  const domains = ports.calls.map((call) => call.declaredDomain).sort();
  assert.deepEqual(domains, ["x", "y"]);
  for (const call of ports.calls) {
    const callDomains = new Set(call.nodes.map((node) => node.canonicalLabel.startsWith("X") ? "x" : "y"));
    assert.equal(callDomains.size, 1, "a single call never mixes domains");
  }
});

// Each ordering call receives full CEPs (definitions, bounded mentions, labeled typed
// assertions, aliases) — never bare labels alone.
test("passes Concepts' CEPs to the ordering call with bounded mentions", async () => {
  const ports = buildPorts();
  await run(ports);
  const xCall = ports.calls.find((call) => call.declaredDomain === "x");
  assert.ok(xCall);
  const cx1 = xCall.nodes.find((node) => node.canonicalLabel === "X One");
  assert.ok(cx1);
  assert.deepEqual(cx1.definitions, ["X One is the definition of X One"]);
  assert.equal(cx1.mentions.length, 6, "default bound of six even though the CEP holds seven");
  assert.deepEqual(cx1.mentions, ["mention one", "mention two", "mention three", "mention four", "mention five", "mention six"]);
  assert.deepEqual(cx1.assertions, [{ type: "defines", detail: "the first X concept" }]);
  assert.deepEqual(cx1.aliases, ["XOne"]);
});

test("honors a non-default mention bound without reordering", async () => {
  const ports = buildPorts();
  await run(ports, { config: configWith({ maxMentionsPerConceptInPair: 2 }) });
  const cx1 = ports.calls.flatMap((call) => call.nodes).find((node) => node.canonicalLabel === "X One");
  assert.ok(cx1);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two"]);
});

// R3 + R13: the ordering's certain edges survive disposal; an unasserted pair produces no
// edge and no disposition; no uncertain edges arise on an acyclic single-sample run.
test("follows the ordering: certain edges survive, unasserted pairs produce nothing", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  const id = idByLabel(layer);
  const has = (prereq: string, dep: string) =>
    layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === id.get(prereq) && e.dependentDerivedNodeId === id.get(dep) && !e.uncertain);
  assert.ok(has("X Two", "X One"));
  assert.ok(has("X One", "X Three"));
  assert.equal(layer.prerequisiteEdges.length, 2, "only the two asserted edges; the unasserted X Two/X Three pair yields nothing (R3)");
  assert.ok(layer.prerequisiteEdges.every((e) => !e.uncertain), "an acyclic single-sample run has no uncertain edges");

  const dispositions = ports.getTrace()?.dispositions ?? [];
  assert.deepEqual(dispositions.map((d) => d.disposition).sort(), ["kept", "kept"]);
  // R3: no disposition row for the pair the judge never asserted.
  assert.ok(!dispositions.some((d) => d.prerequisiteDerivedNodeId === id.get("X Two") && d.dependentDerivedNodeId === id.get("X Three")));
});

// AE1 / R9, R10: a first cyclic response triggers exactly ONE re-prompt naming the cycle;
// the revised acyclic response persists normally.
test("a cyclic first response triggers exactly one re-prompt naming the cycle", async () => {
  let corrections: PrerequisiteOrderingCorrection[] = [];
  const responder: Responder = (input) => {
    if (input.declaredDomain !== "x") return { edges: [] };
    if (input.correction) {
      corrections.push(input.correction);
      return presentEdges(input, [edgeOf("X One", "X Two"), edgeOf("X One", "X Three")]); // acyclic
    }
    return presentEdges(input, [edgeOf("X One", "X Two"), edgeOf("X Two", "X Three"), edgeOf("X Three", "X One")]); // cycle
  };
  const ports = buildPorts({ responder });
  const layer = await run(ports);

  const xCalls = ports.calls.filter((call) => call.declaredDomain === "x");
  assert.equal(xCalls.length, 2, "exactly one corrective re-prompt for domain x");
  assert.equal(corrections.length, 1);
  // The correction frames the violating cycle as an ordered label path looping back.
  const path = corrections[0].cyclePath;
  assert.equal(path[0], path[path.length - 1], "cycle path loops back to its start");
  assert.deepEqual([...new Set(path)].sort(), ["X One", "X Three", "X Two"]);

  const xTrace = ports.getTrace()?.orderings.find((o) => o.declaredDomain === "x");
  assert.equal(xTrace?.reprompted, true);
  assert.deepEqual(xTrace?.cycleRoutedEdges, [], "the re-prompt fixed it; nothing routed to uncertain");
  assert.ok(layer.prerequisiteEdges.every((e) => !e.uncertain));
  assert.equal(ports.getPersistCalls(), 1);
});

// AE2 / R11: a still-cyclic response after the one re-prompt routes every edge in the
// offending cycle to uncertain (kept + excluded from the DAG); the rest is unaffected.
test("a still-cyclic response routes the cycle edges to uncertain and keeps the rest", async () => {
  // Domain x with FOUR nodes: A,B,C cycle, plus D->A outside the cycle (must survive).
  const fourNode: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x"), concept("c", "C", "x"), concept("d", "D", "x")],
    evidenceProfiles: ["a", "b", "c", "d"].map((cid, i) => ({ conceptId: cid, definitions: [passage(`d${i}`, `${cid} def`)], mentions: [], assertions: [] }))
  };
  const responder: Responder = (input) =>
    presentEdges(input, [edgeOf("A", "B"), edgeOf("B", "C"), edgeOf("C", "A"), edgeOf("D", "A")]); // always cyclic
  const ports = buildPorts({ responder, snapshot: fourNode });
  const layer = await run(ports);

  const id = idByLabel(layer);
  const xCalls = ports.calls.filter((call) => call.declaredDomain === "x");
  assert.equal(xCalls.length, 2, "one re-prompt, then route — never an agentic loop of calls");

  const certain = layer.prerequisiteEdges.filter((e) => !e.uncertain);
  const uncertain = layer.prerequisiteEdges.filter((e) => e.uncertain);
  // D -> A is outside the cycle and survives as a certain edge.
  assert.ok(certain.some((e) => e.prerequisiteDerivedNodeId === id.get("D") && e.dependentDerivedNodeId === id.get("A")));
  // The three cycle edges are routed to uncertain (kept, not dropped).
  assert.equal(uncertain.length, 3);
  assert.equal(certain.length, 1, "only D->A stays certain");
  // Nothing dropped: all four asserted edges are present in the persisted layer.
  assert.equal(layer.prerequisiteEdges.length, 4);

  const xTrace = ports.getTrace()?.orderings.find((o) => o.declaredDomain === "x");
  assert.equal(xTrace?.reprompted, true);
  assert.equal(xTrace?.cycleRoutedEdges.length, 3);
  assert.ok((ports.getTrace()?.dispositions ?? []).filter((d) => d.disposition === "uncertain").length === 3);
});

// AE5 / R4: an evidence-free node is excluded from the ordering input and recorded ONCE.
test("excludes an evidence-free node from ordering and records it once", async () => {
  const withEmpty: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("g", "Grounded", "x"), concept("e", "Empty", "x"), concept("h", "Helper", "x")],
    evidenceProfiles: [
      { conceptId: "g", definitions: [passage("b1", "Grounded def")], mentions: [], assertions: [] },
      { conceptId: "e", definitions: [], mentions: [], assertions: [] }, // no evidence
      { conceptId: "h", definitions: [passage("b2", "Helper def")], mentions: [], assertions: [] }
    ]
  };
  const ports = buildPorts({ snapshot: withEmpty });
  const layer = await run(ports);
  const xCall = ports.calls.find((call) => call.declaredDomain === "x");
  assert.ok(xCall);
  assert.ok(!xCall.nodes.some((node) => node.canonicalLabel === "Empty"), "the empty node never reaches the ordering call");
  assert.equal(xCall.nodes.length, 2);

  const exclusions = ports.getTrace()?.nodeExclusions ?? [];
  assert.equal(exclusions.length, 1, "recorded exactly once, not once per pair");
  assert.equal(exclusions[0].reason, "insufficient_evidence");
  assert.equal(exclusions[0].declaredDomain, "x");
  // The excluded node is still a derived node (anchor projection) and scored for difficulty.
  assert.ok(layer.derivedNodes.some((node) => node.canonicalLabel === "Empty"));
});

// AE4 / R16: a domain over the token budget fails closed with no partial layer; no chunking.
test("fails closed without persisting when a domain exceeds the token budget", async () => {
  const ports = buildPorts();
  await assert.rejects(() => run(ports, { config: configWith({ maxDomainPromptChars: 5 }) }), /exceeds the budget/);
  assert.equal(ports.getPersistCalls(), 0, "no partial layer persisted");
});

// R9: an edge citing a label not in the judged set is rejected fail-closed, never guessed.
test("rejects an edge citing a label outside the judged set (rule 6)", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x" ? { edges: [edgeOf("X One", "Nonexistent Concept")] } : { edges: [] };
  const ports = buildPorts({ responder });
  await assert.rejects(() => run(ports), /cites a label not in domain/);
  assert.equal(ports.getPersistCalls(), 0);
});

// R9: an edge naming one concept as its own prerequisite is rejected fail-closed.
test("rejects a self-edge (one concept as its own prerequisite)", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x" ? { edges: [edgeOf("X One", "X One")] } : { edges: [] };
  const ports = buildPorts({ responder });
  await assert.rejects(() => run(ports), /its own prerequisite/);
  assert.equal(ports.getPersistCalls(), 0);
});

// R13: a redundant transitive shortcut is reduced; the disposition trace records it.
test("transitive reduction drops a redundant shortcut among certain edges", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x"
      ? presentEdges(input, [edgeOf("X One", "X Two"), edgeOf("X Two", "X Three"), edgeOf("X One", "X Three")])
      : { edges: [] };
  const ports = buildPorts({ responder });
  const layer = await run(ports);
  const id = idByLabel(layer);
  // X One -> X Three is redundant given X One -> X Two -> X Three.
  assert.ok(!layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === id.get("X One") && e.dependentDerivedNodeId === id.get("X Three")));
  const dispositions = ports.getTrace()?.dispositions.map((d) => d.disposition) ?? [];
  assert.ok(dispositions.includes("transitive_reduction"));
  assert.ok(dispositions.includes("kept"));
});

// A weak edge below the confidence floor is cut and recorded.
test("cuts an edge below the confidence floor", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x" ? presentEdges(input, [edgeOf("X Two", "X One", 0.2)]) : { edges: [] };
  const ports = buildPorts({ responder });
  const layer = await run(ports);
  assert.equal(layer.prerequisiteEdges.length, 0, "the weak edge is cut");
  assert.ok((ports.getTrace()?.dispositions ?? []).some((d) => d.disposition === "weak_cut"));
});

test("persists a layer free of embedding and candidate-group fields and bumps the artifact type", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(layer.judgeModel, "mock-ordering");
  assert.ok(!("embeddingModel" in layer));
  for (const edge of layer.prerequisiteEdges) {
    assert.ok(!("candidateGroupId" in edge));
    assert.ok(!("evidencePacketRef" in edge.provenance));
  }
  assert.equal(ports.getPersisted()?.enrichmentId, "e1");
  assert.equal(ports.getArtifactType(), "enrichment_run.v3");
  // One ordering trace per domain (R1), each naming the ordering model used.
  assert.equal(ports.getTrace()?.orderings.length, 2);
  assert.ok(ports.getTrace()?.orderings.every((o) => o.judgeModel === "mock-ordering"));
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

test("scores intrinsic difficulty with per-node evidence contexts over all derived nodes", async () => {
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
  assert.equal(scoredInputs.length, 1);
  assert.equal(scoredInputs[0].length, layer.derivedNodes.length);
  const xOne = scoredInputs[0].find((node) => node.canonicalLabel === "X One");
  assert.ok(xOne);
  assert.deepEqual(xOne.definitions, ["X One is the definition of X One"]);
});

test("default config hash reflects the whole-set ordering reshape", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(DEFAULT_ENRICHMENT_CONFIG.enrichmentConfigHash, "whole-set-ordering-v1");
  assert.equal(layer.enrichmentConfigHash, "whole-set-ordering-v1");
});

// An evidence-free snapshot reaches no ordering call and persists with only exclusions.
test("fails closed on an evidence-free snapshot without an ordering call", async () => {
  const ungrounded: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x")],
    evidenceProfiles: []
  };
  const ports = buildPorts({ snapshot: ungrounded });
  const layer = await run(ports);
  assert.equal(ports.calls.length, 0, "no ordering call when nothing is evidenced");
  assert.equal(layer.prerequisiteEdges.length, 0);
  assert.equal(ports.getTrace()?.nodeExclusions.length, 2);
  assert.deepEqual(ports.getTrace()?.dispositions, []);
});

// An ordering call that exhausts its forced-tool retry budget fails the run before persistence.
test("fails the run without persisting when an ordering call throws", async () => {
  const ports = buildPorts({ onOrder: async (input) => { if (input.declaredDomain === "x") throw new Error("forced-tool retry budget exhausted"); } });
  await assert.rejects(() => run(ports), /retry budget exhausted/);
  assert.equal(ports.getPersistCalls(), 0, "no partial enrichment run may be persisted");
});

// --- Node minting + rescue (sub-stages unchanged; ordering consumes their nodes) ------

import type { GeneratedGroundingBundle, MentionedNonCoreCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type { GroundingGenerationPort, MissingPrerequisiteProposalPort } from "@lrnki/ports";

// A one-anchor sparse snapshot: only "Move Semantics" is defined. Enrichment must
// expand it with a rescued node and a minted node, then order all three together.
const sparseSnapshot: GraphSnapshot = {
  graphVersionId: "v1",
  baseGraphVersionId: null,
  concepts: [concept("a1", "Move Semantics", "x")],
  evidenceProfiles: [{ conceptId: "a1", definitions: [passage("b1", "Move Semantics transfers ownership")], mentions: [], assertions: [] }]
};

function buildNodePorts(options: {
  rescue?: MentionedNonCoreCandidate[];
  proposals?: MissingPrerequisiteProposal[];
  responder?: Responder;
}) {
  const orderedLabels: string[][] = [];
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      orderedLabels.push(input.nodes.map((node) => node.canonicalLabel));
      return (options.responder ?? (() => ({ edges: [] })))(input);
    }
  };
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
  return { orderedLabels, newNodeId, proposalPort, groundingPort, prerequisiteOrdering, graphStore, difficulty, enrichmentStore, getPersisted: () => persisted };
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
    prerequisiteOrdering: ports.prerequisiteOrdering,
    missingPrerequisiteProposal: ports.proposalPort,
    groundingGeneration: ports.groundingPort,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort,
    newNodeId: ports.newNodeId
  });
}

test("rescues a source_mentioned node from a member-run mention and orders it as an edge", async () => {
  const ports = buildNodePorts({
    rescue: [rescueCandidate("Pointer")],
    responder: (input) => presentEdges(input, [edgeOf("Pointer", "Move Semantics")])
  });
  const layer = await runNodes(ports);
  const rescued = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned");
  assert.ok(rescued, "a source_mentioned rescued node is present");
  assert.equal(rescued.role, "prerequisite");
  // Its relationship to the anchor is judged as an edge, never a node attribute.
  assert.ok(!("prerequisiteOf" in rescued));
  const id = idByLabel(layer);
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === id.get("Pointer") && e.dependentDerivedNodeId === id.get("Move Semantics")));
});

test("mints an llm_grounded node for an anchor and never publishes it asserted", async () => {
  const ports = buildNodePorts({ proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  const layer = await runNodes(ports);
  const minted = layer.derivedNodes.filter((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded");
  assert.equal(minted.length, 1);
  assert.equal(minted[0].layer, "derived");
  const asserted = layer.derivedNodes.filter((node) => node.layer === "asserted");
  assert.equal(asserted.length, 1);
  assert.equal(asserted[0].nodeKind, "anchor");
});

test("orders the rescued + minted + anchor node set in one whole-set call", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  await runNodes(ports);
  // One call covering all three same-domain nodes (anchor ∪ rescued ∪ minted).
  assert.equal(ports.orderedLabels.length, 1);
  assert.deepEqual([...ports.orderedLabels[0]].sort(), ["Move Semantics", "Pointer", "Stack allocation"]);
});

test("records the verbatim-floor grounding dispositions on the run", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  const layer = await runNodes(ports);
  const minted = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded");
  const rescued = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned");
  assert.ok(minted && rescued, "both enrichment node kinds survive the floor");
  assert.equal(layer.difficulties.length, layer.derivedNodes.length);
});
