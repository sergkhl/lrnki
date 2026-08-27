import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  PublishSourceExpeditionCatalogEntry,
  SourceExpeditionAssetExpectation
} from "@lrnki/ports";
import { createDatabaseClient } from "./db";
import { PostgresSourceExpeditionCatalog } from "./PostgresSourceExpeditionCatalog";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;
type Sql = ReturnType<typeof createDatabaseClient>;

const sourceProvenance = {
  authorship: "lrnki_model_authored_project_source",
  knowledgeBasis: "general_model_knowledge_only",
  externalClaimVerificationRequired: false,
  acceptanceScope: "local_shared_learner_playtest"
} as const;

type SeededAssets = {
  sourceResourceId: string;
  sourceDocumentId: string;
  extractionRunId: string;
  graphVersionId: string;
  enrichmentId: string;
  conceptId: string;
  derivedNodeId: string;
  expectedAssets: SourceExpeditionAssetExpectation;
};

async function seedAcceptedAssets(
  sql: Sql,
  title: string,
  includeMembership = true
): Promise<SeededAssets> {
  const sourceResourceId = randomUUID();
  const sourceDocumentId = randomUUID();
  const extractionRunId = randomUUID();
  const graphVersionId = randomUUID();
  const enrichmentId = randomUUID();
  const conceptId = randomUUID();
  const derivedNodeId = randomUUID();
  const conceptLessonId = randomUUID();
  const studyItemId = randomUUID();
  await sql`
    INSERT INTO source_resources (
      source_resource_id, content_hash, content_type, object_key, declared_domain,
      title, source_uri, license
    ) VALUES (
      ${sourceResourceId}, ${randomUUID()}, 'text/markdown', ${`${title}.md`}, 'test-domain',
      ${title}, 'lrnki model-authored project source', 'lrnki project-owned playtest fixture'
    )`;
  await sql`
    INSERT INTO source_documents (
      source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash
    ) VALUES (${sourceDocumentId}, ${sourceResourceId}, 'test', '1', 'test')`;
  await sql`
    INSERT INTO extraction_runs (
      run_id, source_resource_id, source_document_id, pipeline_config_hash, status, completed_at
    ) VALUES (${extractionRunId}, ${sourceResourceId}, ${sourceDocumentId}, 'test', 'succeeded', now())`;
  await sql`
    INSERT INTO graph_versions (
      graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at
    ) VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  if (includeMembership) {
    await sql`
      INSERT INTO graph_version_run_memberships (
        graph_version_run_membership_id, graph_version_id, run_id, source_resource_id
      ) VALUES (${randomUUID()}, ${graphVersionId}, ${extractionRunId}, ${sourceResourceId})`;
  }
  await sql`
    INSERT INTO graph_enrichments (
      enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model,
      difficulty_method, completed_at
    ) VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test', now())`;
  await sql`
    INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
    VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${conceptId}, 'test-domain')`;
  await sql`
    INSERT INTO derived_graph_nodes (
      derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role,
      canonical_label, normalized_label, declared_domain, aliases
    ) VALUES (
      ${derivedNodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor',
      ${title}, ${conceptId}, 'test-domain', '[]'::jsonb
    )`;
  await sql`
    INSERT INTO concept_lessons (
      concept_lesson_id, graph_version_id, enrichment_id, derived_node_id, canonical_label,
      generating_model, config_hash
    ) VALUES (${conceptLessonId}, ${graphVersionId}, ${enrichmentId}, ${derivedNodeId}, ${title}, 'test', 'qualified:test')`;
  await sql`
    INSERT INTO study_items (
      study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id,
      grounding_provenance, question, explanation, generating_model, config_hash
    ) VALUES (
      ${studyItemId}, 'option_select', ${graphVersionId}, ${enrichmentId}, ${derivedNodeId},
      'source_cep', 'Question?', 'Explanation.', 'test', 'qualified:test'
    )`;
  return {
    sourceResourceId,
    sourceDocumentId,
    extractionRunId,
    graphVersionId,
    enrichmentId,
    conceptId,
    derivedNodeId,
    expectedAssets: {
      assetSetIdentity: `accepted-${enrichmentId}`,
      currentConceptLessonIds: [conceptLessonId],
      currentStudyItemIds: [studyItemId]
    }
  };
}

function publication(
  seeded: SeededAssets,
  catalogKey: string,
  sortOrder: number,
  title: string
): PublishSourceExpeditionCatalogEntry {
  return {
    catalogKey,
    enrichmentId: seeded.enrichmentId,
    title,
    teaser: `Learn ${title}.`,
    catalogRole: "test_role",
    audience: "test_audience",
    sortOrder,
    sourceProvenance,
    acceptedAssetSetIdentity: seeded.expectedAssets.assetSetIdentity,
    acceptedAssetConfigHash: "qualified:test",
    expectedAssets: seeded.expectedAssets
  };
}

async function cleanup(sql: Sql, catalogKeys: string[], seeds: SeededAssets[]) {
  await sql`DELETE FROM source_expedition_catalog_entries WHERE catalog_key::text = ANY(${catalogKeys})`;
  const enrichmentIds = seeds.map((seed) => seed.enrichmentId);
  const graphVersionIds = seeds.map((seed) => seed.graphVersionId);
  const extractionRunIds = seeds.map((seed) => seed.extractionRunId);
  const sourceDocumentIds = seeds.map((seed) => seed.sourceDocumentId);
  const sourceResourceIds = seeds.map((seed) => seed.sourceResourceId);
  const conceptIds = seeds.map((seed) => seed.conceptId);
  await sql`DELETE FROM concept_lessons WHERE enrichment_id::text = ANY(${enrichmentIds})`;
  await sql`DELETE FROM study_items WHERE enrichment_id::text = ANY(${enrichmentIds})`;
  await sql`DELETE FROM derived_graph_nodes WHERE enrichment_id::text = ANY(${enrichmentIds})`;
  await sql`DELETE FROM graph_enrichments WHERE enrichment_id::text = ANY(${enrichmentIds})`;
  await sql`DELETE FROM graph_version_run_memberships WHERE graph_version_id::text = ANY(${graphVersionIds})`;
  await sql`DELETE FROM graph_versions WHERE graph_version_id::text = ANY(${graphVersionIds})`;
  await sql`DELETE FROM extraction_runs WHERE run_id::text = ANY(${extractionRunIds})`;
  await sql`DELETE FROM source_documents WHERE source_document_id::text = ANY(${sourceDocumentIds})`;
  await sql`DELETE FROM source_resources WHERE source_resource_id::text = ANY(${sourceResourceIds})`;
  await sql`DELETE FROM concepts WHERE concept_id::text = ANY(${conceptIds})`;
}

maybe("accepted catalog publication pins assets, orders rows, and derives registered source credits", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const keys = [`catalog-${randomUUID()}`, `catalog-${randomUUID()}`];
  const seeds: SeededAssets[] = [];
  try {
    seeds.push(await seedAcceptedAssets(sql, "Second source"));
    seeds.push(await seedAcceptedAssets(sql, "First source"));
    const store = new PostgresSourceExpeditionCatalog(sql);
    assert.deepEqual(await store.publishAccepted(publication(seeds[0], keys[0], 2, "Second")), {
      published: true
    });
    assert.deepEqual(await store.publishAccepted(publication(seeds[1], keys[1], 1, "First")), {
      published: true
    });

    const entries = (await store.listAccepted()).filter((entry) => keys.includes(entry.catalogKey));
    assert.deepEqual(entries.map((entry) => entry.catalogKey), [keys[1], keys[0]]);
    assert.deepEqual(entries[0].sourceProvenance, sourceProvenance);
    assert.deepEqual(entries[0].sourceCredits, [{
      sourceResourceId: seeds[1].sourceResourceId,
      title: "First source",
      sourceUri: "lrnki model-authored project source",
      license: "lrnki project-owned playtest fixture"
    }]);
    assert.equal(
      (await store.getAcceptedByEnrichment(seeds[0].enrichmentId))?.acceptedAssetSetIdentity,
      seeds[0].expectedAssets.assetSetIdentity
    );
  } finally {
    await cleanup(sql, keys, seeds);
    await sql.end();
  }
});

maybe("changed assets refuse catalog publication without leaving a row", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const key = `catalog-${randomUUID()}`;
  const seeds: SeededAssets[] = [];
  try {
    const seeded = await seedAcceptedAssets(sql, "Changed source");
    seeds.push(seeded);
    const stale = publication(seeded, key, 1, "Changed");
    stale.acceptedAssetSetIdentity = "different-from-inspected-assets";
    const store = new PostgresSourceExpeditionCatalog(sql);
    assert.deepEqual(await store.publishAccepted(stale), {
      published: false,
      refused: "accepted_asset_set_changed"
    });
    stale.acceptedAssetSetIdentity = stale.expectedAssets.assetSetIdentity;
    stale.expectedAssets = {
      ...stale.expectedAssets,
      currentConceptLessonIds: [randomUUID()]
    };
    assert.deepEqual(await store.publishAccepted(stale), {
      published: false,
      refused: "accepted_asset_set_changed"
    });
    assert.equal(await store.getAcceptedByEnrichment(seeded.enrichmentId), undefined);
  } finally {
    await cleanup(sql, [key], seeds);
    await sql.end();
  }
});

maybe("publication requires source credits derived from Graph Version membership", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const key = `catalog-${randomUUID()}`;
  const seeds: SeededAssets[] = [];
  try {
    const seeded = await seedAcceptedAssets(sql, "Unregistered source", false);
    seeds.push(seeded);
    const store = new PostgresSourceExpeditionCatalog(sql);
    await assert.rejects(
      () => store.publishAccepted(publication(seeded, key, 1, "Unregistered")),
      /requires registered source credits/
    );
    assert.equal(await store.getAcceptedByEnrichment(seeded.enrichmentId), undefined);
  } finally {
    await cleanup(sql, [key], seeds);
    await sql.end();
  }
});
