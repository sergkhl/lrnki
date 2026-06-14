import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSnapshot, PublishedConceptIdentity, RunForBuild } from "@lrnki/domain-core";
import type { ArtifactRepositoryPort, ExtractionRunStorePort, GraphVersionStorePort } from "@lrnki/ports";
import { buildGraphVersion } from "./buildGraphVersion";

function runForBuild(overrides: Partial<RunForBuild> = {}): RunForBuild {
  return {
    runId: "run-1",
    sourceResourceId: "src-1",
    declaredDomain: "rust programming",
    coreCandidates: [
      { candidateKey: "ownership", canonicalLabel: "Rust ownership", normalizedLabel: "rust ownership", aliases: [] }
    ],
    quarantinedCandidates: [],
    verifiedClaims: [],
    ...overrides
  };
}

function fakes(runs: RunForBuild[]) {
  let published: GraphSnapshot | undefined;
  const runStore: ExtractionRunStorePort = {
    persist: async () => {},
    runsForBuildByIds: async () => runs
  };
  const graphStore: GraphVersionStorePort = {
    existingConceptIdentities: async (): Promise<PublishedConceptIdentity[]> => [],
    publish: async (input) => { published = input.snapshot; },
    getPublishedSnapshot: async (graphVersionId) => published?.graphVersionId === graphVersionId ? published : undefined,
    getLatestPublishedSnapshot: async () => published
  };
  const artifacts: ArtifactRepositoryPort = { append: async () => {} };
  return { runStore, graphStore, artifacts, getPublished: () => published };
}

test("buildGraphVersion refuses to publish when a selected run carries a quarantine decision", async () => {
  const runs = [
    runForBuild({
      quarantinedCandidates: [{ candidateKey: "mercury", canonicalLabel: "Mercury" }]
    })
  ];
  const { runStore, graphStore, artifacts, getPublished } = fakes(runs);

  await assert.rejects(
    () => buildGraphVersion({ graphVersionId: "gv-1", runIds: ["run-1"], runStore, graphStore, artifacts }),
    /unresolved quarantine decisions: run-1:Mercury/
  );
  assert.equal(getPublished(), undefined, "nothing should be published when a run is quarantined");
});

test("buildGraphVersion publishes when no selected run is quarantined", async () => {
  const { runStore, graphStore, artifacts, getPublished } = fakes([runForBuild()]);

  const snapshot = await buildGraphVersion({ graphVersionId: "gv-1", runIds: ["run-1"], runStore, graphStore, artifacts });

  assert.equal(snapshot.graphVersionId, "gv-1");
  assert.equal(snapshot.concepts.length, 1);
  assert.equal(snapshot.concepts[0].canonicalLabel, "Rust ownership");
  assert.ok(getPublished(), "a clean run set should publish");
});

test("buildGraphVersion publishes cross-domain homographs separately without quarantined trust", async () => {
  const rustRun = runForBuild({
    runId: "run-rust",
    declaredDomain: "rust programming",
    coreCandidates: [
      { candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }
    ]
  });
  const economicsRun = runForBuild({
    runId: "run-econ",
    declaredDomain: "economics",
    coreCandidates: [
      { candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }
    ]
  });
  const { runStore, graphStore, artifacts } = fakes([rustRun, economicsRun]);

  const snapshot = await buildGraphVersion({
    graphVersionId: "gv-homographs",
    runIds: ["run-rust", "run-econ"],
    runStore,
    graphStore,
    artifacts
  });

  assert.equal(snapshot.concepts.length, 2);
  assert.ok(snapshot.concepts.every((concept) => concept.homograph));
  assert.ok(snapshot.concepts.every((concept) => concept.trustTier === "curated_source_grounded"));
});
