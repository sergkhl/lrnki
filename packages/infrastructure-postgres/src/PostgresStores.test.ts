import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ArtifactEnvelope, ExtractionRunResult, StructuredDocument } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresExtractionRunStore, PostgresSourceRegistrationStore } from "./PostgresStores";

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
          { type: "defines", literalValue: "the rules governing memory", evidence: [{ blockId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." }] },
          { type: "explicit-prerequisite-hint", objectCandidateKey: "borrowing", evidence: [{ blockId: "b2", evidenceQuote: "Borrowing lets you reference a value without taking ownership." }] }
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
      organizingPower: { modelPassed: true, passed: true, rationale: "r", submittedAspects: [], aspects: [] },
      coreSelected: tier === "core", selectionReasonCode: "source_level_core" as const, reasonCodes: [], boundaryReasonCodes: [], confidence: 0.9
    }
  };
}

function artifactFor(result: ExtractionRunResult): ArtifactEnvelope<ExtractionRunResult> {
  return {
    artifactId: `${result.runId}:run`,
    artifactType: "extraction_run.v5",
    schemaVersion: "5",
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
    assert.equal(assertionCount, 2);
    const [{ count: artifactCount }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM artifact_versions WHERE run_id = ${runId}`;
    assert.equal(artifactCount, 1);
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
