import assert from "node:assert/strict";
import test from "node:test";
import type { ArtifactEnvelope, BuildEvidenceProfile, ConceptCanonicalizationArtifact, ConceptIdentityDecision, ConceptIdentityRef, GraphSnapshot, PublishedConceptIdentity, RefinementDecisionRecord, RunForBuild } from "@lrnki/domain-core";
import { CONCEPT_CANONICALIZATION_ARTIFACT_TYPE, CONCEPT_CANONICALIZATION_SELECTION_DECISION_TYPE, CONCEPT_IDENTITY_DECISION_TYPE } from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ExtractionRunStorePort, GraphVersionStorePort, RunProgressReporterPort } from "@lrnki/ports";
import { buildGraphVersion } from "./buildGraphVersion";
import { NON_LLM_STAGES } from "./runProgressReporter";

installNodeOperationTagContext();

type ReporterCall =
  | { method: "beginOperation"; operationType: string; operationId: string }
  | { method: "enterStage"; stage: string }
  | { method: "completeStage"; stage: string; ok: boolean }
  | { method: "completeOperation"; status: string };

function recordingReporter() {
  const calls: ReporterCall[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation(i) { calls.push({ method: "beginOperation", operationType: i.operationType, operationId: i.operationId }); },
    async enterStage(i) { calls.push({ method: "enterStage", stage: i.stage }); },
    async recordProgress() {},
    async completeStage(i) { calls.push({ method: "completeStage", stage: i.stage, ok: i.ok }); },
    async completeOperation(i) { calls.push({ method: "completeOperation", status: i.status }); },
    async touch() {}
  };
  return { reporter, calls };
}

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
  let lastDecisions: RefinementDecisionRecord[] = [];
  const artifacts: ArtifactEnvelope<GraphSnapshot>[] = [];
  const runStore: ExtractionRunStorePort = {
    persist: async () => {},
    runsForBuildByIds: async () => runs
  };
  const graphStore: GraphVersionStorePort = {
    existingConceptIdentities: async (): Promise<PublishedConceptIdentity[]> => existing,
    publish: async (input) => { published.set(input.snapshot.graphVersionId, input.snapshot); last = input.snapshot; lastDecisions = input.refinementDecisions; artifacts.push(input.artifact); },
    getPublishedSnapshot: async (graphVersionId) => published.get(graphVersionId),
    getLatestPublishedSnapshot: async () => last
  };
  return { runStore, graphStore, artifacts, getPublished: () => last, getDecisions: () => lastDecisions, published };
}

type BuildInput = Parameters<typeof buildGraphVersion>[0];

function withCanonicalization(
  input: Omit<BuildInput, "canonicalizationArtifactId" | "canonicalizationStore">,
  decisions: ConceptIdentityDecision[] = [],
  captured: PublishedConceptIdentity[] = []
): BuildInput {
  const artifact: ArtifactEnvelope<ConceptCanonicalizationArtifact> = {
    artifactId: "canon-1",
    artifactType: CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
    producer: "test",
    producerVersion: "1",
    configHash: "canonicalization-test-v1",
    createdAt: "2026-08-23T00:00:00.000Z",
    payload: {
      mode: decisions.length > 0 ? "semantic" : "exact_label_only",
      baseGraphVersionId: input.baseGraphVersionId,
      runIds: input.runIds,
      publishedConceptIdentities: captured,
      decisions,
      unavailable: []
    }
  };
  return {
    ...input,
    canonicalizationArtifactId: artifact.artifactId,
    canonicalizationStore: {
      persist: async () => {},
      getById: async (artifactId) => artifactId === artifact.artifactId ? artifact : undefined
    }
  };
}

// A merge/quarantine identity decision builder for the build-consumption tests.
function identityRef(declaredDomain: string, normalizedLabel: string, canonicalLabel: string, published: boolean, definitions: string[] = []): ConceptIdentityRef {
  return { declaredDomain, normalizedLabel, canonicalLabel, aliases: [], definitions, published };
}

function mergeDecision(declaredDomain: string, survivor: ConceptIdentityRef, absorbed: ConceptIdentityRef[]): ConceptIdentityDecision {
  return {
    outcome: "merge",
    declaredDomain,
    members: [survivor, ...absorbed],
    survivorNormalizedLabel: survivor.normalizedLabel,
    proposingSignal: "embedding_cosine",
    proposingScore: 0.9,
    rationale: "near-duplicate same-domain identity",
    decidingModel: "fake-judge"
  };
}

test("buildGraphVersion refuses to publish when a selected run carries a quarantine decision", async () => {
  const runs = [runForBuild({ quarantinedCandidates: [{ candidateKey: "mercury", canonicalLabel: "Mercury" }] })];
  const { runStore, graphStore, getPublished } = fakes(runs);

  await assert.rejects(
    () => buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore })),
    /unresolved quarantine decisions: run-1:Mercury/
  );
  assert.equal(getPublished(), undefined, "nothing should be published when a run is quarantined");
});

test("buildGraphVersion publishes Concepts with CEPs and zero asserted edges (R5)", async () => {
  const { runStore, graphStore, getPublished } = fakes([runForBuild()]);

  const snapshot = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }));

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
    () => buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore })),
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

  const snapshot = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-homographs", baseGraphVersionId: null, runIds: ["run-rust", "run-econ"], runStore, graphStore }));

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
  const versionA = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-a", baseGraphVersionId: null, runIds: ["run-a"], runStore: a.runStore, graphStore: a.graphStore }));
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

  const versionB = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-b", baseGraphVersionId: "gv-a", runIds: ["run-b"], runStore: b.runStore, graphStore: graphStoreB }, [], existing));

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

  const snapshot = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }));
  const cep = snapshot.evidenceProfiles[0];
  assert.equal(cep.definitions.length, 1, "exact-duplicate definition collapsed");
  assert.equal(cep.mentions.length, 2, "distinct mentions retained");
});

test("buildGraphVersion fails when the named base version is not published", async () => {
  const { runStore, graphStore } = fakes([runForBuild()]);
  await assert.rejects(
    () => buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: "missing", runIds: ["run-1"], runStore, graphStore })),
    /Base graph version missing is not published/
  );
});

test("a thrown build gate closes the open stage ok:false and reports completeOperation failed", async () => {
  // A quarantine gate throws inside the `load` stage. The build must reach a terminal
  // `failed` status (consistent with extraction/enrichment), not strand a `running` row.
  const runs = [runForBuild({ quarantinedCandidates: [{ candidateKey: "mercury", canonicalLabel: "Mercury" }] })];
  const { runStore, graphStore } = fakes(runs);
  const { reporter, calls } = recordingReporter();

  await assert.rejects(
    () => buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore, reporter })),
    /unresolved quarantine decisions/
  );

  assert.deepEqual(calls[0], { method: "beginOperation", operationType: "minting", operationId: "gv-1" });
  assert.ok(calls.some((c) => c.method === "completeStage" && (c as { stage: string; ok: boolean }).stage === NON_LLM_STAGES.load && (c as { ok: boolean }).ok === false));
  assert.deepEqual(calls.at(-1), { method: "completeOperation", status: "failed" });
  assert.ok(!calls.some((c) => c.method === "completeOperation" && (c as { status: string }).status === "succeeded"));
});

test("a clean build reports the three non-LLM stages and completeOperation succeeded", async () => {
  const { runStore, graphStore } = fakes([runForBuild()]);
  const { reporter, calls } = recordingReporter();

  await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore, reporter }));

  const stages = calls.filter((c) => c.method === "completeStage") as { stage: string; ok: boolean }[];
  assert.deepEqual(stages.map((c) => c.stage), [
    NON_LLM_STAGES.load,
    NON_LLM_STAGES.refine,
    NON_LLM_STAGES.persist
  ]);
  assert.ok(stages.every((c) => c.ok));
  assert.deepEqual(calls.at(-1), { method: "completeOperation", status: "succeeded" });
});

test("the minting operation establishes its ambient operation tag", async () => {
  const { runStore, graphStore } = fakes([runForBuild()]);
  const checkingRunStore: ExtractionRunStorePort = {
    ...runStore,
    async runsForBuildByIds(runIds) {
      assert.equal(currentOperationTag(), "gv-context");
      return runStore.runsForBuildByIds(runIds);
    }
  };
  await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-context",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    runStore: checkingRunStore,
    graphStore
  }));
});

test("the published snapshot is written with its immutable artifact envelope", async () => {
  const { runStore, graphStore, artifacts } = fakes([runForBuild()]);
  await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }));
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifactType, "graph_snapshot");
  assert.equal(artifacts[0].graphVersionId, "gv-1");
});

// --- U2: identity-decision consumption ---------------------------------------------

test("AE1: a merge decision folds a new candidate into a published Concept, keeping its IRI", async () => {
  // Version A publishes Ownership.
  const runA = runForBuild({
    runId: "run-a", sourceResourceId: "src-a",
    coreCandidates: [{ candidateKey: "ownership", canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: [] }],
    evidenceProfiles: [profile("ownership", { definitions: [{ sourceBlockId: "a-def", evidenceQuote: "Ownership governs memory.", headingPath: ["A"], locator: { page: 1 } }] })]
  });
  const a = fakes([runA]);
  const versionA = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-a", baseGraphVersionId: null, runIds: ["run-a"], runStore: a.runStore, graphStore: a.graphStore }));
  const baseConceptId = versionA.concepts[0].conceptId;
  const baseIri = versionA.concepts[0].iri;

  // Version B selects a new source teaching "Owner"; resolution merged it into Ownership.
  const runB = runForBuild({
    runId: "run-b", sourceResourceId: "src-b",
    coreCandidates: [{ candidateKey: "owner", canonicalLabel: "Owner", normalizedLabel: "owner", aliases: [] }],
    evidenceProfiles: [profile("owner", { definitions: [{ sourceBlockId: "b-def", evidenceQuote: "An owner holds a resource.", headingPath: ["B"], locator: { page: 2 } }] })]
  });
  const existing: PublishedConceptIdentity[] = versionA.concepts.map((c) => ({ conceptId: c.conceptId, iri: c.iri, normalizedLabel: c.normalizedLabel, declaredDomain: c.declaredDomain }));
  const b = fakes([runB], existing);
  b.published.set("gv-a", versionA);
  const graphStoreB: GraphVersionStorePort = { ...b.graphStore, getPublishedSnapshot: async (id) => (id === "gv-a" ? versionA : b.published.get(id)) };
  const decision = mergeDecision("rust programming",
    identityRef("rust programming", "ownership", "Ownership", true),
    [identityRef("rust programming", "owner", "Owner", false)]);

  const versionB = await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-b", baseGraphVersionId: "gv-a", runIds: ["run-b"],
    runStore: b.runStore, graphStore: graphStoreB
  }, [decision], existing));

  assert.equal(versionB.concepts.length, 1, "the new candidate folded into the published Concept");
  assert.equal(versionB.concepts[0].conceptId, baseConceptId, "stable identity reused (case A)");
  assert.equal(versionB.concepts[0].iri, baseIri, "the minted IRI is kept, never retired (ADR-0010)");
  assert.ok(versionB.concepts[0].aliases.includes("Owner"), "the absorbed surface label becomes an alias (R6)");
  const defQuotes = versionB.evidenceProfiles[0].definitions.map((d) => d.evidenceQuote).sort();
  assert.deepEqual(defQuotes, ["An owner holds a resource.", "Ownership governs memory."], "absorbed CEP evidence unions onto the survivor");
});

test("AE2: a merge decision over two new candidates mints one Concept carrying both labels", async () => {
  const run = runForBuild({
    declaredDomain: "economics",
    coreCandidates: [
      { candidateKey: "barter", canonicalLabel: "Barter", normalizedLabel: "barter", aliases: [] },
      { candidateKey: "bartering", canonicalLabel: "Bartering", normalizedLabel: "bartering", aliases: [] }
    ],
    evidenceProfiles: [profile("barter"), profile("bartering")]
  });
  const { runStore, graphStore } = fakes([run]);
  const decision = mergeDecision("economics",
    identityRef("economics", "barter", "Barter", false),
    [identityRef("economics", "bartering", "Bartering", false)]);

  const snapshot = await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"],
    runStore, graphStore
  }, [decision]));

  assert.equal(snapshot.concepts.length, 1, "two candidates collapse to one minted Concept");
  assert.equal(snapshot.concepts[0].canonicalLabel, "Barter", "survivor presentation wins");
  assert.ok(snapshot.concepts[0].aliases.includes("Bartering"), "absorbed label is an alias");
  assert.equal(snapshot.evidenceProfiles[0].definitions.length, 2, "both candidates' definitions union under the survivor");
});

test("AE3: a case-B quarantine decision refuses the build and publishes nothing", async () => {
  const quarantine: ConceptIdentityDecision = {
    outcome: "quarantine",
    declaredDomain: "economics",
    members: [
      identityRef("economics", "tradeone", "Trade One", true),
      identityRef("economics", "tradetwo", "Trade Two", true)
    ],
    survivorNormalizedLabel: null,
    proposingSignal: "embedding_cosine", proposingScore: 0.95, rationale: "collision",
    decidingModel: "fake-judge"
  };
  const captured = quarantine.members.map((member, index) => ({
    conceptId: `00000000-0000-5000-8000-00000000000${index}`,
    iri: `https://lrnki.local/concept/trade-${index}`,
    normalizedLabel: member.normalizedLabel,
    declaredDomain: member.declaredDomain
  }));
  const quarantinedFakes = fakes([runForBuild()], captured);

  await assert.rejects(
    () => buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore: quarantinedFakes.runStore, graphStore: quarantinedFakes.graphStore }, [quarantine], captured)),
    /two-already-published collision.*Trade One ⇄ Trade Two/s
  );
  assert.equal(quarantinedFakes.getPublished(), undefined, "nothing is published; no IRI minted or retired");
});

test("an artifact with no semantic decisions builds exactly as exact-label-only", async () => {
  const withEmpty = fakes([runForBuild()]);
  const baseline = fakes([runForBuild()]);
  const a = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore: withEmpty.runStore, graphStore: withEmpty.graphStore }));
  const b = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore: baseline.runStore, graphStore: baseline.graphStore }));
  assert.deepEqual(a.concepts.map((c) => c.canonicalLabel), b.concepts.map((c) => c.canonicalLabel));
  assert.equal(a.concepts.length, 1);
});

test("the build consumes a merge decision with no ports supplied (no model call, R8)", async () => {
  // The build takes no embedding/adjudicator ports at all, yet applies the merge — proof
  // the model calls live entirely on resolution's side of the seam.
  const run = runForBuild({
    declaredDomain: "economics",
    coreCandidates: [
      { candidateKey: "barter", canonicalLabel: "Barter", normalizedLabel: "barter", aliases: [] },
      { candidateKey: "bartering", canonicalLabel: "Bartering", normalizedLabel: "bartering", aliases: [] }
    ],
    evidenceProfiles: [profile("barter"), profile("bartering")]
  });
  const { runStore, graphStore } = fakes([run]);
  const decision = mergeDecision("economics", identityRef("economics", "barter", "Barter", false), [identityRef("economics", "bartering", "Bartering", false)]);
  const snapshot = await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }, [decision]));
  assert.equal(snapshot.concepts.length, 1);
});

test("applied identity decisions are written to refinement_decisions (KTD3)", async () => {
  const run = runForBuild({
    declaredDomain: "economics",
    coreCandidates: [
      { candidateKey: "barter", canonicalLabel: "Barter", normalizedLabel: "barter", aliases: [] },
      { candidateKey: "bartering", canonicalLabel: "Bartering", normalizedLabel: "bartering", aliases: [] }
    ],
    evidenceProfiles: [profile("barter"), profile("bartering")]
  });
  const { runStore, graphStore, getDecisions } = fakes([run]);
  const decision = mergeDecision("economics", identityRef("economics", "barter", "Barter", false), [identityRef("economics", "bartering", "Bartering", false)]);
  await buildGraphVersion(withCanonicalization({ graphVersionId: "gv-1", baseGraphVersionId: null, runIds: ["run-1"], runStore, graphStore }, [decision]));
  const identityRows = getDecisions().filter((d) => d.decisionType === CONCEPT_IDENTITY_DECISION_TYPE);
  assert.equal(identityRows.length, 1, "the merge decision is persisted");
  assert.equal(identityRows[0].outcome, "merge");
  assert.deepEqual(identityRows[0].provenance, {
    proposingSignal: "embedding_cosine",
    proposingScore: 0.9,
    decidingModel: "fake-judge",
    artifactId: "canon-1",
    configHash: "canonicalization-test-v1"
  });
  const selection = getDecisions().find(
    (row) => row.decisionType === CONCEPT_CANONICALIZATION_SELECTION_DECISION_TYPE
  );
  assert.deepEqual(selection?.subject, { artifactId: "canon-1" });
  assert.equal(
    (selection?.provenance as { configHash?: string } | undefined)?.configHash,
    "canonicalization-test-v1"
  );
});

test("unknown, wrong-type, malformed, base-mismatched, and run-mismatched artifacts fail closed", async () => {
  const env = fakes([runForBuild()]);
  const base = withCanonicalization({
    graphVersionId: "gv-1",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    runStore: env.runStore,
    graphStore: env.graphStore
  });

  await assert.rejects(
    () => buildGraphVersion({
      ...base,
      canonicalizationArtifactId: "missing",
      canonicalizationStore: { persist: async () => {}, getById: async () => undefined }
    }),
    /Unknown Concept Canonicalization artifact/
  );

  const valid = await base.canonicalizationStore.getById("canon-1");
  assert.ok(valid);
  const returning = (artifact: unknown) => ({
    persist: async () => {},
    getById: async () => artifact as ArtifactEnvelope<ConceptCanonicalizationArtifact>
  });
  await assert.rejects(
    () => buildGraphVersion({
      ...base,
      canonicalizationStore: returning({ ...valid, artifactType: "graph_snapshot" })
    }),
    /Wrong artifact type/
  );
  await assert.rejects(
    () => buildGraphVersion({
      ...base,
      canonicalizationStore: returning({ ...valid, payload: { ...valid.payload, decisions: "not-an-array" } })
    }),
    /decisions must be an array/
  );
  await assert.rejects(
    () => buildGraphVersion({
      ...base,
      canonicalizationStore: returning({
        ...valid,
        payload: { ...valid.payload, baseGraphVersionId: "gv-other" }
      })
    }),
    /created for base gv-other, not <none>/
  );
  await assert.rejects(
    () => buildGraphVersion({
      ...base,
      canonicalizationStore: returning({
        ...valid,
        payload: { ...valid.payload, runIds: ["run-other"] }
      })
    }),
    /different ordered Extraction Run selection/
  );
});

test("replaying one artifact preserves Concept identity, IRI, CEP, and refinement content", async () => {
  const selectedRun = runForBuild({
    coreCandidates: [
      { candidateKey: "barter", canonicalLabel: "Barter", normalizedLabel: "barter", aliases: [] },
      { candidateKey: "bartering", canonicalLabel: "Bartering", normalizedLabel: "bartering", aliases: [] }
    ],
    evidenceProfiles: [profile("barter"), profile("bartering")]
  });
  const decision = mergeDecision(
    "rust programming",
    identityRef("rust programming", "barter", "Barter", false),
    [identityRef("rust programming", "bartering", "Bartering", false)]
  );
  const first = fakes([selectedRun]);
  const snapshotA = await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-replay-a",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    runStore: first.runStore,
    graphStore: first.graphStore
  }, [decision]));

  const replayIdentities: PublishedConceptIdentity[] = snapshotA.concepts.map((concept) => ({
    conceptId: concept.conceptId,
    iri: concept.iri,
    normalizedLabel: concept.normalizedLabel,
    declaredDomain: concept.declaredDomain
  }));
  const replay = fakes([selectedRun], replayIdentities);
  const snapshotB = await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-replay-b",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    runStore: replay.runStore,
    graphStore: replay.graphStore
  }, [decision]));

  assert.deepEqual(snapshotB.concepts, snapshotA.concepts);
  assert.deepEqual(snapshotB.evidenceProfiles, snapshotA.evidenceProfiles);
  assert.deepEqual(replay.getDecisions(), first.getDecisions());
  assert.match(snapshotA.concepts[0].conceptId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("missing, changed, unrelated, conflicting, and partial registry state is rejected", async () => {
  const captured: PublishedConceptIdentity = {
    conceptId: "00000000-0000-5000-8000-000000000001",
    iri: "https://lrnki.local/concept/published",
    normalizedLabel: "published",
    declaredDomain: "rust programming"
  };
  const selectedRun = runForBuild();

  const attempt = async (
    current: PublishedConceptIdentity[],
    capturedIdentities: PublishedConceptIdentity[],
    runValue: RunForBuild = selectedRun
  ) => {
    const env = fakes([runValue], current);
    return buildGraphVersion(withCanonicalization({
      graphVersionId: "gv-registry",
      baseGraphVersionId: null,
      runIds: [runValue.runId],
      runStore: env.runStore,
      graphStore: env.graphStore
    }, [], capturedIdentities));
  };

  await assert.rejects(() => attempt([], [captured]), /captured identity .* is missing/);
  await assert.rejects(
    () => attempt([{ ...captured, conceptId: "00000000-0000-5000-8000-000000000009" }], [captured]),
    /captured identity .* conflicts/
  );
  await assert.rejects(
    () => attempt([{
      conceptId: "00000000-0000-5000-8000-000000000099",
      iri: "https://lrnki.local/concept/unrelated",
      normalizedLabel: "unrelated",
      declaredDomain: "other"
    }], []),
    /unrelated or conflicting identity/
  );

  const twoConceptRun = runForBuild({
    coreCandidates: [
      { candidateKey: "one", canonicalLabel: "One", normalizedLabel: "one", aliases: [] },
      { candidateKey: "two", canonicalLabel: "Two", normalizedLabel: "two", aliases: [] }
    ],
    evidenceProfiles: [profile("one"), profile("two")]
  });
  const seed = fakes([twoConceptRun]);
  const output = await buildGraphVersion(withCanonicalization({
    graphVersionId: "gv-seed",
    baseGraphVersionId: null,
    runIds: ["run-1"],
    runStore: seed.runStore,
    graphStore: seed.graphStore
  }));
  const partial = output.concepts.slice(0, 1).map((concept) => ({
    conceptId: concept.conceptId,
    iri: concept.iri,
    normalizedLabel: concept.normalizedLabel,
    declaredDomain: concept.declaredDomain
  }));
  await assert.rejects(
    () => attempt(partial, [], twoConceptRun),
    /unrelated or partial replay identities/
  );
});
