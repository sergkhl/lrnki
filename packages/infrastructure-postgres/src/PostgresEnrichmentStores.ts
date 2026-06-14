import { randomUUID } from "node:crypto";
import type {
  ArtifactEnvelope,
  ConceptDifficulty,
  DerivedGraphLayer,
  EnrichmentRunTrace,
  InferredPrerequisiteEdge,
  LearnerPath,
  LearnerPathStep,
  PrerequisiteCandidateGroup
} from "@lrnki/domain-core";
import type { EnrichmentRunStorePort, LearnerPathStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

// Each Enrichment Run is appended once. Normalized rows are the query surface;
// the JSONB artifact is the complete judgment/disposition trace.
export class PostgresEnrichmentRunStore implements EnrichmentRunStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: {
    layer: DerivedGraphLayer;
    artifact: ArtifactEnvelope<EnrichmentRunTrace>;
  }): Promise<void> {
    const { layer, artifact } = input;
    const difficultyMethod = layer.difficulties[0]?.method ?? "dag-depth-mock";
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, embedding_model, judge_model, difficulty_method, completed_at)
        VALUES (${layer.enrichmentId}, ${layer.graphVersionId}, ${layer.enrichmentConfigHash}, 'succeeded', ${layer.embeddingModel}, ${layer.judgeModel}, ${difficultyMethod}, now())`;

      for (const group of layer.prerequisiteCandidateGroups) {
        for (const conceptId of group.conceptIds) {
          await tx`
            INSERT INTO enrichment_prerequisite_candidate_groups (enrichment_prerequisite_candidate_group_id, enrichment_id, group_id, concept_id)
            VALUES (${randomUUID()}, ${layer.enrichmentId}, ${group.groupId}, ${conceptId})`;
        }
      }

      for (const edge of layer.prerequisiteEdges) {
        await tx`
          INSERT INTO inferred_prerequisite_edges (inferred_prerequisite_edge_id, enrichment_id, predicate, prerequisite_concept_id, dependent_concept_id, confidence, uncertain, candidate_group_id, provenance)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${edge.predicate}, ${edge.prerequisiteConceptId}, ${edge.dependentConceptId}, ${edge.confidence}, ${edge.uncertain}, ${edge.candidateGroupId ?? null}, ${tx.json(edge.provenance as Parameters<Sql["json"]>[0])})`;
      }

      for (const difficulty of layer.difficulties) {
        await tx`
          INSERT INTO concept_difficulties (concept_difficulty_id, enrichment_id, concept_id, score, method, components)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${difficulty.conceptId}, ${difficulty.score}, ${difficulty.method}, ${tx.json(difficulty.components as Parameters<Sql["json"]>[0])})`;
      }

      await writeArtifactEnvelope(tx, artifact);
    });
  }

  async getLayer(enrichmentId: string): Promise<DerivedGraphLayer | undefined> {
    const rows = await this.sql<EnrichmentRow[]>`
      SELECT enrichment_id, graph_version_id, enrichment_config_hash, embedding_model, judge_model
      FROM graph_enrichments
      WHERE enrichment_id = ${enrichmentId}
      LIMIT 1`;
    return rows.length ? this.hydrate(rows[0]) : undefined;
  }

  private async hydrate(row: EnrichmentRow): Promise<DerivedGraphLayer> {
    const groupRows = await this.sql<{ group_id: string; concept_id: string }[]>`
      SELECT group_id, concept_id FROM enrichment_prerequisite_candidate_groups WHERE enrichment_id = ${row.enrichment_id} ORDER BY group_id, concept_id`;
    const conceptsByGroup = new Map<string, string[]>();
    for (const group of groupRows) {
      const existing = conceptsByGroup.get(group.group_id);
      if (existing) existing.push(group.concept_id);
      else conceptsByGroup.set(group.group_id, [group.concept_id]);
    }
    const prerequisiteCandidateGroups: PrerequisiteCandidateGroup[] = [...conceptsByGroup.entries()].map(([groupId, conceptIds]) => ({
      groupId,
      conceptIds,
      embeddingModel: row.embedding_model
    }));

    const edgeRows = await this.sql<{
      predicate: string; prerequisite_concept_id: string; dependent_concept_id: string;
      confidence: number; uncertain: boolean; candidate_group_id: string | null;
      provenance: InferredPrerequisiteEdge["provenance"];
    }[]>`
      SELECT predicate, prerequisite_concept_id, dependent_concept_id, confidence, uncertain, candidate_group_id, provenance
      FROM inferred_prerequisite_edges WHERE enrichment_id = ${row.enrichment_id}
      ORDER BY prerequisite_concept_id, dependent_concept_id`;
    const prerequisiteEdges: InferredPrerequisiteEdge[] = edgeRows.map((edge) => ({
      prerequisiteConceptId: edge.prerequisite_concept_id,
      dependentConceptId: edge.dependent_concept_id,
      predicate: edge.predicate as InferredPrerequisiteEdge["predicate"],
      confidence: edge.confidence,
      uncertain: edge.uncertain,
      candidateGroupId: edge.candidate_group_id ?? undefined,
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
      prerequisiteCandidateGroups,
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
