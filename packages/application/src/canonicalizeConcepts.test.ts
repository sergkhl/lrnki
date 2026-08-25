import assert from "node:assert/strict";
import test from "node:test";
import {
  CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
  type ArtifactEnvelope,
  type BuildEvidenceProfile,
  type ConceptCanonicalizationArtifact,
  type GraphSnapshot,
  type NodeIdentityRelationship,
  type PublishedConceptIdentity,
  type RunForBuild
} from "@lrnki/domain-core";
import type {
  ConceptCanonicalizationStorePort,
  ExtractionRunStorePort,
  GraphVersionStorePort,
  NodeEmbeddingPort,
  NodeMergeAdjudicationPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import {
  canonicalizeConcepts,
  loadConceptCanonicalizationArtifact,
  summarizeConceptCanonicalization
} from "./canonicalizeConcepts";

function profile(candidateKey: string, definition = `${candidateKey} definition.`): BuildEvidenceProfile {
  return {
    candidateKey,
    definitions: [{
      sourceBlockId: `block-${candidateKey}`,
      evidenceQuote: definition,
      headingPath: ["Concepts"],
      locator: { page: 1 }
    }],
    mentions: [],
    assertions: [],
    complete: true
  };
}

function run(
  runId: string,
  candidateKey: string,
  canonicalLabel: string,
  normalizedLabel: string,
  declaredDomain = "economics"
): RunForBuild {
  return {
    runId,
    sourceResourceId: `source-${runId}`,
    declaredDomain,
    coreCandidates: [{ candidateKey, canonicalLabel, normalizedLabel, aliases: [] }],
    quarantinedCandidates: [],
    evidenceProfiles: [profile(candidateKey)]
  };
}

function memoryStore() {
  const artifacts = new Map<string, ArtifactEnvelope<ConceptCanonicalizationArtifact>>();
  const store: ConceptCanonicalizationStorePort = {
    async persist(artifact) {
      if (!artifacts.has(artifact.artifactId)) artifacts.set(artifact.artifactId, artifact);
    },
    async getById(artifactId) {
      return artifacts.get(artifactId);
    }
  };
  return { store, artifacts };
}

function dependencies(input: {
  runs: RunForBuild[];
  existing?: PublishedConceptIdentity[];
  base?: GraphSnapshot;
}) {
  const { store, artifacts } = memoryStore();
  const runStore: ExtractionRunStorePort = {
    persist: async () => {},
    runsForBuildByIds: async (runIds) => {
      const byId = new Map(input.runs.map((item) => [item.runId, item] as const));
      return runIds.map((runId) => byId.get(runId)!).filter(Boolean);
    }
  };
  const graphStore: GraphVersionStorePort = {
    existingConceptIdentities: async () => input.existing ?? [],
    publish: async () => {},
    getPublishedSnapshot: async (graphVersionId) =>
      input.base?.graphVersionId === graphVersionId ? input.base : undefined,
    getLatestPublishedSnapshot: async () => input.base
  };
  return { runStore, graphStore, store, artifacts };
}

function embedding(vectors: number[][] | Error): NodeEmbeddingPort & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "embedding-assignment",
    calls,
    async embed(texts) {
      calls.push(texts);
      if (vectors instanceof Error) throw vectors;
      return vectors.slice(0, texts.length);
    }
  };
}

function adjudicator(
  result: NodeIdentityRelationship | Error
): NodeMergeAdjudicationPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    model: "adjudicator-assignment",
    calls,
    async adjudicate(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return { relationship: result, rationale: `${result} because the meanings were inspected.` };
    }
  };
}

test("semantic Concept Canonicalization preserves ordered runs and persists one immutable artifact", async () => {
  const deps = dependencies({
    runs: [
      run("run-b", "bartering", "Bartering", "bartering"),
      run("run-a", "barter", "Barter", "barter")
    ],
    existing: [
      {
        conceptId: "00000000-0000-5000-8000-000000000002",
        iri: "https://lrnki.local/concept/zeta",
        normalizedLabel: "zeta",
        declaredDomain: "math"
      },
      {
        conceptId: "00000000-0000-5000-8000-000000000001",
        iri: "https://lrnki.local/concept/alpha",
        normalizedLabel: "alpha",
        declaredDomain: "math"
      }
    ]
  });
  const embed = embedding([[1, 0], [1, 0]]);
  const judge = adjudicator("equivalent");

  const artifact = await canonicalizeConcepts({
    artifactId: "canon-semantic",
    baseGraphVersionId: null,
    runIds: ["run-b", "run-a"],
    mode: "semantic",
    configHash: "canonicalization-config-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embed,
    adjudicator: judge
  });

  assert.equal(deps.artifacts.size, 1);
  assert.equal(await deps.store.getById("canon-semantic"), artifact);
  assert.deepEqual(artifact.payload.runIds, ["run-b", "run-a"]);
  assert.deepEqual(
    artifact.payload.publishedConceptIdentities.map((identity) => identity.normalizedLabel),
    ["alpha", "zeta"],
    "the captured registry is stable even when the adapter order is not"
  );
  assert.equal(artifact.payload.decisions.length, 1);
  assert.equal(artifact.payload.decisions[0].outcome, "merge");
  assert.equal(artifact.payload.decisions[0].decidingRelationship, "equivalent");
  assert.equal(artifact.payload.decisions[0].survivorNormalizedLabel, "barter");
  assert.equal("configHash" in artifact.payload.decisions[0], false);
  assert.equal(artifact.configHash, "canonicalization-config-1");
  assert.equal(embed.calls.length, 1);
  assert.equal(judge.calls.length, 1);
});

test("exact-label-only mode persists an attributable artifact and makes no neural call", async () => {
  const deps = dependencies({ runs: [run("run-1", "barter", "Barter", "barter")] });
  const embed = embedding(new Error("must not embed"));
  const judge = adjudicator(new Error("must not adjudicate"));

  const artifact = await canonicalizeConcepts({
    artifactId: "canon-exact",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    mode: "exact_label_only",
    configHash: "canonicalization-exact-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embed,
    adjudicator: judge
  });

  assert.equal(artifact.payload.mode, "exact_label_only");
  assert.deepEqual(artifact.payload.decisions, []);
  assert.deepEqual(artifact.payload.unavailable, []);
  assert.equal(embed.calls.length, 0);
  assert.equal(judge.calls.length, 0);
});

test("embedding failure is bounded and recorded without a semantic decision", async () => {
  const deps = dependencies({
    runs: [
      run("run-a", "barter", "Barter", "barter"),
      run("run-b", "bartering", "Bartering", "bartering")
    ]
  });
  const longReason = `embedding unavailable\u0000 ${"x".repeat(900)}`;
  const artifact = await canonicalizeConcepts({
    artifactId: "canon-embedding-unavailable",
    baseGraphVersionId: null,
    runIds: ["run-a", "run-b"],
    mode: "semantic",
    configHash: "canonicalization-config-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embedding(new Error(longReason)),
    adjudicator: adjudicator("equivalent")
  });

  assert.deepEqual(artifact.payload.decisions, []);
  assert.equal(artifact.payload.unavailable.length, 1);
  assert.equal(artifact.payload.unavailable[0].kind, "embedding");
  assert.ok(artifact.payload.unavailable[0].reason.length <= 500);
  assert.equal(artifact.payload.unavailable[0].reason.includes("\u0000"), false);
});

test("adjudication failure is unavailable, not a false distinct decision", async () => {
  const deps = dependencies({
    runs: [
      run("run-a", "barter", "Barter", "barter"),
      run("run-b", "bartering", "Bartering", "bartering")
    ]
  });
  const artifact = await canonicalizeConcepts({
    artifactId: "canon-adjudication-unavailable",
    baseGraphVersionId: null,
    runIds: ["run-a", "run-b"],
    mode: "semantic",
    configHash: "canonicalization-config-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embedding([[1, 0], [1, 0]]),
    adjudicator: adjudicator(new Error("judge unavailable"))
  });

  assert.equal(artifact.payload.decisions.some((decision) => decision.outcome === "distinct"), false);
  assert.deepEqual(artifact.payload.unavailable.map((item) => item.kind), ["adjudication"]);
});

test("an input/result judgment remains distinct even at cosine 1.0", async () => {
  const deps = dependencies({
    runs: [
      run("run-a", "barter", "Barter", "barter"),
      run("run-b", "bartering", "Bartering", "bartering")
    ]
  });
  const artifact = await canonicalizeConcepts({
    artifactId: "canon-distinct",
    baseGraphVersionId: null,
    runIds: ["run-a", "run-b"],
    mode: "semantic",
    configHash: "canonicalization-config-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embedding([[1, 0], [1, 0]]),
    adjudicator: adjudicator("input_or_result")
  });

  assert.deepEqual(artifact.payload.decisions.map((decision) => decision.outcome), ["distinct"]);
  assert.equal(artifact.payload.decisions[0].decidingRelationship, "input_or_result");
  assert.deepEqual(artifact.payload.unavailable, []);
});

test("merging two captured published identities records quarantine", async () => {
  const existing: PublishedConceptIdentity[] = [
    {
      conceptId: "00000000-0000-5000-8000-000000000001",
      iri: "https://lrnki.local/concept/barter",
      normalizedLabel: "barter",
      declaredDomain: "economics"
    },
    {
      conceptId: "00000000-0000-5000-8000-000000000002",
      iri: "https://lrnki.local/concept/bartering",
      normalizedLabel: "bartering",
      declaredDomain: "economics"
    }
  ];
  const deps = dependencies({
    runs: [
      run("run-a", "barter", "Barter", "barter"),
      run("run-b", "bartering", "Bartering", "bartering")
    ],
    existing
  });
  const artifact = await canonicalizeConcepts({
    artifactId: "canon-quarantine",
    baseGraphVersionId: null,
    runIds: ["run-a", "run-b"],
    mode: "semantic",
    configHash: "canonicalization-config-1",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    embedding: embedding([[1, 0], [1, 0]]),
    adjudicator: adjudicator("equivalent")
  });

  assert.deepEqual(artifact.payload.decisions.map((decision) => decision.outcome), ["quarantine"]);
  assert.equal(artifact.payload.decisions[0].decidingRelationship, "equivalent");
  assert.equal(artifact.payload.decisions[0].members.filter((member) => member.published).length, 2);
});

test("semantic mode requires both neural ports before an operation begins", async () => {
  const deps = dependencies({ runs: [run("run-1", "barter", "Barter", "barter")] });
  await assert.rejects(
    () => canonicalizeConcepts({
      artifactId: "canon-missing-port",
      baseGraphVersionId: null,
      runIds: ["run-1"],
      mode: "semantic",
      configHash: "canonicalization-config-1",
      runStore: deps.runStore,
      graphStore: deps.graphStore,
      canonicalizationStore: deps.store
    }),
    /requires both embedding and adjudication/
  );
  assert.equal(deps.artifacts.size, 0);
});

test("the canonicalization timeline and artifact share operation/config identity", async () => {
  const deps = dependencies({ runs: [run("run-1", "barter", "Barter", "barter")] });
  const calls: unknown[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation(input) { calls.push(["begin", input]); },
    async enterStage(input) { calls.push(["enter", input.stage]); },
    async recordProgress() {},
    async completeStage(input) { calls.push(["complete-stage", input.stage, input.ok]); },
    async completeOperation(input) { calls.push(["complete", input.status]); },
    async touch() {}
  };
  const artifact = await canonicalizeConcepts({
    artifactId: "00000000-0000-5000-8000-000000000010",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    mode: "exact_label_only",
    configHash: "canonicalization-config-shared",
    runStore: deps.runStore,
    graphStore: deps.graphStore,
    canonicalizationStore: deps.store,
    reporter
  });

  assert.deepEqual(calls[0], ["begin", {
    operationType: "canonicalization",
    operationId: artifact.artifactId,
    configHash: artifact.configHash
  }]);
  assert.deepEqual(calls.at(-1), ["complete", "succeeded"]);
});

test("stored artifact reads fail closed on wrong type and malformed decision invariants", async () => {
  const valid: ArtifactEnvelope<ConceptCanonicalizationArtifact> = {
    artifactId: "canon-invalid",
    artifactType: CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
    producer: "test",
    producerVersion: "1",
    configHash: "config",
    createdAt: "2026-08-23T00:00:00.000Z",
    payload: {
      mode: "semantic",
      baseGraphVersionId: null,
      runIds: ["run-1"],
      publishedConceptIdentities: [],
      decisions: [],
      unavailable: []
    }
  };
  const storeReturning = (artifact: unknown): ConceptCanonicalizationStorePort => ({
    persist: async () => {},
    getById: async () => artifact as ArtifactEnvelope<ConceptCanonicalizationArtifact>
  });

  await assert.rejects(
    () => loadConceptCanonicalizationArtifact(
      storeReturning({ ...valid, artifactType: "graph_snapshot" }),
      valid.artifactId
    ),
    /Wrong artifact type/
  );
  await assert.rejects(
    () => loadConceptCanonicalizationArtifact(
      storeReturning({
        ...valid,
        payload: {
          ...valid.payload,
          decisions: [{
            outcome: "merge",
            declaredDomain: "economics",
            members: [],
            survivorNormalizedLabel: "barter",
            proposingSignal: "embedding_cosine",
            proposingScore: 0.9,
            rationale: "same",
            decidingModel: "judge"
          }]
        }
      }),
      valid.artifactId
    ),
    /at least two members/
  );

  const legacyDistinct = {
    outcome: "distinct",
    declaredDomain: "economics",
    members: [
      {
        declaredDomain: "economics", normalizedLabel: "input", canonicalLabel: "Input",
        aliases: [], definitions: ["Input feeds the calculation."], published: false
      },
      {
        declaredDomain: "economics", normalizedLabel: "result", canonicalLabel: "Result",
        aliases: [], definitions: ["Result is calculated from Input."], published: false
      }
    ],
    survivorNormalizedLabel: null,
    proposingSignal: "embedding_cosine",
    proposingScore: 0.95,
    rationale: "legacy binary judgment kept the pair distinct",
    decidingModel: "legacy-judge"
  };
  const loadedLegacy = await loadConceptCanonicalizationArtifact(
    storeReturning({ ...valid, payload: { ...valid.payload, decisions: [legacyDistinct] } }),
    valid.artifactId
  );
  assert.equal(
    loadedLegacy.payload.decisions[0].decidingRelationship,
    "legacy_binary_distinct",
    "a pre-taxonomy immutable artifact remains readable without inventing a relationship"
  );

  await assert.rejects(
    () => loadConceptCanonicalizationArtifact(
      storeReturning({
        ...valid,
        payload: {
          ...valid.payload,
          decisions: [{ ...legacyDistinct, decidingRelationship: "equivalent" }]
        }
      }),
      valid.artifactId
    ),
    /cannot be equivalent for distinct/
  );
});

test("summary is stable and counts every artifact outcome", () => {
  const artifact = {
    artifactId: "canon-summary",
    payload: {
      mode: "semantic",
      runIds: ["run-1", "run-2"],
      decisions: [
        { outcome: "merge" },
        { outcome: "distinct" },
        { outcome: "quarantine" }
      ],
      unavailable: [{ kind: "embedding" }]
    }
  } as unknown as ArtifactEnvelope<ConceptCanonicalizationArtifact>;
  assert.deepEqual(summarizeConceptCanonicalization(artifact), {
    artifactId: "canon-summary",
    mode: "semantic",
    runCount: 2,
    mergeCount: 1,
    distinctCount: 1,
    quarantineCount: 1,
    unavailableCount: 1
  });
});
