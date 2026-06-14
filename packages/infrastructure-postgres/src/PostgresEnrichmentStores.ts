import { randomUUID } from "node:crypto";
import type {
  ConceptCluster,
  ConceptDifficulty,
  DerivedGraphLayer,
  InferredPrerequisiteEdge,
  LearnerPath,
  LearnerPathStep
} from "@lrnki/domain-core";
import type { DerivedGraphLayerStorePort, LearnerPathStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";

// Graph Enrichment persistence (ADR-0019). The derived layer is stored as
// normalized rows (the query/traversal surface) keyed to (graphVersionId +
// enrichmentConfigHash); the immutable replay copy is an artifact envelope written
// separately by the application. Re-running enrichment with the same key is a REPLAY
// re-derivation (same inputs => same layer), not a semantic mutation, so persist
// replaces any prior rows for that key inside one transaction.
export class PostgresDerivedGraphLayerStore implements DerivedGraphLayerStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(layer: DerivedGraphLayer): Promise<void> {
    const difficultyMethod = layer.difficulties[0]?.method ?? "dag-depth-mock";
    await this.sql.begin(async (tx) => {
      // Replay re-derivation: drop any prior layer for this (version + config) in
      // child -> parent order (no ON DELETE CASCADE on the inferred namespace).
      const prior = await tx<{ enrichment_id: string }[]>`
        SELECT enrichment_id FROM graph_enrichments
        WHERE graph_version_id = ${layer.graphVersionId} AND enrichment_config_hash = ${layer.enrichmentConfigHash}`;
      for (const row of prior) {
        await tx`DELETE FROM concept_difficulties WHERE enrichment_id = ${row.enrichment_id}`;
        await tx`DELETE FROM inferred_prerequisite_edges WHERE enrichment_id = ${row.enrichment_id}`;
        await tx`DELETE FROM enrichment_concept_clusters WHERE enrichment_id = ${row.enrichment_id}`;
        await tx`DELETE FROM graph_enrichments WHERE enrichment_id = ${row.enrichment_id}`;
      }

      await tx`
        INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, embedding_model, judge_model, difficulty_method, completed_at)
        VALUES (${layer.enrichmentId}, ${layer.graphVersionId}, ${layer.enrichmentConfigHash}, 'succeeded', ${layer.embeddingModel}, ${layer.judgeModel}, ${difficultyMethod}, now())`;

      for (const cluster of layer.clusters) {
        for (const conceptId of cluster.conceptIds) {
          await tx`
            INSERT INTO enrichment_concept_clusters (enrichment_concept_cluster_id, enrichment_id, cluster_id, concept_id)
            VALUES (${randomUUID()}, ${layer.enrichmentId}, ${cluster.clusterId}, ${conceptId})`;
        }
      }

      for (const edge of layer.prerequisiteEdges) {
        await tx`
          INSERT INTO inferred_prerequisite_edges (inferred_prerequisite_edge_id, enrichment_id, predicate, prerequisite_concept_id, dependent_concept_id, confidence, uncertain, cluster_id, provenance)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${edge.predicate}, ${edge.prerequisiteConceptId}, ${edge.dependentConceptId}, ${edge.confidence}, ${edge.uncertain}, ${edge.clusterId ?? null}, ${tx.json(edge.provenance as Parameters<Sql["json"]>[0])})`;
      }

      for (const difficulty of layer.difficulties) {
        await tx`
          INSERT INTO concept_difficulties (concept_difficulty_id, enrichment_id, concept_id, score, method, components)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${difficulty.conceptId}, ${difficulty.score}, ${difficulty.method}, ${tx.json(difficulty.components as Parameters<Sql["json"]>[0])})`;
      }
    });
  }

  async getLayer(input: { graphVersionId: string; enrichmentConfigHash: string }): Promise<DerivedGraphLayer | undefined> {
    const rows = await this.sql<EnrichmentRow[]>`
      SELECT enrichment_id, graph_version_id, enrichment_config_hash, embedding_model, judge_model
      FROM graph_enrichments
      WHERE graph_version_id = ${input.graphVersionId} AND enrichment_config_hash = ${input.enrichmentConfigHash}
      LIMIT 1`;
    return rows.length ? this.hydrate(rows[0]) : undefined;
  }

  async getLatestLayer(graphVersionId: string): Promise<DerivedGraphLayer | undefined> {
    const rows = await this.sql<EnrichmentRow[]>`
      SELECT enrichment_id, graph_version_id, enrichment_config_hash, embedding_model, judge_model
      FROM graph_enrichments
      WHERE graph_version_id = ${graphVersionId}
      ORDER BY started_at DESC
      LIMIT 1`;
    return rows.length ? this.hydrate(rows[0]) : undefined;
  }

  private async hydrate(row: EnrichmentRow): Promise<DerivedGraphLayer> {
    const clusterRows = await this.sql<{ cluster_id: string; concept_id: string }[]>`
      SELECT cluster_id, concept_id FROM enrichment_concept_clusters WHERE enrichment_id = ${row.enrichment_id} ORDER BY cluster_id, concept_id`;
    const clustersById = new Map<string, string[]>();
    for (const cluster of clusterRows) {
      const existing = clustersById.get(cluster.cluster_id);
      if (existing) existing.push(cluster.concept_id);
      else clustersById.set(cluster.cluster_id, [cluster.concept_id]);
    }
    const clusters: ConceptCluster[] = [...clustersById.entries()].map(([clusterId, conceptIds]) => ({
      clusterId,
      conceptIds,
      embeddingModel: row.embedding_model
    }));

    const edgeRows = await this.sql<{
      predicate: string; prerequisite_concept_id: string; dependent_concept_id: string;
      confidence: number; uncertain: boolean; cluster_id: string | null;
      provenance: InferredPrerequisiteEdge["provenance"];
    }[]>`
      SELECT predicate, prerequisite_concept_id, dependent_concept_id, confidence, uncertain, cluster_id, provenance
      FROM inferred_prerequisite_edges WHERE enrichment_id = ${row.enrichment_id}
      ORDER BY prerequisite_concept_id, dependent_concept_id`;
    const prerequisiteEdges: InferredPrerequisiteEdge[] = edgeRows.map((edge) => ({
      prerequisiteConceptId: edge.prerequisite_concept_id,
      dependentConceptId: edge.dependent_concept_id,
      predicate: edge.predicate as InferredPrerequisiteEdge["predicate"],
      confidence: edge.confidence,
      uncertain: edge.uncertain,
      clusterId: edge.cluster_id ?? undefined,
      provenance: edge.provenance
    }));

    const difficultyRows = await this.sql<{ concept_id: string; score: number; method: string; components: ConceptDifficulty["components"] }[]>`
      SELECT concept_id, score, method, components FROM concept_difficulties WHERE enrichment_id = ${row.enrichment_id} ORDER BY concept_id`;
    const difficulties: ConceptDifficulty[] = difficultyRows.map((difficulty) => ({
      conceptId: difficulty.concept_id,
      score: difficulty.score,
      method: difficulty.method,
      components: difficulty.components
    }));

    return {
      enrichmentId: row.enrichment_id,
      graphVersionId: row.graph_version_id,
      enrichmentConfigHash: row.enrichment_config_hash,
      embeddingModel: row.embedding_model,
      judgeModel: row.judge_model,
      clusters,
      prerequisiteEdges,
      difficulties
    };
  }
}

type EnrichmentRow = {
  enrichment_id: string;
  graph_version_id: string;
  enrichment_config_hash: string;
  embedding_model: string;
  judge_model: string;
};

// Learner Path persistence (ADR-0019, ADR-0011). The CLI computes and persists;
// the Admin Lab Cytoscape view only reads. A path is a pure deterministic
// projection, so persist replaces any prior path for the same
// (enrichmentId, targetConceptId, learnerStateRef) — replay, not mutation.
export class PostgresLearnerPathStore implements LearnerPathStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(path: LearnerPath): Promise<void> {
    await this.sql.begin(async (tx) => {
      const prior = await tx<{ learner_path_id: string }[]>`
        SELECT learner_path_id FROM learner_paths
        WHERE enrichment_id = ${path.enrichmentId} AND target_concept_id = ${path.targetConceptId} AND learner_state_ref = ${path.learnerStateRef}`;
      for (const row of prior) {
        await tx`DELETE FROM learner_path_steps WHERE learner_path_id = ${row.learner_path_id}`;
        await tx`DELETE FROM learner_paths WHERE learner_path_id = ${row.learner_path_id}`;
      }
      await tx`
        INSERT INTO learner_paths (learner_path_id, graph_version_id, enrichment_id, target_concept_id, learner_state_ref)
        VALUES (${path.learnerPathId}, ${path.graphVersionId}, ${path.enrichmentId}, ${path.targetConceptId}, ${path.learnerStateRef})`;
      for (const step of path.steps) {
        await tx`
          INSERT INTO learner_path_steps (learner_path_step_id, learner_path_id, position, concept_id, difficulty, included_reason)
          VALUES (${randomUUID()}, ${path.learnerPathId}, ${step.position}, ${step.conceptId}, ${step.difficulty}, ${step.includedReason})`;
      }
    });
  }

  async getPath(input: { enrichmentId: string; targetConceptId: string; learnerStateRef: string }): Promise<LearnerPath | undefined> {
    const rows = await this.sql<{ learner_path_id: string; graph_version_id: string; enrichment_id: string; target_concept_id: string; learner_state_ref: string }[]>`
      SELECT learner_path_id, graph_version_id, enrichment_id, target_concept_id, learner_state_ref
      FROM learner_paths
      WHERE enrichment_id = ${input.enrichmentId} AND target_concept_id = ${input.targetConceptId} AND learner_state_ref = ${input.learnerStateRef}
      LIMIT 1`;
    if (rows.length === 0) return undefined;
    const row = rows[0];
    const stepRows = await this.sql<{ position: number; concept_id: string; difficulty: number; included_reason: string }[]>`
      SELECT position, concept_id, difficulty, included_reason FROM learner_path_steps WHERE learner_path_id = ${row.learner_path_id} ORDER BY position`;
    const steps: LearnerPathStep[] = stepRows.map((step) => ({
      position: step.position,
      conceptId: step.concept_id,
      difficulty: step.difficulty,
      includedReason: step.included_reason as LearnerPathStep["includedReason"]
    }));
    return {
      learnerPathId: row.learner_path_id,
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      targetConceptId: row.target_concept_id,
      learnerStateRef: row.learner_state_ref,
      steps
    };
  }
}
