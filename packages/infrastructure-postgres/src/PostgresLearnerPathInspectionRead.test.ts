import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerPathInspectionRead } from "./PostgresLearnerPathInspectionRead";

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// Seed a minimal enrichment with two enrichment nodes (A prereq → B target), a certain
// edge, difficulties, and a 2-step learner path, then read it back through the adapter.
async function seed(sql: ReturnType<typeof createDatabaseClient>) {
  const graphVersionId = randomUUID();
  const enrichmentId = randomUUID();
  const nodeA = randomUUID();
  const nodeB = randomUUID();
  const learnerPathId = randomUUID();
  await sql`
    INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
    VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  await sql`
    INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method)
    VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test', 'test')`;
  for (const [id, label] of [[nodeA, "Alpha"], [nodeB, "Beta"]] as const) {
    await sql`
      INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
      VALUES (${id}, ${enrichmentId}, 'enrichment', NULL, 'source_mentioned', 'prerequisite', ${label}, ${label.toLowerCase()}, 'rust', '[]'::jsonb)`;
  }
  await sql`
    INSERT INTO inferred_prerequisite_edges (inferred_prerequisite_edge_id, enrichment_id, prerequisite_derived_node_id, dependent_derived_node_id, confidence, uncertain, judge_model, provenance)
    VALUES (${randomUUID()}, ${enrichmentId}, ${nodeA}, ${nodeB}, 0.9, false, 'test', '{}'::jsonb)`;
  for (const [id, score] of [[nodeA, 0.3], [nodeB, 0.8]] as const) {
    await sql`
      INSERT INTO concept_difficulties (concept_difficulty_id, enrichment_id, derived_node_id, score, method, components, neural_rationale)
      VALUES (${randomUUID()}, ${enrichmentId}, ${id}, ${score}, 'test', '{}'::jsonb, '')`;
  }
  await sql`
    INSERT INTO learner_paths (learner_path_id, graph_version_id, enrichment_id, target_derived_node_id, learner_state_ref)
    VALUES (${learnerPathId}, ${graphVersionId}, ${enrichmentId}, ${nodeB}, 'L1')`;
  await sql`
    INSERT INTO learner_path_steps (learner_path_step_id, learner_path_id, position, derived_node_id, difficulty, included_reason)
    VALUES (${randomUUID()}, ${learnerPathId}, 1, ${nodeA}, 0.3, 'prerequisite'),
           (${randomUUID()}, ${learnerPathId}, 2, ${nodeB}, 0.8, 'target')`;
  return { learnerPathId, nodeA, nodeB };
}

maybe("listLearnerPaths summarizes a seeded path; getLearnerPathDetail stitches steps, DAG nodes, and edges", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { learnerPathId, nodeA, nodeB } = await seed(sql);
    const read = new PostgresLearnerPathInspectionRead(sql);

    const summaries = await read.listLearnerPaths();
    const summary = summaries.find((s) => s.learnerPathId === learnerPathId);
    assert.ok(summary, "the seeded path appears in the summary list");
    assert.equal(summary.targetLabel, "Beta");
    assert.equal(summary.stepCount, 2);
    assert.equal(summary.declaredDomain, "rust");

    const detail = await read.getLearnerPathDetail(learnerPathId);
    assert.ok(detail);
    assert.deepEqual(detail.steps.map((s) => s.derivedNodeId), [nodeA, nodeB]);
    const target = detail.nodes.find((n) => n.derivedNodeId === nodeB);
    assert.equal(target?.isTarget, true);
    assert.equal(target?.inPath, true);
    const edge = detail.edges.find((e) => e.prerequisiteDerivedNodeId === nodeA && e.dependentDerivedNodeId === nodeB);
    assert.ok(edge);
    assert.equal(edge.inPath, true, "a certain edge between two in-path nodes is on the path");
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("getLearnerPathDetail returns undefined for an unknown path id", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    assert.equal(await new PostgresLearnerPathInspectionRead(sql).getLearnerPathDetail(randomUUID()), undefined);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
