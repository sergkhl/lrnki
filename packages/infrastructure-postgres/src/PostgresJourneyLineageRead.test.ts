import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresJourneyLineageRead } from "./PostgresJourneyLineageRead";

const databaseUrl = process.env.DATABASE_URL;
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

maybe("returns undefined for an unknown enrichment", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    assert.equal(await new PostgresJourneyLineageRead(sql).resolveJourney(randomUUID()), undefined);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
