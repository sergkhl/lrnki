import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnchorProjectionNode,
  ArtifactEnvelope,
  DerivedGraphLayer,
  DerivedGraphNode,
  EnrichmentRunTrace,
  GroundingAdmissionDisposition,
  LlmGroundedEnrichmentNode,
  MintingDisposition,
  NodeMergeRecord,
  PrerequisiteConceptContext,
  PublishedConceptEvidenceProfile,
  SourceMentionedEnrichmentNode,
  WholeSetOrdering
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { DifficultyPort, PrerequisiteOrderingPort } from "@lrnki/ports";
import {
  createDerivedGraphLayerCompletion,
  DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  type DerivedGraphCompletionConfig,
  type DerivedGraphCompletionRequest,
  type SourceGroundedContribution,
  type SyntheticContribution
} from "./completeDerivedGraphLayer";
import { NON_LLM_STAGES, passthroughStageBracket } from "./runProgressReporter";

// The completion seam is the ONE test surface for shared back-half policy (plan
// 2026-07-11-001 R11/KTD8): judgment contexts, exclusions, consensus/reduction
// dispositions, difficulty coverage, hook timing, artifact assembly, and every
// structural fail-closed guarantee with its zero-persistence proof. Producer suites
// keep only their distinct front halves and one typed-handoff contract each.

const config: DerivedGraphCompletionConfig = {
  enrichmentConfigHash: "test-config-hash",
  ...DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG
};
const K = config.orderingSampleCount;

// --- Node and evidence fixtures -----------------------------------------------

function anchor(derivedNodeId: string, conceptId: string, label: string, domain = "d", aliases: string[] = []): AnchorProjectionNode {
  return {
    nodeKind: "anchor",
    derivedNodeId,
    conceptId,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases
  };
}

function mentioned(derivedNodeId: string, label: string, quotes: string[], domain = "d"): SourceMentionedEnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId,
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases: [],
    groundingPassages: quotes.map((quote) => ({
      passageType: "mention",
      text: quote,
      groundingOrigin: "source_mentioned",
      sourceResourceId: "s1",
      sourceBlockId: "b1",
      evidenceQuote: quote,
      headingPath: [],
      locator: {},
      verbatimCheck: { disposition: "verified", sourceResourceId: "s1", sourceBlockId: "b1" }
    }))
  };
}

function grounded(derivedNodeId: string, label: string, role: "prerequisite" | "synthetic_primary" = "synthetic_primary", domain = "d"): LlmGroundedEnrichmentNode {
  const notApplicable = { disposition: "not_applicable_by_grounding" as const, rationale: "generated" };
  return {
    nodeKind: "enrichment",
    derivedNodeId,
    groundingOrigin: "llm_grounded",
    ...(role === "prerequisite" ? { mintingReason: "assumed_prerequisite" as const } : {}),
    role,
    layer: "derived",
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases: [],
    groundingBundle: {
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: `${label} means something.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }],
      mentions: [{ passageType: "mention", text: `${label} relates to the topic.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: notApplicable }],
      groundingAnchorReferences: [],
      generatingModel: "fake-gen",
      rationale: "generated"
    }
  };
}

function profile(conceptId: string, definitions: string[], mentions: string[] = [], defines?: string): PublishedConceptEvidenceProfile {
  const passage = (quote: string) => ({ sourceResourceId: "s1", sourceBlockId: "b1", evidenceQuote: quote, headingPath: [], locator: {} });
  return {
    conceptId,
    definitions: definitions.map(passage),
    mentions: mentions.map(passage),
    assertions: defines ? [{ type: "defines", literalValue: defines, evidence: [passage(definitions[0] ?? defines)] }] : []
  };
}

function mergeRecord(canonical: string, absorbed: string): NodeMergeRecord {
  return {
    declaredDomain: "d",
    canonicalDerivedNodeId: canonical,
    canonicalLabel: "Canonical",
    canonicalNodeKind: "anchor",
    absorbedDerivedNodeId: absorbed,
    absorbedLabel: "Absorbed",
    absorbedAliases: [],
    absorbedNodeKind: "enrichment",
    absorbedEvidence: ["absorbed quote"],
    proposingSignal: "embedding_cosine",
    proposingScore: 0.95,
    rationale: "same concept",
    canonicalSelectionReason: "anchor_over_enrichment"
  };
}

function mintingDisposition(
  derivedNodeId: string,
  proposedLabel: string,
  disposition: MintingDisposition["disposition"] = "accepted"
): MintingDisposition {
  return {
    derivedNodeId,
    proposedLabel,
    normalizedLabel: proposedLabel.toLowerCase(),
    declaredDomain: "d",
    anchorConceptId: "c1",
    disposition,
    rationale: "measured"
  };
}

function admissionDisposition(
  derivedNodeId: string,
  proposedLabel: string,
  disposition: GroundingAdmissionDisposition["disposition"] = "admitted"
): GroundingAdmissionDisposition {
  const base = {
    derivedNodeId,
    proposedLabel,
    normalizedLabel: proposedLabel.toLowerCase(),
    declaredDomain: "d",
    anchorConceptId: "c1"
  };
  if (disposition === "admitted") {
    return {
      ...base,
      disposition,
      probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" }
    };
  }
  if (disposition === "held_out") {
    return {
      ...base,
      disposition,
      reason: "knowledge_boundary",
      probe: { disposition: "boundary", agreementScore: 0.4, rationale: "unstable" }
    };
  }
  return {
    ...base,
    disposition,
    reason: "grounding_verification_exhausted",
    probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" },
    rationale: "claims rejected"
  };
}

// --- Ports ----------------------------------------------------------------------

type OrderInput = { declaredDomain: string; nodes: PrerequisiteConceptContext[] };
// A responder maps (call input, DRAW index within that domain) → one draw's ordering,
// authored by label and converted to the 1-based ordinal contract.
type Responder = (input: OrderInput, drawIndex: number) => { prerequisiteLabel: string; dependentLabel: string }[];

function presentEdges(input: OrderInput, edges: { prerequisiteLabel: string; dependentLabel: string }[]): WholeSetOrdering {
  const numberOf = (label: string): number => input.nodes.findIndex((node) => node.canonicalLabel === label) + 1;
  return {
    edges: edges
      .map((edge) => ({ prerequisiteNumber: numberOf(edge.prerequisiteLabel), dependentNumber: numberOf(edge.dependentLabel), confidence: 0.9, rationale: "mock" }))
      .filter((edge) => edge.prerequisiteNumber > 0 && edge.dependentNumber > 0)
  };
}

function buildHarness(options: {
  responder?: Responder;
  rawOrdering?: (input: OrderInput) => WholeSetOrdering | Promise<WholeSetOrdering>;
  difficulty?: DifficultyPort;
  onEvent?: (event: string) => void;
} = {}) {
  const orderCalls: OrderInput[] = [];
  const drawCounts = new Map<string, number>();
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      const drawIndex = drawCounts.get(input.declaredDomain) ?? 0;
      drawCounts.set(input.declaredDomain, drawIndex + 1);
      orderCalls.push(input);
      if (options.rawOrdering) return options.rawOrdering(input);
      return presentEdges(input, (options.responder ?? (() => []))(input, drawIndex));
    }
  };
  const events: string[] = [];
  const emit = (event: string) => {
    events.push(event);
    options.onEvent?.(event);
  };
  const difficulty: DifficultyPort = options.difficulty ?? {
    method: "fake-difficulty",
    async score({ nodes }) {
      emit("difficulty");
      return nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0.5, method: "fake-difficulty", components: {}, neuralRationale: "mock" }));
    }
  };
  let persistCalls = 0;
  let persisted: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> } | undefined;
  const enrichmentStore = {
    async persist(input: { layer: DerivedGraphLayer; artifact: ArtifactEnvelope<EnrichmentRunTrace> }) {
      persistCalls += 1;
      persisted = input;
      emit("persist");
    }
  };
  const stages: string[] = [];
  const recordingBracket = <T,>(stage: string, fn: () => Promise<T>): Promise<T> => {
    stages.push(stage);
    return fn();
  };
  const completion = createDerivedGraphLayerCompletion({ prerequisiteOrdering, difficulty, enrichmentStore });
  return {
    completion,
    orderCalls,
    events,
    emit,
    stages,
    recordingBracket,
    callsForDomain: (domain: string) => orderCalls.filter((call) => call.declaredDomain === domain).length,
    getPersistCalls: () => persistCalls,
    getPersisted: () => persisted
  };
}

function sourceContribution(overrides: Partial<SourceGroundedContribution> = {}): SourceGroundedContribution {
  return {
    kind: "source_grounded",
    graphVersionId: "v1",
    evidenceProfiles: [],
    absorbedGroundingByCanonical: new Map(),
    groundingDispositions: [],
    rescueDispositions: [],
    rescuedDefinitionDispositions: [],
    mintingDispositions: [],
    groundingAdmissionDispositions: [],
    nodeMerges: [],
    ...overrides
  };
}

function syntheticContribution(overrides: Partial<SyntheticContribution> = {}): SyntheticContribution {
  return {
    kind: "synthetic",
    graphVersionId: null,
    groundingDispositions: [],
    syntheticProbeDispositions: [],
    frontHalfCounts: { concepts: 0, core: 0, boundary: 0 },
    ...overrides
  };
}

function request(overrides: Partial<DerivedGraphCompletionRequest> = {}): DerivedGraphCompletionRequest {
  return {
    enrichmentId: "e1",
    nodes: [],
    config,
    stage: passthroughStageBracket,
    contribution: sourceContribution(),
    ...overrides
  };
}

const idByLabel = (layer: DerivedGraphLayer) =>
  new Map(layer.derivedNodes.map((node) => [node.canonicalLabel, node.derivedNodeId] as const));

// --- Judgment contexts and exclusions (AE1, KTD2) --------------------------------

test("anchor contexts preserve published definitions/assertions, cap mentions, and append absorbed grounding (AE1)", async () => {
  const harness = buildHarness();
  const nodes = [anchor("n1", "c1", "Alpha", "d", ["A"]), anchor("n2", "c2", "Beta")];
  await harness.completion.complete(request({
    nodes,
    contribution: sourceContribution({
      evidenceProfiles: [
        profile("c1", ["Alpha is defined"], ["m1", "m2", "m3", "m4", "m5", "m6", "m7"], "the first concept"),
        profile("c2", ["Beta is defined"])
      ],
      absorbedGroundingByCanonical: new Map([["n1", ["absorbed quote"]]])
    })
  }));
  const call = harness.orderCalls[0];
  const alpha = call.nodes.find((node) => node.canonicalLabel === "Alpha");
  assert.ok(alpha);
  assert.deepEqual(alpha.definitions, ["Alpha is defined"]);
  // The default bound of six even though the CEP holds seven; absorbed evidence appends after.
  assert.deepEqual(alpha.mentions, ["m1", "m2", "m3", "m4", "m5", "m6", "absorbed quote"]);
  assert.deepEqual(alpha.assertions, [{ type: "defines", detail: "the first concept" }]);
  assert.deepEqual(alpha.aliases, ["A"]);
});

test("a source_mentioned node's context is its verbatim mention quotes; an llm_grounded node's is its generated bundle", async () => {
  const harness = buildHarness();
  const nodes = [
    anchor("n1", "c1", "Alpha"),
    mentioned("n2", "Pointer", ["Pointer is mentioned"]),
    grounded("n3", "Stack", "prerequisite")
  ];
  await harness.completion.complete(request({
    nodes,
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Alpha is defined"])],
      mintingDispositions: [
        {
          derivedNodeId: "n3",
          proposedLabel: "Stack",
          normalizedLabel: "stack",
          declaredDomain: "d",
          anchorConceptId: "c1",
          disposition: "accepted",
          rationale: "durable"
        }
      ],
      groundingAdmissionDispositions: [
        {
          derivedNodeId: "n3",
          proposedLabel: "Stack",
          normalizedLabel: "stack",
          declaredDomain: "d",
          anchorConceptId: "c1",
          disposition: "admitted",
          probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" }
        }
      ]
    })
  }));
  const call = harness.orderCalls[0];
  const pointer = call.nodes.find((node) => node.canonicalLabel === "Pointer");
  assert.ok(pointer);
  assert.deepEqual(pointer.definitions, []);
  assert.deepEqual(pointer.mentions, ["Pointer is mentioned"]);
  const stack = call.nodes.find((node) => node.canonicalLabel === "Stack");
  assert.ok(stack);
  assert.deepEqual(stack.definitions, ["Stack means something."]);
});

test("an evidence-free node is excluded from ordering, recorded once, still in the layer, and still scored (AE1)", async () => {
  const harness = buildHarness();
  const nodes = [anchor("n1", "c1", "Grounded"), anchor("n2", "c2", "Empty"), anchor("n3", "c3", "Helper")];
  const layer = await harness.completion.complete(request({
    nodes,
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Grounded def"]), profile("c3", ["Helper def"])]
    })
  }));
  const call = harness.orderCalls[0];
  assert.equal(call.nodes.length, 2, "the empty node never reaches the ordering call");
  assert.ok(!call.nodes.some((node) => node.canonicalLabel === "Empty"));
  const trace = harness.getPersisted()!.artifact.payload;
  assert.deepEqual(trace.nodeExclusions, [{ derivedNodeId: "n2", declaredDomain: "d", reason: "insufficient_evidence" }]);
  assert.ok(layer.derivedNodes.some((node) => node.canonicalLabel === "Empty"), "excluded from ordering, not from the layer");
  assert.equal(layer.difficulties.length, 3, "difficulty scores ALL derived nodes");
});

test("groups ordering by Declared Domain with K draws per multi-node domain and zero for singletons", async () => {
  const harness = buildHarness();
  const nodes = [anchor("n1", "c1", "A", "x"), anchor("n2", "c2", "B", "x"), anchor("n3", "c3", "C", "y")];
  await harness.completion.complete(request({
    nodes,
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["A def"]), profile("c2", ["B def"]), profile("c3", ["C def"])]
    })
  }));
  assert.equal(harness.callsForDomain("x"), K);
  assert.equal(harness.callsForDomain("y"), 0, "a singleton domain draws nothing");
  const trace = harness.getPersisted()!.artifact.payload;
  assert.equal(trace.orderings.length, 2, "one ordering trace per domain, singleton included");
});

test("a zero-node request completes with an empty layer and one persisted artifact", async () => {
  const harness = buildHarness();
  const layer = await harness.completion.complete(request({ nodes: [] }));
  assert.equal(harness.orderCalls.length, 0);
  assert.deepEqual(layer.prerequisiteEdges, []);
  assert.deepEqual(layer.difficulties, []);
  assert.equal(harness.getPersistCalls(), 1);
});

// --- Consensus dispositions and reduction (AE3) -----------------------------------

// One domain, five nodes: N1→N2→N3 stable in every draw plus the redundant N1→N3
// shortcut (transitively reduced); N3→N4 present in only 3/8 draws (weak-cut, agreement
// 0.375 < 0.5, never reversed so not contested); N4→N5 direction contested 5 forward /
// 3 reverse (min/K = 0.375 ≥ 0.1 → uncertain).
const ae3Responder: Responder = (_input, drawIndex) => {
  const edges = [
    { prerequisiteLabel: "N1", dependentLabel: "N2" },
    { prerequisiteLabel: "N2", dependentLabel: "N3" },
    { prerequisiteLabel: "N1", dependentLabel: "N3" }
  ];
  if (drawIndex < 3) edges.push({ prerequisiteLabel: "N3", dependentLabel: "N4" });
  edges.push(drawIndex < 5
    ? { prerequisiteLabel: "N4", dependentLabel: "N5" }
    : { prerequisiteLabel: "N5", dependentLabel: "N4" });
  return edges;
};

function ae3Nodes() {
  return ["N1", "N2", "N3", "N4", "N5"].map((label, index) => anchor(`n${index + 1}`, `c${index + 1}`, label));
}
const ae3Profiles = () => ["c1", "c2", "c3", "c4", "c5"].map((conceptId, index) => profile(conceptId, [`N${index + 1} def`]));

test("certain edges are reduced, uncertain edges retained, and each common disposition recorded exactly once (AE3)", async () => {
  const harness = buildHarness({ responder: ae3Responder });
  const layer = await harness.completion.complete(request({
    nodes: ae3Nodes(),
    contribution: sourceContribution({ evidenceProfiles: ae3Profiles() })
  }));
  const id = idByLabel(layer);
  const edge = (prereq: string, dep: string) =>
    layer.prerequisiteEdges.find((e) => e.prerequisiteDerivedNodeId === id.get(prereq) && e.dependentDerivedNodeId === id.get(dep));
  assert.ok(edge("N1", "N2") && !edge("N1", "N2")!.uncertain);
  assert.ok(edge("N2", "N3") && !edge("N2", "N3")!.uncertain);
  assert.ok(!edge("N1", "N3"), "the redundant shortcut is transitively reduced");
  assert.ok(!edge("N3", "N4"), "the sub-quorum edge is weak-cut");
  assert.ok(edge("N4", "N5")?.uncertain, "the contested pair is retained uncertain in its majority direction");
  assert.equal(layer.prerequisiteEdges.length, 3);

  const trace = harness.getPersisted()!.artifact.payload;
  const byKind = new Map<string, number>();
  for (const d of trace.dispositions) byKind.set(d.disposition, (byKind.get(d.disposition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries([...byKind.entries()].sort()), {
    kept: 2,
    transitive_reduction: 1,
    uncertain: 1,
    weak_cut: 1
  });
  const ordering = trace.orderings[0];
  assert.equal(ordering.k, K);
  assert.equal(ordering.judgeModel, "mock-ordering");
  assert.equal(ordering.pairVotes.filter((vote) => vote.classification === "direction_contested").length, 1);
});

test("the source-grounded ordering summary fires after reduction with trace-consistent counts while difficulty runs independently", async () => {
  const harness = buildHarness();
  let summary: { k: number; committed: number; contested: number; weakCut: number; cycleRouted: number } | undefined;
  await buildHarness({ responder: ae3Responder }).completion.complete(request({
    nodes: ae3Nodes(),
    contribution: sourceContribution({
      evidenceProfiles: ae3Profiles(),
      onOrderingSummary: (value) => {
        summary = value;
      }
    })
  }));
  assert.deepEqual(summary, { k: K, committed: 2, contested: 1, weakCut: 1, cycleRouted: 0 });
  // Difficulty starts without waiting for the ordering branch's summary.
  const events: string[] = [];
  const timed = buildHarness({ responder: ae3Responder, onEvent: (event) => events.push(event) });
  await timed.completion.complete(request({
    nodes: ae3Nodes(),
    contribution: sourceContribution({
      evidenceProfiles: ae3Profiles(),
      onOrderingSummary: () => events.push("orderingSummary")
    })
  }));
  assert.deepEqual(events, ["difficulty", "orderingSummary", "persist"]);
  assert.ok(harness, "silence the unused base harness");
});

test("an ordering-summary hook error propagates after difficulty has started and persists nothing", async () => {
  const harness = buildHarness({ responder: ae3Responder });
  await assert.rejects(
    () => harness.completion.complete(request({
      nodes: ae3Nodes(),
      contribution: sourceContribution({
        evidenceProfiles: ae3Profiles(),
        onOrderingSummary: () => {
          throw new Error("summary sink failed");
        }
      })
    })),
    /summary sink failed/
  );
  assert.equal(harness.getPersistCalls(), 0);
  assert.ok(harness.events.includes("difficulty"));
});

// --- Synthetic variant (AE2) -------------------------------------------------------

function syntheticNodes() {
  return [grounded("s1", "Concept A"), grounded("s2", "Concept B")];
}

function syntheticRequest(overrides: Partial<SyntheticContribution> = {}): DerivedGraphCompletionRequest {
  return request({
    nodes: syntheticNodes(),
    contribution: syntheticContribution({
      groundingDispositions: [
        { derivedNodeId: "s1", groundingOrigin: "llm_grounded", outcome: "not_applicable_by_grounding", rationale: "generated" },
        { derivedNodeId: "s2", groundingOrigin: "llm_grounded", outcome: "not_applicable_by_grounding", rationale: "generated" }
      ],
      syntheticProbeDispositions: [
        { conceptKey: "a", canonicalLabel: "Concept A", declaredDomain: "d", disposition: "core_knowledge", agreementScore: 1, rationale: "stable", derivedNodeId: "s1" },
        { conceptKey: "b", canonicalLabel: "Concept B", declaredDomain: "d", disposition: "core_knowledge", agreementScore: 1, rationale: "stable", derivedNodeId: "s2" },
        { conceptKey: "c", canonicalLabel: "Concept C", declaredDomain: "d", disposition: "boundary", agreementScore: 0, rationale: "dispersed", derivedNodeId: null }
      ],
      frontHalfCounts: { concepts: 3, core: 2, boundary: 1 },
      ...overrides
    })
  });
}

test("a synthetic completion keeps null provenance, empty source-only arrays, and present probe dispositions (AE2)", async () => {
  const harness = buildHarness({ responder: () => [{ prerequisiteLabel: "Concept A", dependentLabel: "Concept B" }] });
  const layer = await harness.completion.complete(syntheticRequest());
  assert.equal(layer.graphVersionId, null);
  const persisted = harness.getPersisted()!;
  assert.equal(persisted.layer.graphVersionId, null);
  assert.equal(persisted.artifact.graphVersionId, undefined, "the synthetic artifact envelope omits the version key");
  const trace = persisted.artifact.payload;
  assert.equal(trace.graphVersionId, null);
  assert.deepEqual(trace.rescueDispositions, []);
  assert.deepEqual(trace.rescuedDefinitionDispositions, []);
  assert.deepEqual(trace.mintingDispositions, []);
  assert.deepEqual(trace.groundingAdmissionDispositions, []);
  assert.deepEqual(trace.nodeMerges, []);
  assert.equal(trace.syntheticProbeDispositions?.length, 3);
  assert.equal(trace.groundingDispositions.length, 2);
  // The generated bundle grounds the judgment contexts.
  const call = harness.orderCalls[0];
  assert.deepEqual(call.nodes.map((node) => node.definitions[0]).sort(), ["Concept A means something.", "Concept B means something."]);
});

test("a source-grounded trace has NO syntheticProbeDispositions key at all", async () => {
  const harness = buildHarness();
  await harness.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"])] })
  }));
  assert.ok(!("syntheticProbeDispositions" in harness.getPersisted()!.artifact.payload));
});

test("a source-grounded trace preserves durability and admission as separate proposal histories", async () => {
  const harness = buildHarness();
  const mintingDispositions = [
    mintingDisposition("n2", "Stack"),
    mintingDisposition("held", "Boundary"),
    mintingDisposition("rejected", "Refuted")
  ];
  const groundingAdmissionDispositions = [
    admissionDisposition("n2", "Stack"),
    admissionDisposition("held", "Boundary", "held_out"),
    admissionDisposition("rejected", "Refuted", "rejected")
  ];
  await harness.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha"), grounded("n2", "Stack", "prerequisite")],
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Alpha def"])],
      mintingDispositions,
      groundingAdmissionDispositions
    })
  }));

  const trace = harness.getPersisted()!.artifact.payload;
  assert.deepEqual(trace.mintingDispositions, mintingDispositions);
  assert.deepEqual(trace.groundingAdmissionDispositions, groundingAdmissionDispositions);
  assert.equal(trace.derivedNodes.some((node) => node.derivedNodeId === "held" || node.derivedNodeId === "rejected"), false);
});

test("the synthetic summary hook fires after difficulty and before persistence with front-half + layer counts", async () => {
  const events: string[] = [];
  let summary: unknown;
  const harness = buildHarness({
    responder: () => [{ prerequisiteLabel: "Concept A", dependentLabel: "Concept B" }],
    onEvent: (event) => events.push(event)
  });
  await harness.completion.complete(syntheticRequest({
    onSummary: (value) => {
      events.push("summary");
      summary = value;
    }
  }));
  assert.deepEqual(events, ["difficulty", "summary", "persist"]);
  assert.deepEqual(summary, { concepts: 3, core: 2, boundary: 1, nodes: 2, committedEdges: 1, uncertainEdges: 0 });
});

test("a synthetic summary hook error propagates before persistence and persists nothing", async () => {
  const harness = buildHarness();
  await assert.rejects(
    () => harness.completion.complete(syntheticRequest({
      onSummary: () => {
        throw new Error("summary sink failed");
      }
    })),
    /summary sink failed/
  );
  assert.equal(harness.getPersistCalls(), 0);
});

// --- Artifact assembly and persistence ---------------------------------------------

test("a valid request persists exactly once with producer metadata and returns the persisted layer", async () => {
  const harness = buildHarness();
  const layer = await harness.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"])] })
  }));
  assert.equal(harness.getPersistCalls(), 1);
  const persisted = harness.getPersisted()!;
  assert.equal(persisted.layer, layer, "the returned layer IS the persisted layer");
  assert.equal(layer.enrichmentConfigHash, "test-config-hash");
  assert.equal(layer.judgeModel, "mock-ordering");
  assert.equal(persisted.artifact.artifactId, "e1:enrichment-run");
  assert.equal(persisted.artifact.artifactType, "enrichment_run");
  assert.equal(persisted.artifact.graphVersionId, "v1");
  assert.equal(persisted.artifact.producer, "@lrnki/application");
  assert.equal(persisted.artifact.producerVersion, "0.8.0");
  assert.equal(persisted.artifact.configHash, "test-config-hash");
});

test("completion starts ordering and difficulty brackets before symbolic disposal, then persists after their join", async () => {
  const harness = buildHarness();
  await harness.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"])] }),
    stage: harness.recordingBracket
  }));
  assert.deepEqual(harness.stages, [
    STAGE_TAGS.prerequisiteOrdering,
    STAGE_TAGS.intrinsicDifficulty,
    NON_LLM_STAGES.symbolicDisposal,
    NON_LLM_STAGES.persist
  ]);
});

test("ordering and difficulty overlap and persistence waits for both branches", async () => {
  let releaseOrdering!: () => void;
  let releaseDifficulty!: () => void;
  const orderingGate = new Promise<void>((resolve) => { releaseOrdering = resolve; });
  const difficultyGate = new Promise<void>((resolve) => { releaseDifficulty = resolve; });
  const started: string[] = [];
  const harness = buildHarness({
    rawOrdering: async () => {
      started.push("ordering");
      await orderingGate;
      return { edges: [] };
    },
    difficulty: {
      method: "fake-difficulty",
      async score({ nodes }) {
        started.push("difficulty");
        await difficultyGate;
        return nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: 0.5, method: "fake-difficulty", components: {}, neuralRationale: "mock" }));
      }
    }
  });
  const completion = harness.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    config: { ...config, orderingSampleCount: 1 },
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["ordering", "difficulty"], "both independent neural branches start before either finishes");
  releaseDifficulty();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.getPersistCalls(), 0, "a completed difficulty branch cannot persist before ordering finishes");
  releaseOrdering();
  await completion;
  assert.equal(harness.getPersistCalls(), 1);
});

// --- Structural request validation (R8/R9, AE5) -------------------------------------

async function rejectsWithoutPersist(harness: ReturnType<typeof buildHarness>, req: DerivedGraphCompletionRequest, message: RegExp) {
  await assert.rejects(() => harness.completion.complete(req), message);
  assert.equal(harness.getPersistCalls(), 0, "a structural failure persists zero times");
}

test("duplicate derived node ids fail closed before any ordering call", async () => {
  const harness = buildHarness();
  await rejectsWithoutPersist(harness, request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n1", "c2", "Beta")]
  }), /duplicate derived node id/);
  assert.equal(harness.orderCalls.length, 0, "validation precedes neural work");
});

test("a source-grounded contribution with a null graphVersionId fails closed (AE5)", async () => {
  const harness = buildHarness();
  await rejectsWithoutPersist(harness, request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({ graphVersionId: null as unknown as string })
  }), /non-null graphVersionId/);
});

test("a synthetic contribution with a non-null graphVersionId fails closed (AE5)", async () => {
  const harness = buildHarness();
  await rejectsWithoutPersist(harness, request({
    nodes: syntheticNodes(),
    contribution: syntheticContribution({ graphVersionId: "v1" as unknown as null })
  }), /null graphVersionId/);
});

test("a node merge whose canonical node is not surviving fails closed", async () => {
  const harness = buildHarness();
  await rejectsWithoutPersist(harness, request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({ nodeMerges: [mergeRecord("ghost", "gone")] })
  }), /canonical node "ghost"/);
});

test("a node merge whose absorbed node still survives fails closed", async () => {
  const harness = buildHarness();
  await rejectsWithoutPersist(harness, request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    contribution: sourceContribution({ nodeMerges: [mergeRecord("n1", "n2")] })
  }), /absorbed node "n2"/);
});

test("a verified grounding disposition naming an unproven node fails; a failed one is a valid historical fact (AE5)", async () => {
  const bad = buildHarness();
  await rejectsWithoutPersist(bad, request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({
      groundingDispositions: [{ derivedNodeId: "ghost", groundingOrigin: "source_mentioned", outcome: "verified", rationale: "verbatim" }]
    })
  }), /grounding disposition/);

  const ok = buildHarness();
  await ok.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Alpha def"])],
      groundingDispositions: [{ derivedNodeId: "floor-dropped", groundingOrigin: "source_mentioned", outcome: "failed", rationale: "quote did not verify" }]
    })
  }));
  assert.equal(ok.getPersistCalls(), 1, "a failed floor outcome proves its own absence");
});

test("rescue/minting dispositions: dropped and floor-failed absences are valid histories; an accepted ghost fails (AE5)", async () => {
  const valid = buildHarness();
  await valid.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha"), mentioned("n2", "Pointer", ["Pointer is mentioned"])],
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Alpha def"])],
      groundingDispositions: [{ derivedNodeId: "floor-dropped", groundingOrigin: "source_mentioned", outcome: "failed", rationale: "quote did not verify" }],
      rescueDispositions: [
        { derivedNodeId: "n2", canonicalLabel: "Pointer", normalizedLabel: "pointer", declaredDomain: "d", disposition: "accepted", rationale: "durable", groundingSpan: "Pointer is mentioned" },
        { derivedNodeId: "vetoed", canonicalLabel: "Noise", normalizedLabel: "noise", declaredDomain: "d", disposition: "dropped", rationale: "not durable", groundingSpan: "noise" },
        { derivedNodeId: "floor-dropped", canonicalLabel: "Unverified", normalizedLabel: "unverified", declaredDomain: "d", disposition: "accepted", rationale: "durable", groundingSpan: "gone" }
      ],
      mintingDispositions: [
        { derivedNodeId: "released", proposedLabel: "Released", normalizedLabel: "released", declaredDomain: "d", anchorConceptId: "c1", disposition: "dropped", rationale: "not durable" }
      ]
    })
  }));
  assert.equal(valid.getPersistCalls(), 1);

  const invalid = buildHarness();
  await rejectsWithoutPersist(invalid, request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({
      rescueDispositions: [
        { derivedNodeId: "ghost", canonicalLabel: "Ghost", normalizedLabel: "ghost", declaredDomain: "d", disposition: "accepted", rationale: "durable", groundingSpan: "ghost" }
      ]
    })
  }), /rescue disposition/);
});

test("grounding-admission lifecycle mismatches fail closed before neural work or persistence", async (t) => {
  const cases: {
    name: string;
    nodes: DerivedGraphNode[];
    mintingDispositions: MintingDisposition[];
    groundingAdmissionDispositions: GroundingAdmissionDisposition[];
    message: RegExp;
  }[] = [
    {
      name: "admission without durability",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [],
      groundingAdmissionDispositions: [admissionDisposition("held", "Boundary", "held_out")],
      message: /no durability-kept proposal/
    },
    {
      name: "durability drop reaching admission",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [mintingDisposition("dropped", "Noise", "dropped")],
      groundingAdmissionDispositions: [admissionDisposition("dropped", "Noise", "rejected")],
      message: /no durability-kept proposal/
    },
    {
      name: "trace correlation disagreement",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [mintingDisposition("held", "Boundary")],
      groundingAdmissionDispositions: [
        { ...admissionDisposition("held", "Boundary", "held_out"), normalizedLabel: "different" }
      ],
      message: /disagrees with its minting disposition/
    },
    {
      name: "held-out proposal entering the layer",
      nodes: [anchor("n1", "c1", "Alpha"), grounded("held", "Boundary", "prerequisite")],
      mintingDispositions: [mintingDisposition("held", "Boundary")],
      groundingAdmissionDispositions: [admissionDisposition("held", "Boundary", "held_out")],
      message: /held_out grounding disposition.*entered the derived layer/
    },
    {
      name: "admitted proposal with no lifecycle",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [mintingDisposition("ghost", "Ghost")],
      groundingAdmissionDispositions: [admissionDisposition("ghost", "Ghost")],
      message: /admitted grounding disposition.*no proven lifecycle/
    },
    {
      name: "durability-kept proposal without admission",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [mintingDisposition("ghost", "Ghost")],
      groundingAdmissionDispositions: [],
      message: /no grounding-admission outcome/
    },
    {
      name: "source-less node without admission",
      nodes: [anchor("n1", "c1", "Alpha"), grounded("n2", "Stack", "prerequisite")],
      mintingDispositions: [],
      groundingAdmissionDispositions: [],
      message: /no admitted grounding disposition/
    },
    {
      name: "duplicate admission outcome",
      nodes: [anchor("n1", "c1", "Alpha")],
      mintingDispositions: [mintingDisposition("held", "Boundary")],
      groundingAdmissionDispositions: [
        admissionDisposition("held", "Boundary", "held_out"),
        admissionDisposition("held", "Boundary", "held_out")
      ],
      message: /duplicate grounding-admission disposition/
    }
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const harness = buildHarness();
      await rejectsWithoutPersist(harness, request({
        nodes: item.nodes,
        contribution: sourceContribution({
          evidenceProfiles: [profile("c1", ["Alpha def"])],
          mintingDispositions: item.mintingDispositions,
          groundingAdmissionDispositions: item.groundingAdmissionDispositions
        })
      }), item.message);
      assert.equal(harness.orderCalls.length, 0, "trace validation precedes neural work");
    });
  }
});

test("a rescued-definition disposition naming an unproven node fails; an absorbed node is a valid reference (AE5)", async () => {
  const invalid = buildHarness();
  await rejectsWithoutPersist(invalid, request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({
      rescuedDefinitionDispositions: [{ candidateKey: "ghost", sourceBlockId: "b1", evidenceQuote: "q", disposition: "kept", category: "establishes_meaning", rationale: "defines" }]
    })
  }), /rescued-definition disposition/);

  const absorbed = buildHarness();
  await absorbed.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha")],
    contribution: sourceContribution({
      evidenceProfiles: [profile("c1", ["Alpha def"])],
      nodeMerges: [mergeRecord("n1", "n9")],
      rescuedDefinitionDispositions: [{ candidateKey: "n9", sourceBlockId: "b1", evidenceQuote: "q", disposition: "kept", category: "establishes_meaning", rationale: "defines" }]
    })
  }));
  assert.equal(absorbed.getPersistCalls(), 1, "a merge-absorbed node is a proven lifecycle");
});

test("probe dispositions: a boundary naming a node or a core naming a ghost fails; boundary-null and core-surviving pass (AE5)", async () => {
  const boundaryWithNode = buildHarness();
  await rejectsWithoutPersist(boundaryWithNode, request({
    nodes: syntheticNodes(),
    contribution: syntheticContribution({
      syntheticProbeDispositions: [{ conceptKey: "c", canonicalLabel: "Concept C", declaredDomain: "d", disposition: "boundary", agreementScore: 0, rationale: "dispersed", derivedNodeId: "s1" }]
    })
  }), /boundary probe disposition/);

  const coreGhost = buildHarness();
  await rejectsWithoutPersist(coreGhost, request({
    nodes: syntheticNodes(),
    contribution: syntheticContribution({
      syntheticProbeDispositions: [{ conceptKey: "a", canonicalLabel: "Concept A", declaredDomain: "d", disposition: "core_knowledge", agreementScore: 1, rationale: "stable", derivedNodeId: "ghost" }]
    })
  }), /core probe disposition/);

  const coreNull = buildHarness();
  await rejectsWithoutPersist(coreNull, request({
    nodes: syntheticNodes(),
    contribution: syntheticContribution({
      syntheticProbeDispositions: [{ conceptKey: "a", canonicalLabel: "Concept A", declaredDomain: "d", disposition: "core_knowledge", agreementScore: 1, rationale: "stable", derivedNodeId: null }]
    })
  }), /core probe disposition/);

  const valid = buildHarness();
  await valid.completion.complete(syntheticRequest());
  assert.equal(valid.getPersistCalls(), 1);
});

// --- Neural-output validation (AE4) and port-failure propagation --------------------

test("an ordering draw citing an ordinal outside the judged set fails closed without persistence", async () => {
  const harness = buildHarness({ rawOrdering: () => ({ edges: [{ prerequisiteNumber: 99, dependentNumber: 1, confidence: 0.9, rationale: "junk" }] }) });
  await rejectsWithoutPersist(harness, request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
  }), /outside the listed concepts/);
});

function difficultyReturning(mutate: (ids: string[]) => string[]): DifficultyPort {
  return {
    method: "fake-difficulty",
    async score({ nodes }) {
      return mutate(nodes.map((node) => node.derivedNodeId)).map((derivedNodeId) => ({ derivedNodeId, score: 0.5, method: "fake-difficulty", components: {}, neuralRationale: "mock" }));
    }
  };
}

test("difficulty output that omits, duplicates, or invents a node id fails closed with zero persists (AE4)", async () => {
  const cases: { mutate: (ids: string[]) => string[]; message: RegExp }[] = [
    { mutate: (ids) => ids.slice(1), message: /omits 1 surviving derived node/ },
    { mutate: (ids) => [...ids, ids[0]], message: /more than once/ },
    { mutate: (ids) => [...ids.slice(1), "ghost"], message: /unknown derived node "ghost"/ }
  ];
  for (const { mutate, message } of cases) {
    const harness = buildHarness({ difficulty: difficultyReturning(mutate) });
    await rejectsWithoutPersist(harness, request({
      nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
      contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
    }), message);
  }
});

test("an ordering-only failure still starts difficulty and persists zero times", async () => {
  let difficultyCalls = 0;
  const orderingBoom = buildHarness({
    rawOrdering: () => {
      throw new Error("forced-tool retry budget exhausted");
    },
    difficulty: {
      method: "fake-difficulty",
      async score() {
        difficultyCalls += 1;
        return [];
      }
    }
  });
  await rejectsWithoutPersist(orderingBoom, request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
  }), /retry budget exhausted/);
  assert.equal(difficultyCalls, 1);
});

test("a difficulty-only failure still starts ordering and persists zero times", async () => {
  const difficultyBoom = buildHarness({
    difficulty: {
      method: "fake-difficulty",
      async score() {
        throw new Error("difficulty judge unavailable");
      }
    }
  });
  await rejectsWithoutPersist(difficultyBoom, request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
  }), /difficulty judge unavailable/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(difficultyBoom.orderCalls.length, K);
  assert.equal(difficultyBoom.getPersistCalls(), 0, "the ordering branch finishing after rejection still cannot persist");
});

test("simultaneous ordering and difficulty failures persist zero times", async () => {
  let difficultyCalls = 0;
  const bothBoom = buildHarness({
    rawOrdering: () => {
      throw new Error("ordering unavailable");
    },
    difficulty: {
      method: "fake-difficulty",
      async score() {
        difficultyCalls += 1;
        throw new Error("difficulty unavailable");
      }
    }
  });
  await assert.rejects(() => bothBoom.completion.complete(request({
    nodes: [anchor("n1", "c1", "Alpha"), anchor("n2", "c2", "Beta")],
    contribution: sourceContribution({ evidenceProfiles: [profile("c1", ["Alpha def"]), profile("c2", ["Beta def"])] })
  })), /ordering unavailable|difficulty unavailable/);
  assert.equal(difficultyCalls, 1);
  assert.equal(bothBoom.orderCalls.length, K);
  assert.equal(bothBoom.getPersistCalls(), 0);
});
