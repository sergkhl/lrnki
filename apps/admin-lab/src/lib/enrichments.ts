import { createDatabaseClient } from "@lrnki/infrastructure-postgres";
import type {
  DerivedGraphDetail,
  DerivedGraphEdge,
  DerivedGraphNode,
  EnrichmentSummary,
  GroundingPassageView,
  MintingDispositionView,
  NodeGroundingView,
  NodeMergeView,
  RescueDispositionView
} from "./derivedGraph";
import { summarizeOriginCounts } from "./derivedGraph";

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

    // The DERIVED node space: anchor projections + enrichment (minted/rescued) nodes
    // (R15). Difficulty and edges reference derived_node_id only (KTD2).
    // `study_items` can hold multiple types per derived_node_id, so the EXISTS check keeps
    // one row per node while flagging whether any study item exists for graph inspection.
    const nodeRows = await sql<{ derived_node_id: string; node_kind: string; grounding_origin: string; role: string; label: string; aliases: string[]; declared_domain: string; score: number | null; neural_rationale: string | null; has_study_item: boolean }[]>`
      SELECT n.derived_node_id, n.node_kind, n.grounding_origin, n.role, n.canonical_label AS label, n.aliases, n.declared_domain, d.score, d.neural_rationale,
             EXISTS (SELECT 1 FROM study_items si WHERE si.derived_node_id = n.derived_node_id) AS has_study_item
      FROM derived_graph_nodes n
      LEFT JOIN concept_difficulties d ON d.derived_node_id = n.derived_node_id AND d.enrichment_id = n.enrichment_id
      WHERE n.enrichment_id = ${header.enrichment_id}
      ORDER BY n.declared_domain, n.node_kind, d.score NULLS LAST, n.canonical_label`;
    const edgeRows = await sql<{ prerequisite_derived_node_id: string; dependent_derived_node_id: string; confidence: number; uncertain: boolean; judge_model: string }[]>`
      SELECT prerequisite_derived_node_id, dependent_derived_node_id, confidence, uncertain, judge_model
      FROM inferred_prerequisite_edges
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY prerequisite_derived_node_id, dependent_derived_node_id`;

    // Rescue-durability dispositions (U5): the relational mirror of the trace's
    // accept/drop/kept-judge-unavailable record. Read-only, no recompute (rule 12).
    const rescueRows = await sql<{ derived_node_id: string; canonical_label: string; declared_domain: string; disposition: string; rationale: string; grounding_span: string }[]>`
      SELECT derived_node_id, canonical_label, declared_domain, disposition, rationale, grounding_span
      FROM rescue_dispositions
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, disposition, canonical_label`;

    // Minting-durability dispositions: each reserved proposal's accept/drop/fail-open
    // decision before grounding generation. Read-only, no recompute (rule 12).
    const mintingRows = await sql<{ derived_node_id: string; proposed_label: string; declared_domain: string; anchor_concept_id: string; disposition: string; rationale: string }[]>`
      SELECT derived_node_id, proposed_label, declared_domain, anchor_concept_id, disposition, rationale
      FROM minting_dispositions
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, disposition, proposed_label`;

    // Semantic merges (U5): the relational mirror of the run trace's merge records.
    // Read-only, no recompute (rule 12). The absorbed node was removed from the layer, so
    // its label/aliases/evidence come from the snapshot columns.
    const mergeRows = await sql<{ declared_domain: string; canonical_derived_node_id: string; canonical_label: string; absorbed_label: string; absorbed_aliases: string[]; proposing_signal: string; proposing_score: number; rationale: string; canonical_selection_reason: string }[]>`
      SELECT declared_domain, canonical_derived_node_id, canonical_label, absorbed_label, absorbed_aliases,
             proposing_signal, proposing_score, rationale, canonical_selection_reason
      FROM derived_node_merges
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, canonical_label, absorbed_label`;

    // Grounding bundles + passages for the enrichment nodes (R8, R15). The verbatim
    // disposition (R9, AE3) is read from the recorded run trace, falling back to the
    // grounding-origin invariant when the trace is absent.
    const bundleRows = await sql<{ derived_node_id: string; generating_model: string; rationale: string }[]>`
      SELECT b.derived_node_id, b.generating_model, b.rationale
      FROM enrichment_grounding_bundles b
      JOIN derived_graph_nodes n ON n.derived_node_id = b.derived_node_id
      WHERE n.enrichment_id = ${header.enrichment_id}`;
    const bundleByNode = new Map(bundleRows.map((row) => [row.derived_node_id, row]));
    const passageRows = await sql<{ derived_node_id: string; passage_type: string; grounding_origin: string; generated_text: string | null; evidence_quote: string | null; salience_rank: number }[]>`
      SELECT p.derived_node_id, p.passage_type, p.grounding_origin, p.generated_text, p.evidence_quote, p.salience_rank
      FROM enrichment_grounding_passages p
      JOIN derived_graph_nodes n ON n.derived_node_id = p.derived_node_id
      WHERE n.enrichment_id = ${header.enrichment_id}
      ORDER BY p.derived_node_id, p.salience_rank`;
    const passagesByNode = new Map<string, GroundingPassageView[]>();
    for (const row of passageRows) {
      const list = passagesByNode.get(row.derived_node_id) ?? [];
      list.push({
        passageType: row.passage_type as GroundingPassageView["passageType"],
        text: row.generated_text ?? row.evidence_quote ?? "",
        groundingOrigin: row.grounding_origin as GroundingPassageView["groundingOrigin"]
      });
      passagesByNode.set(row.derived_node_id, list);
    }
    const dispositionRows = await sql<{ derived_node_id: string; outcome: string }[]>`
      SELECT d.derived_node_id, d.outcome
      FROM artifact_versions a,
      JSON_TABLE(a.payload, '$.groundingDispositions[*]' COLUMNS (
        derived_node_id text PATH '$.derivedNodeId',
        outcome text PATH '$.outcome'
      )) AS d
      WHERE a.artifact_type = 'enrichment_run.v3' AND a.payload->>'enrichmentId' = ${header.enrichment_id}`;
    const dispositionByNode = new Map(dispositionRows.map((row) => [row.derived_node_id, row.outcome]));

    const groundingFor = (row: { derived_node_id: string; node_kind: string; grounding_origin: string }): NodeGroundingView | null => {
      if (row.node_kind !== "enrichment") return null;
      const bundle = bundleByNode.get(row.derived_node_id);
      return {
        generatingModel: bundle?.generating_model ?? null,
        rationale: bundle?.rationale ?? null,
        passages: passagesByNode.get(row.derived_node_id) ?? [],
        verbatimDisposition: dispositionByNode.get(row.derived_node_id)
          ?? (row.grounding_origin === "llm_grounded" ? "not_applicable_by_grounding" : "verified")
      };
    };

    const nodes: DerivedGraphNode[] = nodeRows.map((row) => ({
      derivedNodeId: row.derived_node_id,
      label: row.label,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      declaredDomain: row.declared_domain,
      difficulty: row.score === null ? null : Number(row.score),
      difficultyRationale: row.neural_rationale,
      nodeKind: row.node_kind as DerivedGraphNode["nodeKind"],
      groundingOrigin: row.grounding_origin as DerivedGraphNode["groundingOrigin"],
      role: row.role as DerivedGraphNode["role"],
      hasStudyItem: row.has_study_item,
      grounding: groundingFor(row)
    }));
    const edges: DerivedGraphEdge[] = edgeRows.map((row) => ({
      prerequisiteDerivedNodeId: row.prerequisite_derived_node_id,
      dependentDerivedNodeId: row.dependent_derived_node_id,
      confidence: Number(row.confidence),
      uncertain: row.uncertain,
      judgeModel: row.judge_model
    }));
    const rescueDispositions: RescueDispositionView[] = rescueRows.map((row) => ({
      derivedNodeId: row.derived_node_id,
      canonicalLabel: row.canonical_label,
      declaredDomain: row.declared_domain,
      disposition: row.disposition as RescueDispositionView["disposition"],
      rationale: row.rationale,
      groundingSpan: row.grounding_span
    }));
    const mintingDispositions: MintingDispositionView[] = mintingRows.map((row) => ({
      derivedNodeId: row.derived_node_id,
      proposedLabel: row.proposed_label,
      declaredDomain: row.declared_domain,
      anchorConceptId: row.anchor_concept_id,
      disposition: row.disposition as MintingDispositionView["disposition"],
      rationale: row.rationale
    }));
    const merges: NodeMergeView[] = mergeRows.map((row) => ({
      declaredDomain: row.declared_domain,
      canonicalDerivedNodeId: row.canonical_derived_node_id,
      canonicalLabel: row.canonical_label,
      absorbedLabel: row.absorbed_label,
      absorbedAliases: Array.isArray(row.absorbed_aliases) ? row.absorbed_aliases : [],
      proposingSignal: row.proposing_signal,
      proposingScore: Number(row.proposing_score),
      rationale: row.rationale,
      canonicalSelectionReason: row.canonical_selection_reason
    }));

    return { summary: toEnrichmentSummary(header), nodes, edges, originCounts: summarizeOriginCounts(nodes), rescueDispositions, mintingDispositions, merges };
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
