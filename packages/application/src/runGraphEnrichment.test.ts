import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DerivedGraphLayer,
  EnrichmentRunTrace,
  GraphSnapshot,
  PrerequisiteJudgment,
  SourceBlock
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EmbeddingPort,
  EnrichmentRunStorePort,
  GraphVersionStorePort,
  PrerequisiteJudgmentPort
} from "@lrnki/ports";
import { runGraphEnrichment } from "./runGraphEnrichment";

// Two Declared Domains: "x" has 3 concepts, "y" has 2. Prerequisites are always
// same-domain (ADR-0015), so the judge must see exactly C(3,2)+C(2,2)=3+1=4 pairs
// and never a cross-domain pair.
function concept(id: string, label: string, domain: string) {
  return {
    conceptId: id,
    iri: `https://lrnki.local/concept/${id}`,
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases: [],
    trustTier: "curated_source_grounded" as const,
    homograph: false
  };
}

const snapshot: GraphSnapshot = {
  graphVersionId: "v1",
  concepts: [
    concept("cx1", "X One", "x"),
    concept("cx2", "X Two", "x"),
    concept("cx3", "X Three", "x"),
    concept("cy1", "Y One", "y"),
    concept("cy2", "Y Two", "y")
  ],
  claims: [
    {
      claimId: "cl1",
      subjectConceptId: "cx1",
      predicate: "defined-as",
      object: { kind: "literal", value: "the definition of X One" },
      evidence: [{ sourceResourceId: "s1", sourceBlockId: "b1", evidenceQuote: "X One is the definition of X One" }],
      trustTier: "curated_source_grounded",
      modelConfidence: 0.9,
      evidenceCount: 1,
      contradictionState: "none"
    },
    {
      claimId: "cl2",
      subjectConceptId: "cx1",
      predicate: "uses",
      object: { kind: "concept", conceptId: "cx2" },
      evidence: [{ sourceResourceId: "s1", sourceBlockId: "b2", evidenceQuote: "X One uses X Two" }],
      trustTier: "curated_source_grounded",
      modelConfidence: 0.8,
      evidenceCount: 1,
      contradictionState: "none"
    },
    ...[
      ["cx2", "X Two"],
      ["cx3", "X Three"],
      ["cy1", "Y One"],
      ["cy2", "Y Two"]
    ].map(([conceptId, label], index) => ({
      claimId: `definition-${index}`,
      subjectConceptId: conceptId,
      predicate: "defined-as" as const,
      object: { kind: "literal" as const, value: `the definition of ${label}` },
      evidence: [{ sourceResourceId: "s1", sourceBlockId: `definition-block-${index}`, evidenceQuote: `${label} is the definition of ${label}` }],
      trustTier: "curated_source_grounded" as const,
      modelConfidence: 0.9,
      evidenceCount: 1,
      contradictionState: "none" as const
    }))
  ]
};

function buildPorts() {
  const judgedPairs: { a: string; b: string; packet: SourceBlock[]; aDef?: string }[] = [];
  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === snapshot.graphVersionId ? snapshot : undefined;
    }
  };
  const embedding: EmbeddingPort = {
    model: "mock-embedding",
    async embed({ texts }) {
      // Distinct unit vectors; clustering is irrelevant because small domains are
      // judged exhaustively, so the test does not depend on cosine geometry.
      return texts.map((_, index) => {
        const vector = new Array(texts.length).fill(0);
        vector[index] = 1;
        return vector;
      });
    }
  };
  const prerequisiteJudge: PrerequisiteJudgmentPort = {
    model: "mock-judge",
    async judge(input): Promise<PrerequisiteJudgment> {
      judgedPairs.push({ a: input.a.conceptId, b: input.b.conceptId, packet: input.evidencePacket, aDef: input.a.definition });
      const ids = [input.a.conceptId, input.b.conceptId];
      const directed = (p: string, d: string) =>
        ({ prerequisiteConceptId: p, dependentConceptId: d, outcome: "directed" as const, confidence: 0.9, rationale: "mock" });
      if (ids.includes("cx1") && ids.includes("cx2")) return directed("cx1", "cx2");
      if (ids.includes("cy1") && ids.includes("cy2")) return directed("cy1", "cy2");
      return { prerequisiteConceptId: input.a.conceptId, dependentConceptId: input.b.conceptId, outcome: "none", confidence: 0.1, rationale: "mock" };
    }
  };
  const difficulty: DifficultyPort = {
    method: "mock-difficulty",
    async score({ concepts }) {
      return concepts.map((c) => ({ conceptId: c.conceptId, score: 0, method: "mock-difficulty", components: {} }));
    }
  };
  let persisted: DerivedGraphLayer | undefined;
  let trace: EnrichmentRunTrace | undefined;
  let artifactType: string | undefined;
  const enrichmentStore: Pick<EnrichmentRunStorePort, "persist"> = {
    async persist(input) {
      persisted = input.layer;
      trace = input.artifact.payload;
      artifactType = input.artifact.artifactType;
    }
  };
  return {
    judgedPairs,
    graphStore,
    embedding,
    prerequisiteJudge,
    difficulty,
    enrichmentStore,
    getPersisted: () => persisted,
    getTrace: () => trace,
    getArtifactType: () => artifactType
  };
}

test("runGraphEnrichment gates pairs by Declared Domain and never judges cross-domain pairs", async () => {
  const ports = buildPorts();
  await runGraphEnrichment({
    enrichmentId: "e1",
    graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    embedding: ports.embedding,
    prerequisiteJudge: ports.prerequisiteJudge,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort
  });

  // Exactly the same-domain pairs: C(3,2) for x + C(2,2) for y = 4.
  assert.equal(ports.judgedPairs.length, 4);
  const domainOf: Record<string, string> = { cx1: "x", cx2: "x", cx3: "x", cy1: "y", cy2: "y" };
  for (const pair of ports.judgedPairs) {
    assert.equal(domainOf[pair.a], domainOf[pair.b], `cross-domain pair leaked: ${pair.a}/${pair.b}`);
  }
});

test("runGraphEnrichment assembles an evidence packet from claim quotes and definitions", async () => {
  const ports = buildPorts();
  await runGraphEnrichment({
    enrichmentId: "e1",
    graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    embedding: ports.embedding,
    prerequisiteJudge: ports.prerequisiteJudge,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort
  });

  const cx1Pair = ports.judgedPairs.find((pair) => [pair.a, pair.b].includes("cx1") && [pair.a, pair.b].includes("cx2"));
  assert.ok(cx1Pair, "expected the cx1/cx2 pair to be judged");
  // cx1's defined-as literal is surfaced as the concept definition.
  assert.equal(cx1Pair.aDef, "the definition of X One");
  // The verbatim claim evidence quote reaches the judge as a source block.
  const quotes = cx1Pair.packet.map((block) => block.text);
  assert.ok(quotes.includes("X One uses X Two"), "expected the claim evidence quote in the packet");
});

test("runGraphEnrichment maps directed judgments to a persisted layer and drops 'none'", async () => {
  const ports = buildPorts();
  const layer = await runGraphEnrichment({
    enrichmentId: "e1",
    graphVersionId: "v1",
    graphStore: ports.graphStore as GraphVersionStorePort,
    embedding: ports.embedding,
    prerequisiteJudge: ports.prerequisiteJudge,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort
  });

  // Two directed edges (cx1->cx2, cy1->cy2); the 'none' verdicts are dropped.
  assert.equal(layer.prerequisiteEdges.length, 2);
  assert.ok(layer.prerequisiteEdges.every((edge) => !edge.uncertain));
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteConceptId === "cx1" && e.dependentConceptId === "cx2"));
  assert.ok(layer.prerequisiteEdges.some((e) => e.prerequisiteConceptId === "cy1" && e.dependentConceptId === "cy2"));
  // Provenance: model identities recorded on the layer.
  assert.equal(layer.embeddingModel, "mock-embedding");
  assert.equal(layer.judgeModel, "mock-judge");
  // Persisted and an artifact envelope appended for replay.
  assert.equal(ports.getPersisted()?.enrichmentId, "e1");
  assert.equal(ports.getArtifactType(), "enrichment_run.v2");
  assert.equal(ports.getTrace()?.judgments.length, 4);
  assert.ok(ports.getTrace()?.dispositions.some((item) => item.disposition === "kept"));
});

test("runGraphEnrichment does not judge or infer from bare labels", async () => {
  const ports = buildPorts();
  const ungroundedSnapshot: GraphSnapshot = {
    graphVersionId: "v-empty",
    concepts: [concept("a", "A", "x"), concept("b", "B", "x")],
    claims: []
  };
  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot(graphVersionId) {
      return graphVersionId === ungroundedSnapshot.graphVersionId ? ungroundedSnapshot : undefined;
    }
  };

  const layer = await runGraphEnrichment({
    enrichmentId: "e-empty",
    graphVersionId: "v-empty",
    graphStore: graphStore as GraphVersionStorePort,
    embedding: ports.embedding,
    prerequisiteJudge: ports.prerequisiteJudge,
    difficulty: ports.difficulty,
    enrichmentStore: ports.enrichmentStore as EnrichmentRunStorePort
  });

  assert.equal(ports.judgedPairs.length, 0);
  assert.equal(layer.prerequisiteEdges.length, 0);
  assert.deepEqual(ports.getTrace()?.dispositions.map((item) => item.disposition), ["insufficient_evidence"]);
});
