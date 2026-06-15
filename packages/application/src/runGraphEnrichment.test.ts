import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DerivedGraphLayer,
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
import { runGraphEnrichment } from "./runGraphEnrichment";

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
    homograph: false
  };
}

function passage(blockId: string, quote: string) {
  return { sourceResourceId: "s1", sourceBlockId: blockId, evidenceQuote: quote, headingPath: ["X"], locator: {} };
}

// cx1 carries an explicit-prerequisite-hint at cx2 (labeled evidence the judge MAY
// weigh, never a directive) and a multi-mention CEP so the bound is observable.
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
        { type: "explicit-prerequisite-hint", objectConceptId: "cx2", evidence: [passage("b9", "understand X One before X Two")] },
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

// Default mock: directs the cx1/cx2 pair the OPPOSITE way the hint suggests
// (cx2->cx1) to prove the judge — not the hint — decides direction; cx1/cx3 is a
// plain directed edge; cx2/cx3 is uncertain; cy1/cy2 is none (dropped).
const defaultJudge: JudgeFn = (input) => {
  const ids = [input.a.conceptId, input.b.conceptId];
  const j = (p: string, d: string, outcome: PrerequisiteJudgment["outcome"], confidence: number): PrerequisiteJudgment =>
    ({ prerequisiteConceptId: p, dependentConceptId: d, outcome, confidence, rationale: "mock" });
  if (ids.includes("cx1") && ids.includes("cx2")) return j("cx2", "cx1", "directed", 0.9);
  if (ids.includes("cx1") && ids.includes("cx3")) return j("cx1", "cx3", "directed", 0.9);
  if (ids.includes("cx2") && ids.includes("cx3")) return j("cx2", "cx3", "uncertain", 0.4);
  return j(input.a.conceptId, input.b.conceptId, "none", 0.1);
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
    method: "dag-depth-mock",
    async score({ concepts }) {
      return concepts.map((c) => ({ conceptId: c.conceptId, score: 0, method: "dag-depth-mock", components: {} }));
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
  await run(ports);

  assert.equal(ports.judgedInputs.length, 4); // C(3,2)+C(2,2)
  const domainOf: Record<string, string> = { cx1: "x", cx2: "x", cx3: "x", cy1: "y", cy2: "y" };
  for (const input of ports.judgedInputs) {
    assert.equal(domainOf[input.a.conceptId], domainOf[input.b.conceptId], `cross-domain pair leaked: ${input.a.conceptId}/${input.b.conceptId}`);
  }
});

// Scenario 2: each judge call receives both Concepts' full CEPs (definitions,
// bounded mentions, labeled typed assertions) — never bare labels alone.
test("runGraphEnrichment passes both Concepts' CEPs to the judge with bounded mentions", async () => {
  const ports = buildPorts();
  await run(ports);

  const cx1cx2 = ports.judgedInputs.find((i) => [i.a.conceptId, i.b.conceptId].includes("cx1") && [i.a.conceptId, i.b.conceptId].includes("cx2"));
  assert.ok(cx1cx2, "expected the cx1/cx2 pair");
  const cx1 = cx1cx2.a.conceptId === "cx1" ? cx1cx2.a : cx1cx2.b;
  const cx2 = cx1cx2.a.conceptId === "cx2" ? cx1cx2.a : cx1cx2.b;

  assert.deepEqual(cx1.definitions, ["X One is the definition of X One"]);
  assert.deepEqual(cx2.definitions, ["X Two is the definition of X Two"]);
  // Default bound of six mentions is applied even though the CEP holds seven.
  assert.equal(cx1.mentions.length, 6);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two", "mention three", "mention four", "mention five", "mention six"]);
  // The explicit-prerequisite-hint is surfaced as labeled evidence with the TARGET
  // concept resolved to its canonical label (not an opaque id), and `defines`
  // surfaces its literal.
  assert.deepEqual(cx1.assertions, [
    { type: "explicit-prerequisite-hint", detail: "X Two" },
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
      maxMentionsPerConceptInPair: 2
    }
  });

  const cx1 = ports.judgedInputs.flatMap((i) => [i.a, i.b]).find((c) => c.conceptId === "cx1");
  assert.ok(cx1);
  assert.deepEqual(cx1.mentions, ["mention one", "mention two"]);
});

// Scenario 4 + 5: the judge's verdict — not the hint — sets direction; 'none' is
// dropped; 'uncertain' is retained flagged and path-excluded; directed survives.
test("runGraphEnrichment follows the judge over the hint, drops 'none', flags 'uncertain'", async () => {
  const ports = buildPorts();
  const layer = await run(ports);

  // cx1 hinted cx1->cx2, but the judge returned cx2->cx1: the edge follows the judge.
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteConceptId === "cx2" && e.dependentConceptId === "cx1" && !e.uncertain));
  assert.ok(!layer.prerequisiteEdges.some((e) => e.prerequisiteConceptId === "cx1" && e.dependentConceptId === "cx2"));
  // plain directed edge survives.
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteConceptId === "cx1" && e.dependentConceptId === "cx3" && !e.uncertain));
  // uncertain edge retained but flagged.
  assert.ok(layer.prerequisiteEdges.some((e) => e.uncertain));
  // 'none' (cy1/cy2) produced no edge.
  assert.ok(!layer.prerequisiteEdges.some((e) => [e.prerequisiteConceptId, e.dependentConceptId].includes("cy1")));

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
});

// Scenario 7: difficulty stays the dag-depth mock over the reduced DAG.
test("runGraphEnrichment scores difficulty with the dag-depth mock", async () => {
  const ports = buildPorts();
  const layer = await run(ports);
  assert.equal(layer.difficulties.length, 5);
  assert.ok(layer.difficulties.every((d) => d.method === "dag-depth-mock"));
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
  // Resolve later pairs first so completion order differs from input order.
  const judge: JudgeFn = async (input) => {
    const key = `${input.a.conceptId}/${input.b.conceptId}`;
    // Make only the first sorted pair slow so later pairs complete before it.
    const delay = key === "cx1/cx2" ? 30 : 1;
    await new Promise((resolve) => setTimeout(resolve, delay));
    completionOrder.push(key);
    return { prerequisiteConceptId: input.a.conceptId, dependentConceptId: input.b.conceptId, outcome: "none", confidence: 0.1, rationale: "mock" };
  };
  const ports = buildPorts({ judge });
  await run(ports, {
    config: {
      enrichmentConfigHash: "cep-pair-enrichment-v1",
      minEdgeConfidence: 0.5,
      judgeConcurrency: 2,
      maxMentionsPerConceptInPair: 6
    }
  });

  assert.ok(ports.getMaxInFlight() <= 2, `concurrency exceeded: ${ports.getMaxInFlight()}`);
  // Trace order follows sorted pair order, not completion order.
  const traceOrder = ports.getTrace()?.judgments.map((j) => `${j.a.conceptId}/${j.b.conceptId}`) ?? [];
  assert.deepEqual(traceOrder, ["cx1/cx2", "cx1/cx3", "cx2/cx3", "cy1/cy2"]);
  assert.notDeepEqual(completionOrder, traceOrder, "test setup should produce out-of-order completion");
});

// Scenario 8b: one exhausted pair (judge throws) fails the run before persistence.
test("runGraphEnrichment fails the run without persisting when a pair exhausts its budget", async () => {
  const judge: JudgeFn = (input) => {
    if (input.a.conceptId === "cx2" && input.b.conceptId === "cx3") {
      throw new Error("forced-tool retry budget exhausted");
    }
    return { prerequisiteConceptId: input.a.conceptId, dependentConceptId: input.b.conceptId, outcome: "none", confidence: 0.1, rationale: "mock" };
  };
  const ports = buildPorts({ judge });
  await assert.rejects(() => run(ports), /retry budget exhausted/);
  assert.equal(ports.getPersistCalls(), 0, "no partial enrichment run may be persisted");
});
