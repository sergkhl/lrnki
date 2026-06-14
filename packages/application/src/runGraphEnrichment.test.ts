import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DerivedGraphLayer,
  GraphSnapshot,
  PrerequisiteJudgment,
  SourceBlock
} from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  DerivedGraphLayerStorePort,
  DifficultyPort,
  EmbeddingPort,
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
    }
  ]
};

function buildPorts() {
  const judgedPairs: { a: string; b: string; packet: SourceBlock[]; aDef?: string }[] = [];
  const graphStore: Pick<GraphVersionStorePort, "getPublishedSnapshot"> = {
    async getPublishedSnapshot() {
      return snapshot;
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
  const layerStore: Pick<DerivedGraphLayerStorePort, "persist"> = {
    async persist(layer) {
      persisted = layer;
    }
  };
  const appended: string[] = [];
  const artifacts: ArtifactRepositoryPort = {
    async append(artifact) {
      appended.push(artifact.artifactType);
    }
  };
  return { judgedPairs, graphStore, embedding, prerequisiteJudge, difficulty, layerStore, artifacts, getPersisted: () => persisted, appended };
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
    layerStore: ports.layerStore as DerivedGraphLayerStorePort,
    artifacts: ports.artifacts
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
    layerStore: ports.layerStore as DerivedGraphLayerStorePort,
    artifacts: ports.artifacts
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
    layerStore: ports.layerStore as DerivedGraphLayerStorePort,
    artifacts: ports.artifacts
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
  assert.ok(ports.appended.includes("graph_enrichment.v1"));
});
