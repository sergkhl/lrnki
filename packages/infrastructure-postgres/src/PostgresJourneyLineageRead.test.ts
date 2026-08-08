import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresJourneyLineageRead } from "./PostgresJourneyLineageRead";
import { seedLearner } from "./testSupport";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("resolves an enrichment through its graph version to every direct extraction run", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const sourceResourceId = randomUUID();
  const sourceDocumentId = randomUUID();
  const runIds = [randomUUID(), randomUUID()];
  const graphVersionId = randomUUID();
  const enrichmentId = randomUUID();
  try {
    await sql`
      INSERT INTO source_resources
        (source_resource_id, content_hash, content_type, object_key, declared_domain, title)
      VALUES (${sourceResourceId}, ${randomUUID()}, 'text/plain', ${randomUUID()}, 'test', 'test')`;
    await sql`
      INSERT INTO source_documents
        (source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash)
      VALUES (${sourceDocumentId}, ${sourceResourceId}, 'test', '1', 'test')`;
    for (const runId of runIds) {
      await sql`
        INSERT INTO extraction_runs
          (run_id, source_resource_id, source_document_id, pipeline_config_hash, status)
        VALUES (${runId}, ${sourceResourceId}, ${sourceDocumentId}, 'test', 'succeeded')`;
    }
    await sql`
      INSERT INTO graph_versions
        (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
      VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
    for (const runId of runIds) {
      await sql`
        INSERT INTO graph_version_run_memberships
          (graph_version_run_membership_id, graph_version_id, run_id, source_resource_id)
        VALUES (${randomUUID()}, ${graphVersionId}, ${runId}, ${sourceResourceId})`;
    }
    await sql`
      INSERT INTO graph_enrichments
        (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method)
      VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test')`;

    assert.deepEqual(await new PostgresJourneyLineageRead(sql).resolveJourney(enrichmentId), {
      enrichmentId,
      graphVersionId,
      extractionRunIds: [...runIds].sort()
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("resolves journey display labels for document and synthetic enrichments", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const learnerRef = `journey-display-${randomUUID()}`;
  const sourceResourceIds = [randomUUID(), randomUUID()];
  const sourceDocumentIds = [randomUUID(), randomUUID()];
  const runIds = [randomUUID(), randomUUID()];
  const graphVersionId = randomUUID();
  const documentEnrichmentId = randomUUID();
  const syntheticEnrichmentId = randomUUID();
  try {
    await seedLearner(sql, learnerRef);
    for (let index = 0; index < sourceResourceIds.length; index += 1) {
      await sql`
        INSERT INTO source_resources
          (source_resource_id, content_hash, content_type, object_key, declared_domain, title)
        VALUES (${sourceResourceIds[index]}, ${randomUUID()}, 'text/plain', ${randomUUID()}, 'test', ${index === 0 ? "Binary search notes" : "Rust ownership notes"})`;
      await sql`
        INSERT INTO source_documents
          (source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash)
        VALUES (${sourceDocumentIds[index]}, ${sourceResourceIds[index]}, 'test', '1', 'test')`;
      await sql`
        INSERT INTO extraction_runs
          (run_id, source_resource_id, source_document_id, pipeline_config_hash, status)
        VALUES (${runIds[index]}, ${sourceResourceIds[index]}, ${sourceDocumentIds[index]}, 'test', 'succeeded')`;
    }
    await sql`
      INSERT INTO graph_versions
        (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
      VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
    for (let index = 0; index < runIds.length; index += 1) {
      await sql`
        INSERT INTO graph_version_run_memberships
          (graph_version_run_membership_id, graph_version_id, run_id, source_resource_id)
        VALUES (${randomUUID()}, ${graphVersionId}, ${runIds[index]}, ${sourceResourceIds[index]})`;
    }
    await sql`
      INSERT INTO graph_enrichments
        (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method)
      VALUES
        (${documentEnrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test'),
        (${syntheticEnrichmentId}, NULL, 'test', 'succeeded', 'test', 'test')`;
    await sql`
      INSERT INTO learner_expeditions
        (learner_expedition_id, learner_state_ref, kind, title, declared_domain, status, enrichment_id)
      VALUES (${randomUUID()}, ${learnerRef}, 'topic', 'Generated calculus expedition', 'math', 'ready', ${syntheticEnrichmentId})`;

    const display = await new PostgresJourneyLineageRead(sql).resolveJourneyDisplay([
      documentEnrichmentId,
      syntheticEnrichmentId
    ]);
    assert.deepEqual(display.sort((a, b) => a.enrichmentId.localeCompare(b.enrichmentId)), [
      {
        enrichmentId: documentEnrichmentId,
        kind: "document",
        title: "Binary search notes, Rust ownership notes"
      },
      {
        enrichmentId: syntheticEnrichmentId,
        kind: "synthetic",
        title: "Generated calculus expedition"
      }
    ].sort((a, b) => a.enrichmentId.localeCompare(b.enrichmentId)));
  } finally {
    await sql`DELETE FROM learner_expeditions WHERE learner_state_ref = ${learnerRef}`;
    await sql`DELETE FROM "user" WHERE id = ${learnerRef}`;
    await sql.end({ timeout: 5 });
  }
});

maybe("returns undefined for an unknown enrichment", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    assert.equal(await new PostgresJourneyLineageRead(sql).resolveJourney(randomUUID()), undefined);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
