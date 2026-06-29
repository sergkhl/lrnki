import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerLoopRead } from "./PostgresLearnerLoopRead";

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// Seed an enrichment with two enrichment nodes: A (prereq, has a study item + a graded
// response) and B (target, NO study item but a persisted rejection row), plus a 2-step path.
async function seed(sql: ReturnType<typeof createDatabaseClient>, learnerStateRef: string) {
  const graphVersionId = randomUUID();
  const enrichmentId = randomUUID();
  const nodeA = randomUUID();
  const nodeB = randomUUID();
  const learnerPathId = randomUUID();
  const studyItemId = randomUUID();
  await sql`INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at) VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  await sql`INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method) VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test')`;
  for (const [id, label, origin] of [[nodeA, "Alpha", "source_mentioned"], [nodeB, "Beta", "llm_grounded"]] as const) {
    await sql`INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases) VALUES (${id}, ${enrichmentId}, 'enrichment', NULL, ${origin}, 'prerequisite', ${label}, ${label.toLowerCase()}, 'rust', '[]'::jsonb)`;
  }
  await sql`INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash) VALUES (${studyItemId}, 'option_select', ${graphVersionId}, ${enrichmentId}, ${nodeA}, 'source_mentioned', 'What is Alpha?', 'test', 'cfg')`;
  await sql`INSERT INTO rejected_study_items (rejected_study_item_id, graph_version_id, enrichment_id, derived_node_id, reason, config_hash) VALUES (${randomUUID()}, ${graphVersionId}, ${enrichmentId}, ${nodeB}, 'no usable grounding for an option-select item', 'cfg')`;
  await sql`INSERT INTO learner_paths (learner_path_id, graph_version_id, enrichment_id, target_derived_node_id, learner_state_ref) VALUES (${learnerPathId}, ${graphVersionId}, ${enrichmentId}, ${nodeB}, ${learnerStateRef})`;
  await sql`INSERT INTO learner_path_steps (learner_path_step_id, learner_path_id, position, derived_node_id, difficulty, included_reason) VALUES (${randomUUID()}, ${learnerPathId}, 1, ${nodeA}, 0.3, 'prerequisite'), (${randomUUID()}, ${learnerPathId}, 2, ${nodeB}, 0.8, 'target')`;
  await sql`INSERT INTO response_log (response_id, learner_state_ref, study_item_id, derived_node_id, signal_type, judged_outcome, graded_score, response_source, grader_identity, attempt_seq, submitted_answer) VALUES (${randomUUID()}, ${learnerStateRef}, ${studyItemId}, ${nodeA}, 'graded', 'correct', 1, 'synthetic', 'kg-independent-judge', 1, 'x')`;
  return { enrichmentId, nodeA, nodeB };
}

maybe("listResponsesForLearner joins node label + question; coverage uses the study item or the persisted rejection reason", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const learnerStateRef = `L-${randomUUID()}`;
  try {
    const { nodeA, nodeB } = await seed(sql, learnerStateRef);
    const read = new PostgresLearnerLoopRead(sql);

    const responses = await read.listResponsesForLearner(learnerStateRef);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].derivedNodeId, nodeA);
    assert.equal(responses[0].nodeLabel, "Alpha");
    assert.equal(responses[0].question, "What is Alpha?");

    const all = await read.listAllResponses();
    assert.ok(all.some((row) => row.learnerStateRef === learnerStateRef), "the seeded row appears in the all-learner read");

    const coverage = await read.listCoverageForLearner(learnerStateRef);
    assert.equal(coverage.length, 1);
    const steps = coverage[0].steps;
    const stepA = steps.find((s) => s.derivedNodeId === nodeA);
    assert.ok(stepA?.studyItem, "node A's step carries its study item, no fallback");
    assert.equal(stepA.fallbackReason, null);
    const stepB = steps.find((s) => s.derivedNodeId === nodeB);
    assert.equal(stepB?.studyItem, null);
    assert.equal(stepB?.fallbackReason, "no usable grounding for an option-select item", "the persisted rejection reason is used, not the grounding-origin guess");
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
    assert.deepEqual(await read.listCoverageForLearner(ref), []);
    assert.deepEqual(await read.listPathScopesForLearner(ref), []);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
