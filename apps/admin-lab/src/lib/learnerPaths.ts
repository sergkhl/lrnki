import { createDatabaseClient } from "@lrnki/infrastructure-postgres";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only, read-only loaders for the Admin Lab Learner Path view (ADR-0011,
// ADR-0019). The CLI computes and persists paths and the Derived Graph Layer; the
// UI only reads them and never computes (rule 12). The detail view renders the
// persisted path highlighted over the inferred prerequisite DAG of its enrichment.
// The learner-recall subject identity is `derived_node_id` throughout (ADR-0025);
// these loaders never re-alias it back to a Concept id.

export interface LearnerPathSummary {
  learnerPathId: string;
  targetDerivedNodeId: string;
  targetLabel: string;
  declaredDomain: string;
  learnerStateRef: string;
  stepCount: number;
  graphVersionId: string;
  enrichmentId: string;
  createdAt: string;
}

export interface LearnerPathNode {
  derivedNodeId: string;
  label: string;
  difficulty: number | null;
  inPath: boolean;
  position: number | null;
  isTarget: boolean;
}

export interface LearnerPathEdge {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  confidence: number;
  uncertain: boolean;
  inPath: boolean;
}

export interface LearnerPathDetail {
  summary: LearnerPathSummary;
  steps: { position: number; derivedNodeId: string; label: string; difficulty: number; includedReason: string; groundingOrigin: string }[];
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
      learner_path_id: string; target_derived_node_id: string; target_label: string; declared_domain: string;
      learner_state_ref: string; step_count: number; graph_version_id: string; enrichment_id: string; created_at: string;
    }[]>`
      SELECT p.learner_path_id, p.target_derived_node_id, tn.canonical_label AS target_label, tn.declared_domain,
             p.learner_state_ref, p.graph_version_id, p.enrichment_id, p.created_at,
             (SELECT count(*) FROM learner_path_steps s WHERE s.learner_path_id = p.learner_path_id) AS step_count
      FROM learner_paths p
      JOIN derived_graph_nodes tn ON tn.derived_node_id = p.target_derived_node_id
      ORDER BY p.created_at DESC`;
    return rows.map((row) => ({
      learnerPathId: row.learner_path_id,
      targetDerivedNodeId: row.target_derived_node_id,
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
      learner_path_id: string; target_derived_node_id: string; target_label: string; declared_domain: string;
      learner_state_ref: string; graph_version_id: string; enrichment_id: string; created_at: string;
    }[]>`
      SELECT p.learner_path_id, p.target_derived_node_id, tn.canonical_label AS target_label, tn.declared_domain,
             p.learner_state_ref, p.graph_version_id, p.enrichment_id, p.created_at
      FROM learner_paths p
      JOIN derived_graph_nodes tn ON tn.derived_node_id = p.target_derived_node_id
      WHERE p.learner_path_id = ${learnerPathId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    const stepRows = await sql<{ position: number; derived_node_id: string; label: string; difficulty: number; included_reason: string; grounding_origin: string }[]>`
      SELECT s.position, s.derived_node_id, sn.canonical_label AS label, s.difficulty, s.included_reason, sn.grounding_origin
      FROM learner_path_steps s
      JOIN derived_graph_nodes sn ON sn.derived_node_id = s.derived_node_id
      WHERE s.learner_path_id = ${learnerPathId}
      ORDER BY s.position`;
    const positionByNode = new Map(stepRows.map((row) => [row.derived_node_id, row.position] as const));

    // DAG context for the enrichment, scoped to the target's Declared Domain. Spans
    // the derived node space (anchors ∪ enrichment nodes, R15).
    const nodeRows = await sql<{ derived_node_id: string; label: string; score: number | null }[]>`
      SELECT n.derived_node_id, n.canonical_label AS label, d.score
      FROM derived_graph_nodes n
      LEFT JOIN concept_difficulties d ON d.derived_node_id = n.derived_node_id AND d.enrichment_id = n.enrichment_id
      WHERE n.enrichment_id = ${header.enrichment_id} AND n.declared_domain = ${header.declared_domain}
      ORDER BY d.score NULLS LAST, n.canonical_label`;

    const edgeRows = await sql<{ prerequisite_derived_node_id: string; dependent_derived_node_id: string; confidence: number; uncertain: boolean }[]>`
      SELECT e.prerequisite_derived_node_id, e.dependent_derived_node_id, e.confidence, e.uncertain
      FROM inferred_prerequisite_edges e
      JOIN derived_graph_nodes cp ON cp.derived_node_id = e.prerequisite_derived_node_id
      WHERE e.enrichment_id = ${header.enrichment_id} AND cp.declared_domain = ${header.declared_domain}
      ORDER BY e.prerequisite_derived_node_id, e.dependent_derived_node_id`;

    const nodes: LearnerPathNode[] = nodeRows.map((row) => ({
      derivedNodeId: row.derived_node_id,
      label: row.label,
      difficulty: row.score === null ? null : Number(row.score),
      inPath: positionByNode.has(row.derived_node_id),
      position: positionByNode.get(row.derived_node_id) ?? null,
      isTarget: row.derived_node_id === header.target_derived_node_id
    }));
    const edges: LearnerPathEdge[] = edgeRows.map((row) => ({
      prerequisiteDerivedNodeId: row.prerequisite_derived_node_id,
      dependentDerivedNodeId: row.dependent_derived_node_id,
      confidence: Number(row.confidence),
      uncertain: row.uncertain,
      // An edge is on the path when both endpoints are included and not uncertain.
      inPath: !row.uncertain && positionByNode.has(row.prerequisite_derived_node_id) && positionByNode.has(row.dependent_derived_node_id)
    }));

    return {
      summary: {
        learnerPathId: header.learner_path_id,
        targetDerivedNodeId: header.target_derived_node_id,
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
        derivedNodeId: row.derived_node_id,
        label: row.label,
        difficulty: Number(row.difficulty),
        includedReason: row.included_reason,
        groundingOrigin: row.grounding_origin
      })),
      nodes,
      edges
    };
  });
}
