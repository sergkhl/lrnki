import type {
  LearnerPathDetail,
  LearnerPathEdge,
  LearnerPathInspectionReadPort,
  LearnerPathNode,
  LearnerPathSummary
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Learner Path Inspection Read Model (ADR-0027, ADR-0011). Serves the Admin
// Lab Learner Path views without leaking SQL into the UI: this adapter owns the path summary
// query, the step + DAG-context stitch, and the `inPath`/`isTarget`/`uncertain` flags. The
// CLI computes and persists paths and the Derived Graph Layer; this only reads them (rule
// 12). Mirrors `PostgresEnrichmentInspectionRead`: `undefined` for not-found, real errors
// propagate.
export class PostgresLearnerPathInspectionRead implements LearnerPathInspectionReadPort {
  constructor(private readonly sql: Sql) {}

  async listLearnerPaths(): Promise<LearnerPathSummary[]> {
    const rows = await this.sql<{
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
  }

  async getLearnerPathDetail(learnerPathId: string): Promise<LearnerPathDetail | undefined> {
    const headers = await this.sql<{
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

    const stepRows = await this.sql<{ position: number; derived_node_id: string; label: string; difficulty: number; included_reason: string; grounding_origin: string }[]>`
      SELECT s.position, s.derived_node_id, sn.canonical_label AS label, s.difficulty, s.included_reason, sn.grounding_origin
      FROM learner_path_steps s
      JOIN derived_graph_nodes sn ON sn.derived_node_id = s.derived_node_id
      WHERE s.learner_path_id = ${learnerPathId}
      ORDER BY s.position`;
    const positionByNode = new Map(stepRows.map((row) => [row.derived_node_id, row.position] as const));

    // DAG context for the enrichment, scoped to the target's Declared Domain. Spans the
    // derived node space (anchors ∪ enrichment nodes).
    const nodeRows = await this.sql<{ derived_node_id: string; label: string; score: number | null }[]>`
      SELECT n.derived_node_id, n.canonical_label AS label, d.score
      FROM derived_graph_nodes n
      LEFT JOIN concept_difficulties d ON d.derived_node_id = n.derived_node_id AND d.enrichment_id = n.enrichment_id
      WHERE n.enrichment_id = ${header.enrichment_id} AND n.declared_domain = ${header.declared_domain}
      ORDER BY d.score NULLS LAST, n.canonical_label`;

    const edgeRows = await this.sql<{ prerequisite_derived_node_id: string; dependent_derived_node_id: string; confidence: number; uncertain: boolean }[]>`
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
  }
}
