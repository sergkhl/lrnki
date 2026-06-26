import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnchorProjectionNode,
  DerivedGraphLayer,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  PrerequisiteConceptContext,
  WholeSetOrdering
} from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  GraphVersionStorePort,
  PrerequisiteOrderingPort
} from "@lrnki/ports";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { RunProgressReporterPort } from "@lrnki/ports";
import { DEFAULT_ENRICHMENT_CONFIG, runGraphEnrichment, type GraphEnrichmentConfig } from "./runGraphEnrichment";
import { DEFAULT_DEDUP_CONFIG } from "./deduplicateDerivedNodes";

installNodeOperationTagContext();

// Recording reporter fake: captures ordered reporter calls so a test asserts the
// enrichment timeline lifecycle without a database (rule 11). Replaces the deleted
// onStageTiming stdout sink — stage wall-clock now flows through the durable reporter.
function recordingReporter() {
  const calls: string[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation(i) { calls.push(`begin:${i.operationType}:${i.operationId}`); },
    async enterStage(i) { calls.push(`enter:${i.stage}`); },
    async recordProgress(i) { calls.push(`progress:${i.stage}:${i.done}`); },
    async completeStage(i) { calls.push(`complete:${i.stage}:${i.ok}`); },
    async completeOperation(i) { calls.push(`done:${i.status}`); }
  };
  return { reporter, calls };
}

// Two Declared Domains: "x" has 3 concepts, "y" has 2. Ordering is always same-domain
// (ADR-0015). K-sampling (D1) draws the whole-set ordering call K times per multi-node
// domain on the SAME input; the application tallies a per-pair directional vote (D2). The
// fake ordering port returns the i-th canned WholeSetOrdering for the i-th DRAW within a
// domain, so a test drives the tally deterministically WITHOUT asserting any ordering is
// "good" (rule 11 — a canned draw set is input to the deterministic aggregation only).
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

type OrderInput = { declaredDomain: string; nodes: PrerequisiteConceptContext[] };
// A responder maps (call input, DRAW index within that domain) → one draw's ordering.
type Responder = (input: OrderInput, drawIndex: number) => WholeSetOrdering;

// Tests author canned edges by LABEL for readability; `presentEdges` converts each label
// to the 1-based Concept number the real ordering contract now uses (the model cites the
// position shown in the prompt — see WholeSetPrerequisiteEdge). An edge whose endpoint is
// not in the call's node set is dropped (mirrors a sane model). The model's self-reported
// `confidence` is NO LONGER the edge confidence (D4 replaces it with consensus
// max(f,r)/K), so it is cosmetic here.
type LabelEdge = { prerequisiteLabel: string; dependentLabel: string; confidence: number; rationale: string };
function edgeOf(prerequisiteLabel: string, dependentLabel: string, confidence = 0.9, rationale = "mock"): LabelEdge {
  return { prerequisiteLabel, dependentLabel, confidence, rationale };
}
function presentEdges(input: OrderInput, edges: LabelEdge[]): WholeSetOrdering {
  const numberOf = (label: string): number => input.nodes.findIndex((n) => n.canonicalLabel === label) + 1;
  return {
    edges: edges
      .map((e) => ({ prerequisiteNumber: numberOf(e.prerequisiteLabel), dependentNumber: numberOf(e.dependentLabel), confidence: e.confidence, rationale: e.rationale }))
      // findIndex(...) + 1 === 0 means the label is not in the node set: drop that edge.
      .filter((e) => e.prerequisiteNumber > 0 && e.dependentNumber > 0)
  };
}

// Build K draws for one domain: `segments` lists [edges, repeat] in order; remaining draws
// up to K are empty. Lets a test express "this edge appears in 6 of 8 draws" directly.
function drawsOf(k: number, segments: Array<[LabelEdge[], number]>): LabelEdge[][] {
  const out: LabelEdge[][] = [];
  for (const [edges, repeat] of segments) for (let i = 0; i < repeat; i++) out.push(edges);
  while (out.length < k) out.push([]);
  return out.slice(0, k);
}
// A responder driven by a per-domain script of per-draw edge lists.
function scriptResponder(perDomain: Record<string, LabelEdge[][]>): Responder {
  return (input, drawIndex) => presentEdges(input, perDomain[input.declaredDomain]?.[drawIndex] ?? []);
}

// Default ordering: every draw in domain "x" asserts X Two -> X One and X One -> X Three
// (acyclic, stable across draws → consensus 1.0); domain "y" asserts nothing.
const defaultResponder: Responder = (input) =>
  presentEdges(input, [edgeOf("X Two", "X One"), edgeOf("X One", "X Three")]);

function buildPorts(options: { responder?: Responder; snapshot?: GraphSnapshot; onOrder?: (input: OrderInput) => Promise<void> } = {}) {
  const active = options.snapshot ?? snapshot;
  const responder = options.responder ?? defaultResponder;
  const calls: OrderInput[] = [];
  const drawCounts = new Map<string, number>();

  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === active.graphVersionId ? active : undefined;
    }
  };
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      // The synchronous prefix (draw-index assignment) runs before any await, so even with
      // K concurrent draws each call gets a unique sequential index in call order.
      const drawIndex = drawCounts.get(input.declaredDomain) ?? 0;
      drawCounts.set(input.declaredDomain, drawIndex + 1);
      calls.push(input);
      if (options.onOrder) await options.onOrder(input);
      return responder(input, drawIndex);
    }
  };
  let scoredEdges: InferredPrerequisiteEdge[] | undefined;
  const difficulty: DifficultyPort = {
    method: "intrinsic-fused-v1",
    async score({ nodes, prerequisiteEdges }) {
      scoredEdges = prerequisiteEdges;
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
    callsForDomain: (domain: string) => calls.filter((c) => c.declaredDomain === domain).length,
    getPersisted: () => persisted,
    getTrace: () => trace,
    getArtifactType: () => artifactType,
    getPersistCalls: () => persistCalls,
    getScoredEdges: () => scoredEdges
  };
}

function configWith(overrides: Partial<GraphEnrichmentConfig>): GraphEnrichmentConfig {
  return { ...DEFAULT_ENRICHMENT_CONFIG, dedup: DEFAULT_DEDUP_CONFIG, ...overrides };
}

const K = DEFAULT_ENRICHMENT_CONFIG.orderingSampleCount;

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

const pairVote = (trace: EnrichmentRunTrace | undefined, domain: string, prereqId?: string, depId?: string) =>
  trace?.orderings.find((o) => o.declaredDomain === domain)?.pairVotes.find(
    (v) => (prereqId === undefined || v.prerequisiteDerivedNodeId === prereqId) && (depId === undefined || v.dependentDerivedNodeId === depId)
  );

// U5: the reporter sees the enrichment timeline lifecycle. The anchor-only run (no
// minting/dedup ports) skips rescue-mint + dedup; ordering and difficulty carry their
// STAGE_TAGS so the R5 cost join keys hold; persist is the non-LLM tail.
test("U5: reports beginOperation → ordering/symbolic/difficulty/persist stages → completeOperation succeeded", async () => {
  const ports = buildPorts();
  const { reporter, calls } = recordingReporter();
  await run(ports, { reporter });

  assert.equal(calls[0], "begin:enrichment:e1");
  assert.equal(calls.at(-1), "done:succeeded");
  const entered = calls.filter((c) => c.startsWith("enter:")).map((c) => c.slice("enter:".length));
  assert.deepEqual(entered, [
    STAGE_TAGS.prerequisiteOrdering,
    "symbolic-disposal",
    STAGE_TAGS.intrinsicDifficulty,
    "persist"
  ]);
  // Every entered stage is closed ok:true on a clean run; no failed status is emitted.
  assert.equal(calls.filter((c) => c.startsWith("complete:") && c.endsWith(":true")).length, 4);
  assert.ok(!calls.includes("done:failed"));
});

test("the enrichment operation context reaches concurrent ordering calls", async () => {
  const ports = buildPorts({
    onOrder: async () => {
      await Promise.resolve();
      assert.equal(currentOperationTag(), "e1");
    }
  });
  await run(ports);
});

// D1: each multi-node domain issues exactly K draws over its own nodes only.
test("D1: issues exactly K draws per multi-node domain, never cross-domain", async () => {
  const ports = buildPorts();
  await run(ports);
  assert.equal(ports.calls.length, 2 * K, "K draws for domain x and K for domain y");
  assert.equal(ports.callsForDomain("x"), K);
  assert.equal(ports.callsForDomain("y"), K);
  for (const call of ports.calls) {
    const callDomains = new Set(call.nodes.map((node) => (node.canonicalLabel.startsWith("X") ? "x" : "y")));
    assert.equal(callDomains.size, 1, "a single draw never mixes domains");
  }
});

// D1: a singleton domain takes zero draws and records an empty pairVotes with k = 0.
test("D1: a singleton domain issues 0 draws and records empty pairVotes", async () => {
  const withSingleton: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x"), concept("s", "Solo", "z")],
    evidenceProfiles: [
      { conceptId: "a", definitions: [passage("b1", "A def")], mentions: [], assertions: [] },
      { conceptId: "b", definitions: [passage("b2", "B def")], mentions: [], assertions: [] },
      { conceptId: "s", definitions: [passage("b3", "Solo def")], mentions: [], assertions: [] }
    ]
  };
  const ports = buildPorts({ snapshot: withSingleton, responder: () => ({ edges: [] }) });
  await run(ports);
  assert.equal(ports.callsForDomain("z"), 0, "the singleton domain z takes no draws");
  assert.equal(ports.callsForDomain("x"), K);
  const zTrace = ports.getTrace()?.orderings.find((o) => o.declaredDomain === "z");
  assert.equal(zTrace?.k, 0);
  assert.deepEqual(zTrace?.pairVotes, []);
});

// Each draw receives full CEPs (definitions, bounded mentions, labeled typed assertions,
// aliases) — never bare labels alone.
test("passes Concepts' CEPs to each ordering draw with bounded mentions", async () => {
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

// A pair cited the same direction in every draw commits a certain consensus edge; an
// unasserted pair produces no edge and no disposition.
test("follows the consensus: stable edges survive certain, unasserted pairs produce nothing", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  const id = idByLabel(layer);
  const has = (prereq: string, dep: string) =>
    layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === id.get(prereq) && e.dependentDerivedNodeId === id.get(dep) && !e.uncertain);
  assert.ok(has("X Two", "X One"));
  assert.ok(has("X One", "X Three"));
  assert.equal(layer.prerequisiteEdges.length, 2, "only the two stable edges; the unasserted X Two/X Three pair yields nothing");
  assert.ok(layer.prerequisiteEdges.every((e) => !e.uncertain), "a stable, acyclic consensus has no uncertain edges");

  const dispositions = ports.getTrace()?.dispositions ?? [];
  assert.deepEqual(dispositions.map((d) => d.disposition).sort(), ["kept", "kept"]);
  // No disposition row for the pair never voted in any draw.
  assert.ok(!dispositions.some((d) => d.prerequisiteDerivedNodeId === id.get("X Two") && d.dependentDerivedNodeId === id.get("X Three")));
  // Non-edge: that pair has no vote either.
  assert.equal(pairVote(ports.getTrace(), "x", id.get("X Two"), id.get("X Three")), undefined);
});

// D4: a pair voted forward in 6 of K draws, reverse 0, commits a certain edge whose
// confidence is the empirical agreement 6/K — NOT the model's self-reported 0.9.
test("D4: consensus confidence is max(f,r)/K, replacing the model self-report", async () => {
  const e = edgeOf("X Two", "X One", 0.9);
  const ports = buildPorts({ responder: scriptResponder({ x: drawsOf(K, [[[e], 6]]) }) });
  const layer = await run(ports);
  const id = idByLabel(layer);
  const committed = layer.prerequisiteEdges.find((edge) => edge.prerequisiteDerivedNodeId === id.get("X Two") && edge.dependentDerivedNodeId === id.get("X One"));
  assert.ok(committed, "the 6/K pair is committed certain");
  assert.equal(committed.uncertain, false);
  assert.equal(committed.confidence, 6 / K, "confidence is the agreement fraction, not the 0.9 self-report");
  const vote = pairVote(ports.getTrace(), "x", id.get("X Two"), id.get("X One"));
  assert.equal(vote?.forward, 6);
  assert.equal(vote?.reverse, 0);
  assert.equal(vote?.k, K);
  assert.equal(vote?.consensusConfidence, 6 / K);
  assert.equal(vote?.classification, "consensus");
});

// D3: a pair voted in BOTH directions beyond the contest threshold is routed to uncertain
// (kept, flagged, path-excluded), never committed certain.
test("D3: a direction-contested pair is routed to uncertain, not committed certain", async () => {
  const fwd = edgeOf("X Two", "X One");
  const rev = edgeOf("X One", "X Two");
  // forward 5, reverse 3 → min/K = 3/8 = 0.375 ≥ the 0.2 default contest fraction.
  const ports = buildPorts({ responder: scriptResponder({ x: drawsOf(K, [[[fwd], 5], [[rev], 3]]) }) });
  const layer = await run(ports);
  const id = idByLabel(layer);
  const between = layer.prerequisiteEdges.filter(
    (e) => new Set([e.prerequisiteDerivedNodeId, e.dependentDerivedNodeId]).has(id.get("X Two")!) && new Set([e.prerequisiteDerivedNodeId, e.dependentDerivedNodeId]).has(id.get("X One")!)
  );
  assert.equal(between.length, 1, "exactly one uncertain edge for the contested pair");
  assert.equal(between[0].uncertain, true);
  // Majority direction is X Two -> X One (5 vs 3).
  assert.equal(between[0].prerequisiteDerivedNodeId, id.get("X Two"));
  const vote = pairVote(ports.getTrace(), "x", id.get("X Two"), id.get("X One"));
  assert.equal(vote?.forward, 5);
  assert.equal(vote?.reverse, 3);
  assert.equal(vote?.classification, "direction_contested");
  // Excluded from the DAG handed to difficulty (uncertain edges never traverse).
  assert.ok(!(ports.getScoredEdges() ?? []).some((e) => e.uncertain), "no uncertain edge reaches the difficulty DAG input");
  assert.ok(!(ports.getScoredEdges() ?? []).some((e) => e.prerequisiteDerivedNodeId === id.get("X Two") && e.dependentDerivedNodeId === id.get("X One")));
  assert.ok((ports.getTrace()?.dispositions ?? []).some((d) => d.disposition === "uncertain"));
});

// D5/D6: the existing weak-edge floor IS the presence quorum — a 1/K edge is below it
// (weak_cut, recorded not committed) while a 7/K edge survives (kept).
test("D5/D6: presence quorum via the floor — 1/K is weak_cut, 7/K is kept", async () => {
  const strong = edgeOf("X Two", "X One");
  const sparse = edgeOf("X One", "X Three");
  // draw 0 has both; draws 1-6 have only the strong edge; draw 7 empty → strong 7/8, sparse 1/8.
  const ports = buildPorts({ responder: scriptResponder({ x: drawsOf(K, [[[strong, sparse], 1], [[strong], 6]]) }) });
  const layer = await run(ports);
  const id = idByLabel(layer);
  const kept = layer.prerequisiteEdges.find((e) => e.prerequisiteDerivedNodeId === id.get("X Two") && e.dependentDerivedNodeId === id.get("X One"));
  assert.ok(kept && !kept.uncertain, "the 7/8 edge is kept certain");
  assert.equal(kept.confidence, 7 / K);
  // The 1/8 edge is NOT committed (neither certain nor uncertain).
  assert.ok(!layer.prerequisiteEdges.some((e) => e.prerequisiteDerivedNodeId === id.get("X One") && e.dependentDerivedNodeId === id.get("X Three")));
  const dispositions = ports.getTrace()?.dispositions ?? [];
  assert.ok(dispositions.some((d) => d.disposition === "weak_cut" && d.prerequisiteDerivedNodeId === id.get("X One") && d.dependentDerivedNodeId === id.get("X Three")));
  // But the sparse pair WAS voted — it has a pairVote even though it was cut.
  assert.equal(pairVote(ports.getTrace(), "x", id.get("X One"), id.get("X Three"))?.forward, 1);
});

// KTD5: weak-cut runs BEFORE cycle-routing — a sub-floor edge that would close a cycle is
// cut first, leaving the strong, otherwise-acyclic core committed (not routed to uncertain).
test("KTD5: a sub-floor cycle-closing edge is weak-cut first, the strong core stays certain", async () => {
  const abc: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x"), concept("c", "C", "x")],
    evidenceProfiles: ["a", "b", "c"].map((cid, i) => ({ conceptId: cid, definitions: [passage(`d${i}`, `${cid} def`)], mentions: [], assertions: [] }))
  };
  const ab = edgeOf("A", "B");
  const bc = edgeOf("B", "C");
  const ca = edgeOf("C", "A");
  // A->B and B->C in all 8 draws (1.0); C->A in only 3 draws (0.375 < 0.5 floor → weak-cut).
  const ports = buildPorts({ snapshot: abc, responder: scriptResponder({ x: drawsOf(K, [[[ab, bc, ca], 3], [[ab, bc], 5]]) }) });
  const layer = await run(ports);
  const id = idByLabel(layer);
  const certain = layer.prerequisiteEdges.filter((e) => !e.uncertain);
  const uncertain = layer.prerequisiteEdges.filter((e) => e.uncertain);
  assert.equal(uncertain.length, 0, "the strong A->B->C core is NOT routed to uncertain");
  assert.ok(certain.some((e) => e.prerequisiteDerivedNodeId === id.get("A") && e.dependentDerivedNodeId === id.get("B")));
  assert.ok(certain.some((e) => e.prerequisiteDerivedNodeId === id.get("B") && e.dependentDerivedNodeId === id.get("C")));
  assert.ok(!certain.some((e) => e.prerequisiteDerivedNodeId === id.get("C") && e.dependentDerivedNodeId === id.get("A")), "C->A is gone (weak-cut)");
  assert.ok((ports.getTrace()?.dispositions ?? []).some((d) => d.disposition === "weak_cut"));
});

// D7: K draws whose per-pair winners form a MULTI-NODE aggregate cycle A->B->C->A (each one
// strong and one-directional) are cycle-routed to uncertain — and there is NO K+1 correction
// call (the re-prompt is gone, KTD4).
test("D7: an aggregate multi-node cycle is cycle-routed to uncertain in exactly K draws", async () => {
  const abc: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x"), concept("c", "C", "x")],
    evidenceProfiles: ["a", "b", "c"].map((cid, i) => ({ conceptId: cid, definitions: [passage(`d${i}`, `${cid} def`)], mentions: [], assertions: [] }))
  };
  const cyclic = [edgeOf("A", "B"), edgeOf("B", "C"), edgeOf("C", "A")];
  // Every draw asserts the same one-directional cycle; the aggregate strong set is cyclic.
  const ports = buildPorts({ snapshot: abc, responder: (input) => presentEdges(input, cyclic) });
  const layer = await run(ports);
  assert.equal(ports.callsForDomain("x"), K, "exactly K draws — no K+1 correction call");
  const uncertain = layer.prerequisiteEdges.filter((e) => e.uncertain);
  const certain = layer.prerequisiteEdges.filter((e) => !e.uncertain);
  assert.equal(uncertain.length, 3, "all three aggregate-cycle edges route to uncertain");
  assert.equal(certain.length, 0);
  const xTrace = ports.getTrace()?.orderings.find((o) => o.declaredDomain === "x");
  assert.equal(xTrace?.cycleRoutedEdges.length, 3);
  assert.equal((ports.getTrace()?.dispositions ?? []).filter((d) => d.disposition === "uncertain").length, 3);
});

// Replay property: the SAME multiset of K draws fed in two different orders yields identical
// pairVotes and the identical committed/uncertain/weak split (aggregation is order-independent).
test("replay: the same draw multiset in different orders yields identical pairVotes and split", async () => {
  const fwd = edgeOf("X Two", "X One");
  const rev = edgeOf("X One", "X Two");
  const orderA = buildPorts({ responder: scriptResponder({ x: drawsOf(K, [[[fwd], 5], [[rev], 3]]) }) });
  // Same multiset (5 forward, 3 reverse), interleaved differently.
  const interleaved: LabelEdge[][] = [[rev], [fwd], [rev], [fwd], [rev], [fwd], [fwd], [fwd]];
  const orderB = buildPorts({ responder: scriptResponder({ x: interleaved }) });
  const layerA = await run(orderA);
  const layerB = await run(orderB);
  const votesA = orderA.getTrace()?.orderings.find((o) => o.declaredDomain === "x")?.pairVotes;
  const votesB = orderB.getTrace()?.orderings.find((o) => o.declaredDomain === "x")?.pairVotes;
  assert.deepEqual(votesA, votesB, "pairVotes are order-independent");
  const split = (layer: DerivedGraphLayer) => ({
    certain: layer.prerequisiteEdges.filter((e) => !e.uncertain).length,
    uncertain: layer.prerequisiteEdges.filter((e) => e.uncertain).length
  });
  assert.deepEqual(split(layerA), split(layerB));
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
  assert.ok(layer.derivedNodes.some((node) => node.canonicalLabel === "Empty"));
});

// AE4 / R16: a domain over the token budget fails closed with no partial layer; no chunking.
test("fails closed without persisting when a domain exceeds the token budget", async () => {
  const ports = buildPorts();
  await assert.rejects(() => run(ports, { config: configWith({ maxDomainPromptChars: 5 }) }), /exceeds the budget/);
  assert.equal(ports.getPersistCalls(), 0, "no partial layer persisted");
});

// R9: an edge citing a number outside the judged set is rejected fail-closed, never guessed.
// The boundary owns the provable guarantee even if a draw slipped past the per-call validator.
test("rejects an edge citing a number outside the judged set (rule 6)", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x" ? { edges: [{ prerequisiteNumber: 1, dependentNumber: 99, confidence: 0.9, rationale: "mock" }] } : { edges: [] };
  const ports = buildPorts({ responder });
  await assert.rejects(() => run(ports), /outside the listed/);
  assert.equal(ports.getPersistCalls(), 0);
});

// R9: an edge naming one concept as its own prerequisite is rejected fail-closed.
test("rejects a self-edge (one concept as its own prerequisite)", async () => {
  const responder: Responder = (input) =>
    input.declaredDomain === "x" ? { edges: [{ prerequisiteNumber: 1, dependentNumber: 1, confidence: 0.9, rationale: "mock" }] } : { edges: [] };
  const ports = buildPorts({ responder });
  await assert.rejects(() => run(ports), /its own prerequisite/);
  assert.equal(ports.getPersistCalls(), 0);
});

// R13: a redundant transitive shortcut among stable certain edges is reduced; the trace records it.
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

test("persists a layer free of embedding and candidate-group fields with the unversioned artifact type", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(layer.judgeModel, "mock-ordering");
  assert.ok(!("embeddingModel" in layer));
  for (const edge of layer.prerequisiteEdges) {
    assert.ok(!("candidateGroupId" in edge));
    assert.ok(!("evidencePacketRef" in edge.provenance));
  }
  assert.equal(ports.getPersisted()?.enrichmentId, "e1");
  assert.equal(ports.getArtifactType(), "enrichment_run");
  // One ordering trace per domain (R1), each naming the ordering model and carrying k + pairVotes.
  assert.equal(ports.getTrace()?.orderings.length, 2);
  assert.ok(ports.getTrace()?.orderings.every((o) => o.judgeModel === "mock-ordering"));
  assert.ok(ports.getTrace()?.orderings.every((o) => o.k === K));
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

test("default config hash reflects the K-sample ordering reshape", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(DEFAULT_ENRICHMENT_CONFIG.enrichmentConfigHash, "k-sample-ordering");
  assert.equal(layer.enrichmentConfigHash, "k-sample-ordering");
});

// An evidence-free snapshot reaches no ordering draw and persists with only exclusions.
test("fails closed on an evidence-free snapshot without an ordering call", async () => {
  const ungrounded: GraphSnapshot = {
    graphVersionId: "v1",
    baseGraphVersionId: null,
    concepts: [concept("a", "A", "x"), concept("b", "B", "x")],
    evidenceProfiles: []
  };
  const ports = buildPorts({ snapshot: ungrounded });
  const layer = await run(ports);
  assert.equal(ports.calls.length, 0, "no ordering draw when nothing is evidenced");
  assert.equal(layer.prerequisiteEdges.length, 0);
  assert.equal(ports.getTrace()?.nodeExclusions.length, 2);
  assert.deepEqual(ports.getTrace()?.dispositions, []);
});

// An ordering draw that exhausts its forced-tool retry budget fails the run before persistence.
test("fails the run without persisting when an ordering draw throws", async () => {
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
  let drawIndex = 0;
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      orderedLabels.push(input.nodes.map((node) => node.canonicalLabel));
      return (options.responder ?? (() => ({ edges: [] })))(input, drawIndex++);
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

test("orders the rescued + minted + anchor node set in each of the K whole-set draws", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  await runNodes(ports);
  // K draws, each covering all three same-domain nodes (anchor ∪ rescued ∪ minted).
  assert.equal(ports.orderedLabels.length, K);
  for (const labels of ports.orderedLabels) {
    assert.deepEqual([...labels].sort(), ["Move Semantics", "Pointer", "Stack allocation"]);
  }
});

test("records the verbatim-floor grounding dispositions on the run", async () => {
  const ports = buildNodePorts({ rescue: [rescueCandidate("Pointer")], proposals: [{ proposedLabel: "Stack allocation", rationale: "r" }] });
  const layer = await runNodes(ports);
  const minted = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded");
  const rescued = layer.derivedNodes.find((node) => node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned");
  assert.ok(minted && rescued, "both enrichment node kinds survive the floor");
  assert.equal(layer.difficulties.length, layer.derivedNodes.length);
});
