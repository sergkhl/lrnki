import assert from "node:assert/strict";
import test from "node:test";
import type { ArtifactEnvelope, BuildEvidenceProfile, GraphSnapshot, PublishedConceptIdentity, RunForBuild } from "@lrnki/domain-core";
import type { ExtractionRunStorePort, GraphVersionStorePort } from "@lrnki/ports";
import { buildGraphVersion } from "./buildGraphVersion";

function profile(candidateKey: string, overrides: Partial<BuildEvidenceProfile> = {}): BuildEvidenceProfile {
  return {
    candidateKey,
    definitions: [{ sourceBlockId: `blk-${candidateKey}`, evidenceQuote: `${candidateKey} is defined here.`, headingPath: ["Intro"], locator: { page: 1 } }],
    mentions: [],
    assertions: [],
    complete: true,
    ...overrides
  };
}

function runForBuild(overrides: Partial<RunForBuild> = {}): RunForBuild {
  return {
    runId: "run-1",
    sourceResourceId: "src-1",
    declaredDomain: "rust programming",
    coreCandidates: [
      { candidateKey: "ownership", canonicalLabel: "Rust ownership", normalizedLabel: "rust ownership", aliases: [] }
    ],
    quarantinedCandidates: [],
    evidenceProfiles: [profile("ownership")],
    ...overrides
  };
}

function fakes(runs: RunForBuild[], existing: PublishedConceptIdentity[] = []) {
  const published = new Map<string, GraphSnapshot>();
  let last: GraphSnapshot | undefined;
  const artifacts: ArtifactEnvelope<GraphSnapshot>[] = [];
  const runStore: ExtractionRunStorePort = {
    persist: async () => {},
    runsForBuildByIds: async () => runs
  };
  const graphStore: GraphVersionStorePort = {
    existingConceptIdentities: async (): Promise<PublishedConceptIdentity[]> => existing,
    publish: async (input) => { published.set(input.snapshot.graphVersionId, input.snapshot); last = input.snapshot; artifacts.push(input.artifact); },
    getPublishedSnapshot: async (graphVersionId) => published.get(graphVersionId),
    getLatestPublishedSnapshot: async () => last
  };
  return { runStore, graphStore, artifacts, getPublished: () => last, published };
}

test("buildGraphVersion refuses to publish when a selected run carries a quarantine decision", async () => {
  const runs = [runForBuild({ quarantinedCandidates: [{ candidateKey: "mercury", canonicalLabel: "Mercury" }] })];
  const { runStore, graphStore, getPublished } = fakes(runs);

  await assert.rejects(
    () => buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }),
    /unresolved quarantine decisions: run-1:Mercury/
  );
  assert.equal(getPublished(), undefined, "nothing should be published when a run is quarantined");
});

test("buildGraphVersion publishes Concepts with CEPs and zero asserted edges (R5)", async () => {
  const { runStore, graphStore, getPublished } = fakes([runForBuild()]);

  const snapshot = await buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore });

  assert.equal(snapshot.graphVersionId, "gv-1");
  assert.equal(snapshot.baseGraphVersionId, null);
  assert.equal(snapshot.concepts.length, 1);
  assert.equal(snapshot.concepts[0].canonicalLabel, "Rust ownership");
  assert.equal(snapshot.evidenceProfiles.length, 1);
  assert.equal(snapshot.evidenceProfiles[0].definitions.length, 1);
  assert.ok(!("claims" in snapshot), "snapshot has no asserted-edge collection");
  assert.ok(getPublished(), "a clean run set should publish");
});

test("buildGraphVersion fails closed when a selected run has a core Concept without a complete CEP (U4.3)", async () => {
  const run = runForBuild({ evidenceProfiles: [profile("ownership", { complete: false, definitions: [] })] });
  const { runStore, graphStore, getPublished } = fakes([run]);

  await assert.rejects(
    () => buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }),
    /no complete Concept Evidence Profile/
  );
  assert.equal(getPublished(), undefined);
});

test("buildGraphVersion publishes cross-domain homographs separately (curated trust)", async () => {
  const rustRun = runForBuild({
    runId: "run-rust",
    declaredDomain: "rust programming",
    coreCandidates: [{ candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }],
    evidenceProfiles: [profile("ownership")]
  });
  const economicsRun = runForBuild({
    runId: "run-econ",
    sourceResourceId: "src-econ",
    declaredDomain: "economics",
    coreCandidates: [{ candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }],
    evidenceProfiles: [profile("ownership")]
  });
  const { runStore, graphStore } = fakes([rustRun, economicsRun]);

  const snapshot = await buildGraphVersion({ graphVersionId: "gv-homographs", baseGraphVersionId: null, runIds: ["run-rust", "run-econ"], runStore, graphStore });

  assert.equal(snapshot.concepts.length, 2);
  assert.ok(snapshot.concepts.every((concept) => concept.homograph));
  assert.ok(snapshot.concepts.every((concept) => concept.trustTier === "curated_source_grounded"));
});

test("an incremental build unions base + new source evidence on one Concept (AE2 / U4.1)", async () => {
  // Version A: source A teaches Ownership.
  const runA = runForBuild({
    runId: "run-a",
    sourceResourceId: "src-a",
    coreCandidates: [{ candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }],
    evidenceProfiles: [profile("ownership", {
      definitions: [{ sourceBlockId: "a-def", evidenceQuote: "Ownership governs memory in Rust.", headingPath: ["A"], locator: { page: 1 } }],
      mentions: [{ sourceBlockId: "a-men", evidenceQuote: "Ownership is checked at compile time.", headingPath: ["A"], locator: { page: 2 } }]
    })]
  });
  const a = fakes([runA]);
  const versionA = await buildGraphVersion({ graphVersionId: "gv-a", baseGraphVersionId: null, runIds: ["run-a"], runStore: a.runStore, graphStore: a.graphStore });
  const conceptId = versionA.concepts[0].conceptId;

  // Version B bases on A and selects source B, which adds new evidence to Ownership.
  const runB = runForBuild({
    runId: "run-b",
    sourceResourceId: "src-b",
    coreCandidates: [{ candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }],
    evidenceProfiles: [profile("ownership", {
      definitions: [{ sourceBlockId: "b-def", evidenceQuote: "Ownership is a discipline for resource lifetimes.", headingPath: ["B"], locator: { page: 5 } }],
      mentions: []
    })]
  });
  // Reuse A's published store as B's base + identity source.
  const existing: PublishedConceptIdentity[] = versionA.concepts.map((concept) => ({ conceptId: concept.conceptId, iri: concept.iri, normalizedLabel: concept.normalizedLabel, declaredDomain: concept.declaredDomain }));
  const b = fakes([runB], existing);
  // Wire B's base lookup to A's published snapshot.
  b.published.set("gv-a", versionA);
  const graphStoreB: GraphVersionStorePort = { ...b.graphStore, getPublishedSnapshot: async (id) => (id === "gv-a" ? versionA : b.published.get(id)) };

  const versionB = await buildGraphVersion({ graphVersionId: "gv-b", baseGraphVersionId: "gv-a", runIds: ["run-b"], runStore: b.runStore, graphStore: graphStoreB });

  assert.equal(versionB.concepts.length, 1, "the Concept identity is reused, not duplicated");
  assert.equal(versionB.concepts[0].conceptId, conceptId, "ADR-0015 stable identity reused across versions (U4.5)");
  assert.equal(versionB.concepts[0].trustTier, "cross_source_synthesized", "evidence now spans two sources");
  const cep = versionB.evidenceProfiles[0];
  const defQuotes = cep.definitions.map((d) => d.evidenceQuote).sort();
  assert.deepEqual(defQuotes, ["Ownership governs memory in Rust.", "Ownership is a discipline for resource lifetimes."], "base + new definitions unioned");
  assert.equal(cep.mentions.length, 1, "base mention carried forward");
});

test("identical evidence from one source is deduplicated; distinct quotes are kept (U4.2)", async () => {
  const run = runForBuild({
    evidenceProfiles: [profile("ownership", {
      definitions: [
        { sourceBlockId: "blk", evidenceQuote: "Ownership governs memory.", headingPath: ["A"], locator: { page: 1 } },
        { sourceBlockId: "blk", evidenceQuote: "Ownership governs memory.", headingPath: ["A"], locator: { page: 1 } }
      ],
      mentions: [
        { sourceBlockId: "blk2", evidenceQuote: "First mention.", headingPath: ["A"], locator: {} },
        { sourceBlockId: "blk3", evidenceQuote: "Second mention.", headingPath: ["A"], locator: {} }
      ]
    })]
  });
  const { runStore, graphStore } = fakes([run]);

  const snapshot = await buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore });
  const cep = snapshot.evidenceProfiles[0];
  assert.equal(cep.definitions.length, 1, "exact-duplicate definition collapsed");
  assert.equal(cep.mentions.length, 2, "distinct mentions retained");
});

test("buildGraphVersion fails when the named base version is not published", async () => {
  const { runStore, graphStore } = fakes([runForBuild()]);
  await assert.rejects(
    () => buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: "missing", runIds: ["run-1"], runStore, graphStore }),
    /Base graph version missing is not published/
  );
});

test("the published snapshot is written with its immutable artifact envelope", async () => {
  const { runStore, graphStore, artifacts } = fakes([runForBuild()]);
  await buildGraphVersion({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifactType, "graph_snapshot");
  assert.equal(artifacts[0].graphVersionId, "gv-1");
});
