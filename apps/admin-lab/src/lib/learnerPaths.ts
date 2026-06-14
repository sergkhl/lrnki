import { createDatabaseClient } from "@lrnki/infrastructure-postgres";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only, read-only loaders for the Admin Lab Learner Path view (ADR-0011,
// ADR-0019). The CLI computes and persists paths and the Derived Graph Layer; the
// UI only reads them and never computes (rule 12). The detail view renders the
// persisted path highlighted over the inferred prerequisite DAG of its enrichment.

export interface LearnerPathSummary {
  learnerPathId: string;
  targetConceptId: string;
  targetLabel: string;
  declaredDomain: string;
  learnerStateRef: string;
  stepCount: number;
  graphVersionId: string;
  enrichmentId: string;
  createdAt: string;
}

export interface LearnerPathNode {
  conceptId: string;
  label: string;
  difficulty: number | null;
  inPath: boolean;
  position: number | null;
  isTarget: boolean;
}

export interface LearnerPathEdge {
  prerequisiteConceptId: string;
  dependentConceptId: string;
  confidence: number;
  uncertain: boolean;
  inPath: boolean;
}

export interface LearnerPathDetail {
  summary: LearnerPathSummary;
  steps: { position: number; conceptId: string; label: string; difficulty: number; includedReason: string }[];
  // The inferred prerequisite DAG of the path's enrichment, scoped to the target's
  // Declared Domain (prerequisites are always same-domain, ADR-0015).
  nodes: LearnerPathNode[];
  edges: LearnerPathEdge[];
}

async function withClient<T>(fn: (sql: Sql) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } catch {
    return undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function listLearnerPaths(): Promise<LearnerPathSummary[] | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<{
      learner_path_id: string; target_concept_id: string; target_label: string; declared_domain: string;
      learner_state_ref: string; step_count: number; graph_version_id: string; enrichment_id: string; created_at: string;
    }[]>`
      SELECT p.learner_path_id, p.target_concept_id, c.canonical_label AS target_label, c.declared_domain,
             p.learner_state_ref, p.graph_version_id, p.enrichment_id, p.created_at,
             (SELECT count(*) FROM learner_path_steps s WHERE s.learner_path_id = p.learner_path_id) AS step_count
      FROM learner_paths p
      JOIN concepts c ON c.concept_id = p.target_concept_id
      ORDER BY p.created_at DESC`;
    return rows.map((row) => ({
      learnerPathId: row.learner_path_id,
      targetConceptId: row.target_concept_id,
      targetLabel: row.target_label,
      declaredDomain: row.declared_domain,
      learnerStateRef: row.learner_state_ref,
      stepCount: Number(row.step_count),
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      createdAt: new Date(row.created_at).toISOString()
    }));
  });
}

export async function getLearnerPathDetail(learnerPathId: string): Promise<LearnerPathDetail | undefined> {
  return withClient(async (sql) => {
    const headers = await sql<{
      learner_path_id: string; target_concept_id: string; target_label: string; declared_domain: string;
      learner_state_ref: string; graph_version_id: string; enrichment_id: string; created_at: string;
    }[]>`
      SELECT p.learner_path_id, p.target_concept_id, c.canonical_label AS target_label, c.declared_domain,
             p.learner_state_ref, p.graph_version_id, p.enrichment_id, p.created_at
      FROM learner_paths p
      JOIN concepts c ON c.concept_id = p.target_concept_id
      WHERE p.learner_path_id = ${learnerPathId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    const stepRows = await sql<{ position: number; concept_id: string; label: string; difficulty: number; included_reason: string }[]>`
      SELECT s.position, s.concept_id, c.canonical_label AS label, s.difficulty, s.included_reason
      FROM learner_path_steps s
      JOIN concepts c ON c.concept_id = s.concept_id
      WHERE s.learner_path_id = ${learnerPathId}
      ORDER BY s.position`;
    const positionByConcept = new Map(stepRows.map((row) => [row.concept_id, row.position] as const));

    // DAG context for the enrichment, scoped to the target's Declared Domain.
    const nodeRows = await sql<{ concept_id: string; label: string; score: number | null }[]>`
      SELECT c.concept_id, c.canonical_label AS label, d.score
      FROM concepts c
      JOIN graph_version_concept_memberships m ON m.concept_id = c.concept_id AND m.graph_version_id = ${header.graph_version_id}
      LEFT JOIN concept_difficulties d ON d.concept_id = c.concept_id AND d.enrichment_id = ${header.enrichment_id}
      WHERE c.declared_domain = ${header.declared_domain}
      ORDER BY d.score NULLS LAST, c.canonical_label`;

    const edgeRows = await sql<{ prerequisite_concept_id: string; dependent_concept_id: string; confidence: number; uncertain: boolean }[]>`
      SELECT e.prerequisite_concept_id, e.dependent_concept_id, e.confidence, e.uncertain
      FROM inferred_prerequisite_edges e
      JOIN concepts cp ON cp.concept_id = e.prerequisite_concept_id
      WHERE e.enrichment_id = ${header.enrichment_id} AND cp.declared_domain = ${header.declared_domain}
      ORDER BY e.prerequisite_concept_id, e.dependent_concept_id`;

    const nodes: LearnerPathNode[] = nodeRows.map((row) => ({
      conceptId: row.concept_id,
      label: row.label,
      difficulty: row.score === null ? null : Number(row.score),
      inPath: positionByConcept.has(row.concept_id),
      position: positionByConcept.get(row.concept_id) ?? null,
      isTarget: row.concept_id === header.target_concept_id
    }));
    const edges: LearnerPathEdge[] = edgeRows.map((row) => ({
      prerequisiteConceptId: row.prerequisite_concept_id,
      dependentConceptId: row.dependent_concept_id,
      confidence: Number(row.confidence),
      uncertain: row.uncertain,
      // An edge is on the path when both endpoints are included and not uncertain.
      inPath: !row.uncertain && positionByConcept.has(row.prerequisite_concept_id) && positionByConcept.has(row.dependent_concept_id)
    }));

    return {
      summary: {
        learnerPathId: header.learner_path_id,
        targetConceptId: header.target_concept_id,
        targetLabel: header.target_label,
        declaredDomain: header.declared_domain,
        learnerStateRef: header.learner_state_ref,
        stepCount: stepRows.length,
        graphVersionId: header.graph_version_id,
        enrichmentId: header.enrichment_id,
        createdAt: new Date(header.created_at).toISOString()
      },
      steps: stepRows.map((row) => ({
        position: row.position,
        conceptId: row.concept_id,
        label: row.label,
        difficulty: Number(row.difficulty),
        includedReason: row.included_reason
      })),
      nodes,
      edges
    };
  });
}
