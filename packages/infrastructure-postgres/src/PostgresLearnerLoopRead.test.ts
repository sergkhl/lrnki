import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerLoopRead } from "./PostgresLearnerLoopRead";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// Delete the learners this suite seeds so the shared dev DB is unchanged (R2/AE2).
after(() => cleanupTrackedLearners(databaseUrl));

// Seed an enrichment with one node, one study item, and a graded response.
async function seed(sql: ReturnType<typeof createDatabaseClient>, learnerStateRef: string) {
  const graphVersionId = randomUUID();
  const enrichmentId = randomUUID();
  const nodeA = randomUUID();
  const studyItemId = randomUUID();
  await seedLearner(sql, learnerStateRef);
  await sql`INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at) VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  await sql`INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method) VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test')`;
  await sql`INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases) VALUES (${nodeA}, ${enrichmentId}, 'enrichment', NULL, 'source_mentioned', 'prerequisite', 'Alpha', 'alpha', 'rust', '[]'::jsonb)`;
  await sql`INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash) VALUES (${studyItemId}, 'option_select', ${graphVersionId}, ${enrichmentId}, ${nodeA}, 'source_mentioned', 'What is Alpha?', 'test', 'cfg')`;
  await sql`INSERT INTO response_log (response_id, learner_state_ref, study_item_id, derived_node_id, signal_type, judged_outcome, graded_score, response_source, grader_identity, attempt_seq, submitted_answer) VALUES (${randomUUID()}, ${learnerStateRef}, ${studyItemId}, ${nodeA}, 'graded', 'correct', 1, 'synthetic', 'kg-independent-judge', 1, 'x')`;
  return { enrichmentId, nodeA };
}

maybe("listResponsesForLearner joins node label + question", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const learnerStateRef = `L-${randomUUID()}`;
  try {
    const { enrichmentId, nodeA } = await seed(sql, learnerStateRef);
    const read = new PostgresLearnerLoopRead(sql);

    const responses = await read.listResponsesForLearner(learnerStateRef);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].derivedNodeId, nodeA);
    assert.equal(responses[0].enrichmentId, enrichmentId);
    assert.equal(responses[0].nodeLabel, "Alpha");
    assert.equal(responses[0].question, "What is Alpha?");

    const all = await read.listAllResponses();
    assert.ok(all.some((row) => row.learnerStateRef === learnerStateRef), "the seeded row appears in the all-learner read");
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("an unknown learner yields empty reads", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const read = new PostgresLearnerLoopRead(sql);
    const ref = `missing-${randomUUID()}`;
    assert.deepEqual(await read.listResponsesForLearner(ref), []);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
