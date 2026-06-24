import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ArtifactEnvelope, DerivedGraphLayer, EnrichmentRunTrace, ExtractionRunResult, GraphSnapshot, StructuredDocument } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresEnrichmentRunStore } from "./PostgresEnrichmentStores";
import { PostgresExtractionRunStore, PostgresGraphVersionStore, PostgresSourceRegistrationStore } from "./PostgresStores";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

const document: StructuredDocument = {
  sourceResourceId: "pending",
  parserName: "test",
  parserVersion: "1",
  parserConfigHash: "test",
  blocks: [
    { blockId: "b1", blockType: "paragraph", text: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} },
    { blockId: "b2", blockType: "paragraph", text: "Borrowing lets you reference a value without taking ownership.", headingPath: ["Borrowing"], locator: {} }
  ]
};

function runResult(sourceResourceId: string, sourceDocumentId: string, runId: string): ExtractionRunResult {
  return {
    runId,
    sourceResourceId,
    sourceDocumentId,
    declaredDomain: "software engineering",
    pipelineConfigHash: "test-v1",
    maxMentionsPerConceptPerSource: 6,
    status: "succeeded",
    degraded: false,
    qualityIssues: [],
    candidates: [
      candidate("ownership", "Ownership", "core"),
      candidate("borrowing", "Borrowing", "optional")
    ],
    evidenceProfiles: [
      {
        candidateKey: "ownership",
        tier: "core",
        definitions: [{ blockId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." }],
        mentions: [{ blockId: "b2", evidenceQuote: "Borrowing lets you reference a value without taking ownership." }],
        assertions: [
          { type: "defines", literalValue: "the rules governing memory", evidence: [{ blockId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." }] }
        ],
        complete: true
      },
      {
        candidateKey: "borrowing",
        tier: "optional",
        definitions: [{ blockId: "b2", evidenceQuote: "Borrowing lets you reference a value without taking ownership." }],
        mentions: [],
        assertions: [],
        complete: true
      }
    ],
    latencyMs: 1
  };
}

function candidate(candidateKey: string, label: string, tier: "core" | "optional") {
  return {
    candidateKey,
    parentCandidateKey: candidateKey,
    discoveredLabel: label,
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    aliases: [label],
    mentions: [{ blockId: candidateKey === "ownership" ? "b1" : "b2", evidenceQuote: candidateKey === "ownership" ? "Ownership is a set of rules that govern memory." : "Borrowing lets you reference a value without taking ownership." }],
    admission: {
      modelTier: tier, tier, sourceRole: "declared_domain_concept" as const, proposedCanonicalLabel: label,
      standaloneLearningObjective: { modelPassed: true, passed: true, rationale: "r", submittedEvidence: [], evidence: [] },
      establishedDomainMeaning: { modelPassed: true, passed: true, rationale: "r", submittedEvidence: [], evidence: [] },
      definitionBearingTreatment: { modelPassed: true, passed: true, rationale: "r", submittedEvidence: [], evidence: [] },
      organizingPower: { modelPassed: true, passed: true, rationale: "r", submittedAspects: [], aspects: [] },
      coreSelected: tier === "core", selectionReasonCode: "source_level_core" as const, reasonCodes: [], boundaryReasonCodes: [], confidence: 0.9
    }
  };
}

function artifactFor(result: ExtractionRunResult): ArtifactEnvelope<ExtractionRunResult> {
  return {
    artifactId: `${result.runId}:run`,
    artifactType: "extraction_run.v6",
    schemaVersion: "6",
    runId: result.runId,
    producer: "test",
    producerVersion: "0",
    configHash: "test-v1",
    createdAt: new Date().toISOString(),
    payload: result
  };
}

async function seedSource(sql: ReturnType<typeof createDatabaseClient>) {
  const registration = new PostgresSourceRegistrationStore(sql);
  const contentHash = randomUUID();
  return registration.register({
    contentHash, contentType: "text/markdown", objectKey: `tmp/${contentHash}`,
    declaredDomain: "software engineering", title: "Test source", document
  });
}

maybe("persists a run with CEP passages, assertions, and its immutable artifact in one transaction", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    const result = runResult(sourceResourceId, sourceDocumentId, runId);
    await new PostgresExtractionRunStore(sql).persist(result, artifactFor(result));

    const [{ count: profileCount }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM run_concept_evidence_profiles WHERE run_id = ${runId}`;
    assert.equal(profileCount, 2);
    const [{ count: defCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM run_evidence_passages e
      JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = e.run_concept_evidence_profile_id
      WHERE p.run_id = ${runId} AND e.kind = 'definition'`;
    assert.equal(defCount, 2);
    const [{ count: assertionCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM run_optional_assertions a
      JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = a.run_concept_evidence_profile_id
      WHERE p.run_id = ${runId}`;
    assert.equal(assertionCount, 1);
    const [{ count: artifactCount }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM artifact_versions WHERE run_id = ${runId}`;
    assert.equal(artifactCount, 1);
    const [{ degraded }] = await sql<{ degraded: boolean }[]>`SELECT degraded FROM extraction_runs WHERE run_id = ${runId}`;
    assert.equal(degraded, false);
    const [{ count: projectedCandidates }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM artifact_run_candidates WHERE run_id = ${runId}`;
    assert.equal(projectedCandidates, 2);
  } finally {
    await sql.end();
  }
});

maybe("rolls back the entire run when a CEP references an unknown block", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    const result = runResult(sourceResourceId, sourceDocumentId, runId);
    result.evidenceProfiles[0].definitions.push({ blockId: "does-not-exist", evidenceQuote: "ghost" });

    await assert.rejects(() => new PostgresExtractionRunStore(sql).persist(result, artifactFor(result)));
    const [{ count: runCount }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM extraction_runs WHERE run_id = ${runId}`;
    assert.equal(runCount, 0, "no extraction_runs row survives a rolled-back persist");
    const [{ count: artifactCount }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM artifact_versions WHERE run_id = ${runId}`;
    assert.equal(artifactCount, 0, "no artifact envelope survives without its relational rows");
  } finally {
    await sql.end();
  }
});

maybe("runsForBuildByIds returns core CEP profiles with resolved heading paths and locators", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    const result = runResult(sourceResourceId, sourceDocumentId, runId);
    await new PostgresExtractionRunStore(sql).persist(result, artifactFor(result));

    const runs = await new PostgresExtractionRunStore(sql).runsForBuildByIds([runId]);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].coreCandidates.length, 1, "only the core Ownership candidate is publishable");
    const ownership = runs[0].evidenceProfiles.find((profile) => profile.candidateKey === "ownership")!;
    assert.ok(ownership.complete);
    assert.equal(ownership.definitions.length, 1);
    assert.deepEqual(ownership.definitions[0].headingPath, ["Ownership"], "heading path resolved from source_blocks");
    assert.equal(ownership.mentions.length, 1);
    assert.deepEqual(ownership.assertions, [
      {
        type: "defines",
        literalValue: "the rules governing memory",
        evidence: [{ sourceBlockId: ownership.definitions[0].sourceBlockId, evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }]
      }
    ]);
    assert.ok(!runs[0].evidenceProfiles.some((profile) => profile.candidateKey === "borrowing"), "optional Concept CEP is not in the build read model");
  } finally {
    await sql.end();
  }
});

maybe("publish writes a CEP snapshot with zero asserted edges and round-trips through getPublishedSnapshot", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    await new PostgresExtractionRunStore(sql).persist(runResult(sourceResourceId, sourceDocumentId, runId), artifactFor(runResult(sourceResourceId, sourceDocumentId, runId)));
    const blocks = await sql<{ block_id: string; source_block_id: string }[]>`SELECT block_id, source_block_id FROM source_blocks WHERE source_document_id = ${sourceDocumentId}`;
    const blk = (id: string) => blocks.find((row) => row.block_id === id)!.source_block_id;

    const conceptId = randomUUID();
    const graphVersionId = randomUUID();
    const ownershipLabel = `Ownership ${conceptId}`;
    const snapshot: GraphSnapshot = {
      graphVersionId,
      baseGraphVersionId: null,
      concepts: [{ conceptId, iri: `https://lrnki.local/concept/ownership-${conceptId}`, canonicalLabel: ownershipLabel, normalizedLabel: ownershipLabel.toLowerCase(), declaredDomain: "software engineering", aliases: ["ownership model"], trustTier: "curated_source_grounded", homograph: false, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" }],
      evidenceProfiles: [{
        conceptId,
        definitions: [{ sourceResourceId, sourceBlockId: blk("b1"), evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }],
        mentions: [{ sourceResourceId, sourceBlockId: blk("b2"), evidenceQuote: "Borrowing lets you reference a value without taking ownership.", headingPath: ["Borrowing"], locator: {} }],
        assertions: [{ type: "defines", literalValue: "the rules governing memory", evidence: [{ sourceResourceId, sourceBlockId: blk("b1"), evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }] }]
      }]
    };
    const artifact: ArtifactEnvelope<GraphSnapshot> = {
      artifactId: `${graphVersionId}:snapshot`, artifactType: "graph_snapshot.v2", schemaVersion: "2", graphVersionId,
      producer: "test", producerVersion: "0", configHash: "test", createdAt: new Date().toISOString(), payload: snapshot
    };
    const store = new PostgresGraphVersionStore(sql);
    await store.publish({ snapshot, refinementConfigHash: "test", runMemberships: [{ runId, sourceResourceId }], refinementDecisions: [], artifact });

    const hydrated = await store.getPublishedSnapshot(graphVersionId);
    assert.ok(hydrated);
    assert.equal(hydrated.baseGraphVersionId, null);
    assert.equal(hydrated.concepts.length, 1);
    assert.equal(hydrated.evidenceProfiles.length, 1);
    assert.equal(hydrated.evidenceProfiles[0].definitions.length, 1);
    assert.equal(hydrated.evidenceProfiles[0].mentions.length, 1);
    assert.equal(hydrated.evidenceProfiles[0].assertions.length, 1);
    assert.ok(!("claims" in hydrated), "no asserted-edge collection in a published snapshot");
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM artifact_versions WHERE graph_version_id = ${graphVersionId}`;
    assert.equal(count, 1, "snapshot artifact written atomically with the publication");
  } finally {
    await sql.end();
  }
});

maybe("enrichment round-trips anchor projection nodes and derived-node edges", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    await new PostgresExtractionRunStore(sql).persist(runResult(sourceResourceId, sourceDocumentId, runId), artifactFor(runResult(sourceResourceId, sourceDocumentId, runId)));
    const blocks = await sql<{ block_id: string; source_block_id: string }[]>`SELECT block_id, source_block_id FROM source_blocks WHERE source_document_id = ${sourceDocumentId}`;
    const blk = (id: string) => blocks.find((row) => row.block_id === id)!.source_block_id;

    const ownershipId = randomUUID();
    const borrowingId = randomUUID();
    const graphVersionId = randomUUID();
    const ownershipLabel = `Ownership ${ownershipId}`;
    const borrowingLabel = `Borrowing ${borrowingId}`;
    const snapshot: GraphSnapshot = {
      graphVersionId,
      baseGraphVersionId: null,
      concepts: [
        { conceptId: ownershipId, iri: `https://lrnki.local/concept/ownership-${ownershipId}`, canonicalLabel: ownershipLabel, normalizedLabel: ownershipLabel.toLowerCase(), declaredDomain: "software engineering", aliases: [], trustTier: "curated_source_grounded", homograph: false, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" },
        { conceptId: borrowingId, iri: `https://lrnki.local/concept/borrowing-${borrowingId}`, canonicalLabel: borrowingLabel, normalizedLabel: borrowingLabel.toLowerCase(), declaredDomain: "software engineering", aliases: [], trustTier: "curated_source_grounded", homograph: false, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" }
      ],
      evidenceProfiles: [
        { conceptId: ownershipId, definitions: [{ sourceResourceId, sourceBlockId: blk("b1"), evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }], mentions: [], assertions: [] },
        { conceptId: borrowingId, definitions: [{ sourceResourceId, sourceBlockId: blk("b2"), evidenceQuote: "Borrowing lets you reference a value without taking ownership.", headingPath: ["Borrowing"], locator: {} }], mentions: [], assertions: [] }
      ]
    };
    await new PostgresGraphVersionStore(sql).publish({
      snapshot,
      refinementConfigHash: "test",
      runMemberships: [{ runId, sourceResourceId }],
      refinementDecisions: [],
      artifact: {
        artifactId: `${graphVersionId}:snapshot`, artifactType: "graph_snapshot.v2", schemaVersion: "2", graphVersionId,
        producer: "test", producerVersion: "0", configHash: "test", createdAt: new Date().toISOString(), payload: snapshot
      }
    });

    const enrichmentId = randomUUID();
    const layer: DerivedGraphLayer = {
      enrichmentId,
      graphVersionId,
      enrichmentConfigHash: "test-enrichment",
      judgeModel: "mock-judge",
      derivedNodes: snapshot.concepts.map((concept) => ({
        nodeKind: "anchor",
        derivedNodeId: concept.conceptId,
        conceptId: concept.conceptId,
        groundingOrigin: "document_anchored",
        role: "anchor",
        layer: "asserted",
        canonicalLabel: concept.canonicalLabel,
        normalizedLabel: concept.normalizedLabel,
        declaredDomain: concept.declaredDomain,
        aliases: concept.aliases
      })),
      prerequisiteEdges: [{
        prerequisiteDerivedNodeId: borrowingId,
        dependentDerivedNodeId: ownershipId,
        predicate: "inferred-prerequisite-of",
        confidence: 0.9,
        uncertain: false,
        provenance: { judgmentRationale: "test" }
      }],
      difficulties: [
        { derivedNodeId: borrowingId, score: 0, method: "dag-depth-mock", components: { topoDepth: 0 }, neuralRationale: "borrowing is a foundational mechanic" },
        { derivedNodeId: ownershipId, score: 1, method: "dag-depth-mock", components: { topoDepth: 1 }, neuralRationale: "ownership composes several prior ideas" }
      ]
    };
    const trace: EnrichmentRunTrace = {
      enrichmentId,
      graphVersionId,
      enrichmentConfigHash: "test-enrichment",
      derivedNodes: layer.derivedNodes,
      orderings: [],
      nodeExclusions: [],
      dispositions: [],
      groundingDispositions: [],
      rescueDispositions: [],
      mintingDispositions: [],
      nodeMerges: []
    };
    const store = new PostgresEnrichmentRunStore(sql);
    await store.persist({
      layer,
      artifact: {
        artifactId: `${enrichmentId}:enrichment-run`, artifactType: "enrichment_run.v3", schemaVersion: "3", graphVersionId,
        producer: "test", producerVersion: "0", configHash: "test-enrichment", createdAt: new Date().toISOString(), payload: trace
      }
    });

    const hydrated = await store.getLayer(enrichmentId);
    assert.ok(hydrated);
    assert.equal(hydrated.derivedNodes.length, 2);
    assert.ok(hydrated.derivedNodes.every((node) => node.nodeKind === "anchor" && node.groundingOrigin === "document_anchored"));
    assert.equal(hydrated.prerequisiteEdges[0].prerequisiteDerivedNodeId, borrowingId);
    assert.equal(hydrated.prerequisiteEdges[0].dependentDerivedNodeId, ownershipId);
    assert.equal(hydrated.difficulties.length, 2);
    // U3: the neural rationale round-trips verbatim on every difficulty row (R5).
    const rationaleByNode = new Map(hydrated.difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty.neuralRationale] as const));
    assert.equal(rationaleByNode.get(borrowingId), "borrowing is a foundational mechanic");
    assert.equal(rationaleByNode.get(ownershipId), "ownership composes several prior ideas");
  } finally {
    await sql.end();
  }
});

maybe("round-trips enrichment nodes (llm_grounded + source_mentioned) with their grounding", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    await new PostgresExtractionRunStore(sql).persist(runResult(sourceResourceId, sourceDocumentId, runId), artifactFor(runResult(sourceResourceId, sourceDocumentId, runId)));
    const blocks = await sql<{ block_id: string; source_block_id: string }[]>`SELECT block_id, source_block_id FROM source_blocks WHERE source_document_id = ${sourceDocumentId}`;
    const blk = (id: string) => blocks.find((row) => row.block_id === id)!.source_block_id;

    const anchorId = randomUUID();
    const graphVersionId = randomUUID();
    const anchorLabel = `Ownership ${anchorId}`;
    const snapshot: GraphSnapshot = {
      graphVersionId,
      baseGraphVersionId: null,
      concepts: [{ conceptId: anchorId, iri: `https://lrnki.local/concept/ownership-${anchorId}`, canonicalLabel: anchorLabel, normalizedLabel: anchorLabel.toLowerCase(), declaredDomain: "software engineering", aliases: [], trustTier: "curated_source_grounded", homograph: false, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" }],
      evidenceProfiles: [{ conceptId: anchorId, definitions: [{ sourceResourceId, sourceBlockId: blk("b1"), evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }], mentions: [], assertions: [] }]
    };
    await new PostgresGraphVersionStore(sql).publish({
      snapshot, refinementConfigHash: "test", runMemberships: [{ runId, sourceResourceId }], refinementDecisions: [],
      artifact: { artifactId: `${graphVersionId}:snapshot`, artifactType: "graph_snapshot.v2", schemaVersion: "2", graphVersionId, producer: "test", producerVersion: "0", configHash: "test", createdAt: new Date().toISOString(), payload: snapshot }
    });

    const enrichmentId = randomUUID();
    const mintedId = randomUUID();
    const rescuedId = randomUUID();
    const layer: DerivedGraphLayer = {
      enrichmentId, graphVersionId, enrichmentConfigHash: "test-enrichment", judgeModel: "mock-judge",
      derivedNodes: [
        { nodeKind: "anchor", derivedNodeId: anchorId, conceptId: anchorId, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted", canonicalLabel: anchorLabel, normalizedLabel: anchorLabel.toLowerCase(), declaredDomain: "software engineering", aliases: [] },
        { nodeKind: "enrichment", derivedNodeId: mintedId, groundingOrigin: "llm_grounded", mintingReason: "assumed_prerequisite", role: "prerequisite", layer: "derived", canonicalLabel: "Stack allocation", normalizedLabel: "stack allocation", declaredDomain: "software engineering", aliases: [],
          groundingBundle: { derivedNodeId: mintedId, groundingOrigin: "llm_grounded", definitions: [{ passageType: "definition", text: "Stack allocation stores short-lived values.", groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }], mentions: [], scaffoldedAnchorConceptIds: [anchorId], generatingModel: "mock-gen", rationale: "scaffolds ownership" } },
        { nodeKind: "enrichment", derivedNodeId: rescuedId, groundingOrigin: "source_mentioned", role: "prerequisite", layer: "derived", canonicalLabel: "Borrowing", normalizedLabel: "borrowing", declaredDomain: "software engineering", aliases: [],
          groundingPassages: [{ passageType: "mention", text: "Borrowing lets you reference a value without taking ownership.", groundingOrigin: "source_mentioned", sourceResourceId, sourceBlockId: blk("b2"), evidenceQuote: "Borrowing lets you reference a value without taking ownership.", headingPath: ["Borrowing"], locator: {}, verbatimCheck: { disposition: "verified", sourceResourceId, sourceBlockId: blk("b2") } }] }
      ],
      prerequisiteEdges: [
        { prerequisiteDerivedNodeId: mintedId, dependentDerivedNodeId: anchorId, predicate: "inferred-prerequisite-of", confidence: 0.8, uncertain: false, provenance: { judgmentRationale: "minted scaffolds anchor" } },
        { prerequisiteDerivedNodeId: rescuedId, dependentDerivedNodeId: anchorId, predicate: "inferred-prerequisite-of", confidence: 0.7, uncertain: false, provenance: { judgmentRationale: "rescued precedes anchor" } }
      ],
      difficulties: [
        { derivedNodeId: mintedId, score: 0, method: "dag-depth-mock", components: { topoDepth: 0 }, neuralRationale: "minted prerequisite, generated grounding" },
        { derivedNodeId: rescuedId, score: 0, method: "dag-depth-mock", components: { topoDepth: 0 }, neuralRationale: "rescued source mention" },
        { derivedNodeId: anchorId, score: 1, method: "dag-depth-mock", components: { topoDepth: 1 }, neuralRationale: "anchor concept" }
      ]
    };
    // U4: whole-set ordering trace — ONE per-domain ordering records the asserted edges;
    // there is no per-pair judge-model split any more (every edge uses layer.judgeModel).
    const droppedId = randomUUID();
    const droppedMintingId = randomUUID();
    const absorbedMergeId = randomUUID();
    const trace: EnrichmentRunTrace = { enrichmentId, graphVersionId, enrichmentConfigHash: "test-enrichment", derivedNodes: layer.derivedNodes,
      orderings: [
        { declaredDomain: "software engineering", judgeModel: "mock-judge", nodeCount: 3, reprompted: false, cycleRoutedEdges: [], assertedEdges: [
          { prerequisiteDerivedNodeId: mintedId, dependentDerivedNodeId: anchorId, confidence: 0.8, rationale: "r" },
          { prerequisiteDerivedNodeId: rescuedId, dependentDerivedNodeId: anchorId, confidence: 0.7, rationale: "r" }
        ] }
      ], nodeExclusions: [], dispositions: [], groundingDispositions: [
      { derivedNodeId: mintedId, groundingOrigin: "llm_grounded", outcome: "not_applicable_by_grounding", rationale: "generated grounding" },
      { derivedNodeId: rescuedId, groundingOrigin: "source_mentioned", outcome: "verified", rationale: "mention verified verbatim" }
    ], rescueDispositions: [
      { derivedNodeId: rescuedId, canonicalLabel: "Borrowing", normalizedLabel: "borrowing", declaredDomain: "software engineering", disposition: "accepted", rationale: "durable prerequisite", groundingSpan: "" },
      { derivedNodeId: droppedId, canonicalLabel: "Table 3 Ablation", normalizedLabel: "table 3 ablation", declaredDomain: "software engineering", disposition: "dropped", rationale: "incidental artifact", groundingSpan: "Table 3" }
    ],
    mintingDispositions: [
      { derivedNodeId: mintedId, proposedLabel: "Stack allocation", normalizedLabel: "stack allocation", declaredDomain: "software engineering", anchorConceptId: anchorId, disposition: "accepted", rationale: "durable prerequisite" },
      { derivedNodeId: droppedMintingId, proposedLabel: "Incidental Label", normalizedLabel: "incidental label", declaredDomain: "software engineering", anchorConceptId: anchorId, disposition: "dropped", rationale: "tangential to the anchor" }
    ],
    // U4: one merge — the anchor (surviving canonical, FK-resolved) absorbed a removed
    // near-duplicate enrichment node (absorbed id correlation-only, no FK violation).
    nodeMerges: [
      { declaredDomain: "software engineering", canonicalDerivedNodeId: anchorId, canonicalLabel: anchorLabel, canonicalNodeKind: "anchor",
        absorbedDerivedNodeId: absorbedMergeId, absorbedLabel: "Ownership (Rust)", absorbedAliases: ["owning"], absorbedNodeKind: "enrichment",
        absorbedEvidence: ["the owner frees memory"], proposingSignal: "embedding_cosine", proposingScore: 0.97, rationale: "two surface forms of one concept", canonicalSelectionReason: "anchor_over_enrichment" }
    ] };
    const store = new PostgresEnrichmentRunStore(sql);
    await store.persist({ layer, artifact: { artifactId: `${enrichmentId}:enrichment-run`, artifactType: "enrichment_run.v3", schemaVersion: "3", graphVersionId, producer: "test", producerVersion: "0", configHash: "test-enrichment", createdAt: new Date().toISOString(), payload: trace } });

    const hydrated = await store.getLayer(enrichmentId);
    assert.ok(hydrated);
    assert.equal(hydrated.derivedNodes.length, 3);
    const minted = hydrated.derivedNodes.find((node) => node.derivedNodeId === mintedId);
    assert.ok(minted && minted.nodeKind === "enrichment" && minted.groundingOrigin === "llm_grounded");
    assert.equal(minted.groundingBundle.definitions[0].verbatimCheck.disposition, "not_applicable_by_grounding");
    const rescued = hydrated.derivedNodes.find((node) => node.derivedNodeId === rescuedId);
    assert.ok(rescued && rescued.nodeKind === "enrichment" && rescued.groundingOrigin === "source_mentioned");
    assert.equal(rescued.groundingPassages[0].evidenceQuote, "Borrowing lets you reference a value without taking ownership.");
    assert.equal(hydrated.prerequisiteEdges.length, 2);
    assert.equal(hydrated.difficulties.length, 3);

    // U4: per-pair judge model persisted on the edges and matches the routing.
    const edgeModels = await sql<{ prerequisite_derived_node_id: string; judge_model: string }[]>`
      SELECT prerequisite_derived_node_id, judge_model FROM inferred_prerequisite_edges WHERE enrichment_id = ${enrichmentId}`;
    assert.equal(edgeModels.find((e) => e.prerequisite_derived_node_id === mintedId)?.judge_model, "kg-generated-prerequisite-judgment");
    assert.equal(edgeModels.find((e) => e.prerequisite_derived_node_id === rescuedId)?.judge_model, "mock-judge");

    // U4: rescue dispositions persisted and read back, including the dropped candidate
    // that has no derived_graph_nodes row.
    const dispositions = await sql<{ derived_node_id: string; disposition: string; rationale: string }[]>`
      SELECT derived_node_id, disposition, rationale FROM rescue_dispositions WHERE enrichment_id = ${enrichmentId} ORDER BY disposition`;
    assert.equal(dispositions.length, 2);
    assert.equal(dispositions.find((d) => d.derived_node_id === rescuedId)?.disposition, "accepted");
    const dropped = dispositions.find((d) => d.derived_node_id === droppedId);
    assert.equal(dropped?.disposition, "dropped");
    assert.equal(dropped?.rationale, "incidental artifact");

    // Minting dispositions persisted and read back, including the dropped proposal that
    // has no derived_graph_nodes row because grounding was never generated.
    const mintingDispositions = await sql<{ derived_node_id: string; proposed_label: string; anchor_concept_id: string; disposition: string; rationale: string }[]>`
      SELECT derived_node_id, proposed_label, anchor_concept_id, disposition, rationale
      FROM minting_dispositions WHERE enrichment_id = ${enrichmentId} ORDER BY proposed_label`;
    assert.equal(mintingDispositions.length, 2);
    assert.equal(mintingDispositions.find((d) => d.derived_node_id === mintedId)?.disposition, "accepted");
    const droppedMinting = mintingDispositions.find((d) => d.derived_node_id === droppedMintingId);
    assert.equal(droppedMinting?.disposition, "dropped");
    assert.equal(droppedMinting?.proposed_label, "Incidental Label");
    assert.equal(droppedMinting?.anchor_concept_id, anchorId);
    assert.equal(droppedMinting?.rationale, "tangential to the anchor");

    // U4: the merge record persisted — canonical FK resolves to a surviving node, the
    // absorbed (removed) id persists without an FK violation, and the snapshot columns
    // (label/aliases/evidence/signal/score/reason) round-trip.
    const merges = await sql<{
      canonical_derived_node_id: string; absorbed_derived_node_id: string; absorbed_label: string;
      absorbed_aliases: string[]; absorbed_evidence: string[]; proposing_signal: string; proposing_score: number;
      canonical_selection_reason: string; canonical_node_kind: string; absorbed_node_kind: string;
    }[]>`SELECT canonical_derived_node_id, absorbed_derived_node_id, absorbed_label, absorbed_aliases, absorbed_evidence,
            proposing_signal, proposing_score, canonical_selection_reason, canonical_node_kind, absorbed_node_kind
         FROM derived_node_merges WHERE enrichment_id = ${enrichmentId}`;
    assert.equal(merges.length, 1);
    assert.equal(merges[0].canonical_derived_node_id, anchorId);
    assert.equal(merges[0].absorbed_derived_node_id, absorbedMergeId);
    assert.equal(merges[0].absorbed_label, "Ownership (Rust)");
    assert.deepEqual(merges[0].absorbed_aliases, ["owning"]);
    assert.deepEqual(merges[0].absorbed_evidence, ["the owner frees memory"]);
    assert.equal(merges[0].proposing_signal, "embedding_cosine");
    assert.ok(Math.abs(Number(merges[0].proposing_score) - 0.97) < 1e-5);
    assert.equal(merges[0].canonical_selection_reason, "anchor_over_enrichment");
    assert.equal(merges[0].canonical_node_kind, "anchor");
    assert.equal(merges[0].absorbed_node_kind, "enrichment");
  } finally {
    await sql.end();
  }
});

maybe("mentionedNonCoreCandidates returns member-run mentions with no definition, scoped by version", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { sourceResourceId, sourceDocumentId } = await seedSource(sql);
    const runId = randomUUID();
    // A run with a core anchor (Ownership, has a definition) and a non-core mention
    // (Borrowing, optional, NO definition passage) — the rescue candidate.
    const result: ExtractionRunResult = {
      runId, sourceResourceId, sourceDocumentId, declaredDomain: "software engineering",
      pipelineConfigHash: "test-v1", maxMentionsPerConceptPerSource: 6, status: "succeeded", degraded: false, qualityIssues: [],
      candidates: [
        candidate("ownership", "Ownership", "core"),
        candidate("borrowing", "Borrowing", "optional")
      ],
      evidenceProfiles: [
        { candidateKey: "ownership", tier: "core", definitions: [{ blockId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." }], mentions: [], assertions: [], complete: true }
        // No CEP for borrowing -> no definition passage -> eligible for rescue.
      ],
      latencyMs: 1
    };
    await new PostgresExtractionRunStore(sql).persist(result, artifactFor(result));
    const blocks = await sql<{ block_id: string; source_block_id: string }[]>`SELECT block_id, source_block_id FROM source_blocks WHERE source_document_id = ${sourceDocumentId}`;
    const blk = (id: string) => blocks.find((row) => row.block_id === id)!.source_block_id;

    const anchorId = randomUUID();
    const graphVersionId = randomUUID();
    const anchorLabel = `Ownership ${anchorId}`;
    const snapshot: GraphSnapshot = {
      graphVersionId, baseGraphVersionId: null,
      concepts: [{ conceptId: anchorId, iri: `https://lrnki.local/concept/ownership-${anchorId}`, canonicalLabel: anchorLabel, normalizedLabel: anchorLabel.toLowerCase(), declaredDomain: "software engineering", aliases: [], trustTier: "curated_source_grounded", homograph: false, groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" }],
      evidenceProfiles: [{ conceptId: anchorId, definitions: [{ sourceResourceId, sourceBlockId: blk("b1"), evidenceQuote: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} }], mentions: [], assertions: [] }]
    };
    await new PostgresGraphVersionStore(sql).publish({
      snapshot, refinementConfigHash: "test", runMemberships: [{ runId, sourceResourceId }], refinementDecisions: [],
      artifact: { artifactId: `${graphVersionId}:snapshot`, artifactType: "graph_snapshot.v2", schemaVersion: "2", graphVersionId, producer: "test", producerVersion: "0", configHash: "test", createdAt: new Date().toISOString(), payload: snapshot }
    });

    const rescue = await new PostgresEnrichmentRunStore(sql).mentionedNonCoreCandidates(graphVersionId);
    const borrowing = rescue.find((candidate) => candidate.candidateKey === "borrowing");
    assert.ok(borrowing, "the non-core mentioned candidate is a rescue candidate");
    assert.equal(borrowing.tier, "optional");
    assert.equal(borrowing.declaredDomain, "software engineering");
    assert.ok(borrowing.mentions.length >= 1);
    assert.equal(borrowing.mentions[0].evidenceQuote, "Borrowing lets you reference a value without taking ownership.");
    assert.ok(borrowing.mentions[0].blockText.includes("Borrowing lets you reference"), "carries the cited block text for the U6 floor");
    // The core anchor (which HAS a definition) is never a rescue candidate.
    assert.ok(!rescue.some((candidate) => candidate.candidateKey === "ownership"));
  } finally {
    await sql.end();
  }
});

maybe("a clean database has no claim, relation-registry, or published-claim tables (U4.8)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('run_claims', 'run_claim_evidence', 'published_claims', 'published_claim_evidence', 'relation_definitions')`;
    assert.equal(rows.length, 0, `unexpected legacy tables present: ${rows.map((r) => r.table_name).join(", ")}`);
    const cep = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'graph_version_concept_evidence_profiles'`;
    assert.equal(cep.length, 1, "the published CEP table exists");
  } finally {
    await sql.end();
  }
});
