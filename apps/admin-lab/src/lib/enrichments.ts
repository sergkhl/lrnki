import { createDatabaseClient } from "@lrnki/infrastructure-postgres";
import type { DerivedGraphDetail, DerivedGraphEdge, DerivedGraphNode, EnrichmentSummary } from "./derivedGraph";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only, read-only loaders for the Admin Lab Enrichment Run views (ADR-0011,
// ADR-0019). The CLI computes and persists each immutable Derived Graph Layer; the
// UI only reads it and never computes (rule 12). A Derived Graph Layer is rendered
// independently of learner paths (U6 test scenario 5).

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

export async function listEnrichments(): Promise<EnrichmentSummary[] | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<{
      enrichment_id: string; graph_version_id: string; enrichment_config_hash: string; judge_model: string;
      difficulty_method: string; status: string; started_at: string; completed_at: string | null;
      edge_count: number; certain_edge_count: number; concept_count: number;
    }[]>`
      SELECT g.enrichment_id, g.graph_version_id, g.enrichment_config_hash, g.judge_model, g.difficulty_method,
             g.status, g.started_at, g.completed_at,
             (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id) AS edge_count,
             (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id AND NOT e.uncertain) AS certain_edge_count,
             (SELECT count(*) FROM concept_difficulties d WHERE d.enrichment_id = g.enrichment_id) AS concept_count
      FROM graph_enrichments g
      ORDER BY g.started_at DESC`;
    return rows.map(toEnrichmentSummary);
  });
}

export async function getEnrichmentDetail(enrichmentId: string): Promise<DerivedGraphDetail | undefined> {
  return withClient(async (sql) => {
    const headers = await sql<{
      enrichment_id: string; graph_version_id: string; enrichment_config_hash: string; judge_model: string;
      difficulty_method: string; status: string; started_at: string; completed_at: string | null;
      edge_count: number; certain_edge_count: number; concept_count: number;
    }[]>`
      SELECT g.enrichment_id, g.graph_version_id, g.enrichment_config_hash, g.judge_model, g.difficulty_method,
             g.status, g.started_at, g.completed_at,
             (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id) AS edge_count,
             (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id AND NOT e.uncertain) AS certain_edge_count,
             (SELECT count(*) FROM concept_difficulties d WHERE d.enrichment_id = g.enrichment_id) AS concept_count
      FROM graph_enrichments g
      WHERE g.enrichment_id = ${enrichmentId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    // All Concepts of the enriched graph version, with this enrichment's difficulty.
    const nodeRows = await sql<{ concept_id: string; label: string; declared_domain: string; score: number | null }[]>`
      SELECT c.concept_id, gvc.canonical_label AS label, c.declared_domain, d.score
      FROM concepts c
      JOIN graph_version_concepts gvc ON gvc.concept_id = c.concept_id AND gvc.graph_version_id = ${header.graph_version_id}
      LEFT JOIN concept_difficulties d ON d.concept_id = c.concept_id AND d.enrichment_id = ${header.enrichment_id}
      ORDER BY c.declared_domain, d.score NULLS LAST, gvc.canonical_label`;
    const edgeRows = await sql<{ prerequisite_concept_id: string; dependent_concept_id: string; confidence: number; uncertain: boolean }[]>`
      SELECT prerequisite_concept_id, dependent_concept_id, confidence, uncertain
      FROM inferred_prerequisite_edges
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY prerequisite_concept_id, dependent_concept_id`;

    const nodes: DerivedGraphNode[] = nodeRows.map((row) => ({
      conceptId: row.concept_id,
      label: row.label,
      declaredDomain: row.declared_domain,
      difficulty: row.score === null ? null : Number(row.score)
    }));
    const edges: DerivedGraphEdge[] = edgeRows.map((row) => ({
      prerequisiteConceptId: row.prerequisite_concept_id,
      dependentConceptId: row.dependent_concept_id,
      confidence: Number(row.confidence),
      uncertain: row.uncertain
    }));

    return { summary: toEnrichmentSummary(header), nodes, edges };
  });
}

function toEnrichmentSummary(row: {
  enrichment_id: string; graph_version_id: string; enrichment_config_hash: string; judge_model: string;
  difficulty_method: string; status: string; started_at: string; completed_at: string | null;
  edge_count: number; certain_edge_count: number; concept_count: number;
}): EnrichmentSummary {
  const edgeCount = Number(row.edge_count);
  const certainEdgeCount = Number(row.certain_edge_count);
  return {
    enrichmentId: row.enrichment_id,
    graphVersionId: row.graph_version_id,
    enrichmentConfigHash: row.enrichment_config_hash,
    judgeModel: row.judge_model,
    difficultyMethod: row.difficulty_method,
    status: row.status,
    edgeCount,
    certainEdgeCount,
    uncertainEdgeCount: edgeCount - certainEdgeCount,
    conceptCount: Number(row.concept_count),
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
  };
}
