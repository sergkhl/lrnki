import type {
  DerivedGraphDetail,
  DerivedGraphEdge,
  DerivedGraphNode,
  DomainOriginCounts,
  EnrichmentInspectionReadPort,
  EnrichmentSummary,
  GroundingPassageView,
  MintingDispositionView,
  NodeGroundingView,
  NodeMergeView,
  RescueDispositionView
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Derived Graph Layer Inspection Read Model (ADR-0027). Serves
// Admin Lab Enrichment Run inspection without leaking SQL into the UI: this
// adapter owns graph_enrichments summaries, derived-node row stitching,
// grounding-bundle passages, artifact-backed verbatim dispositions, durability
// dispositions, semantic merges, and per-domain origin counts.
export class PostgresEnrichmentInspectionRead implements EnrichmentInspectionReadPort {
  constructor(private readonly sql: Sql) {}

  async listEnrichmentSummaries(): Promise<EnrichmentSummary[]> {
    const rows = await this.sql<EnrichmentSummaryRow[]>`
      SELECT ${enrichmentSummaryColumns(this.sql)}
      FROM graph_enrichments g
      ORDER BY g.started_at DESC`;
    return rows.map(toEnrichmentSummary);
  }

  async getDerivedGraphDetail(enrichmentId: string): Promise<DerivedGraphDetail | undefined> {
    const headers = await this.sql<EnrichmentSummaryRow[]>`
      SELECT ${enrichmentSummaryColumns(this.sql)}
      FROM graph_enrichments g
      WHERE g.enrichment_id = ${enrichmentId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    const nodeRows = await this.sql<NodeRow[]>`
      SELECT n.derived_node_id, n.node_kind, n.grounding_origin, n.role, n.canonical_label AS label, n.aliases, n.declared_domain, d.score, d.neural_rationale,
             d.components->>'band' AS difficulty_band, d.components->>'contested' AS difficulty_contested,
             EXISTS (SELECT 1 FROM study_items si WHERE si.derived_node_id = n.derived_node_id AND si.superseded_at IS NULL) AS has_study_item
      FROM derived_graph_nodes n
      LEFT JOIN concept_difficulties d ON d.derived_node_id = n.derived_node_id AND d.enrichment_id = n.enrichment_id
      WHERE n.enrichment_id = ${header.enrichment_id}
      ORDER BY n.declared_domain, n.node_kind, d.score NULLS LAST, n.canonical_label`;
    const edgeRows = await this.sql<EdgeRow[]>`
      SELECT prerequisite_derived_node_id, dependent_derived_node_id, confidence, uncertain, judge_model
      FROM inferred_prerequisite_edges
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY prerequisite_derived_node_id, dependent_derived_node_id`;
    const rescueRows = await this.sql<RescueRow[]>`
      SELECT derived_node_id, canonical_label, declared_domain, disposition, rationale, grounding_span
      FROM rescue_dispositions
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, disposition, canonical_label`;
    const mintingRows = await this.sql<MintingRow[]>`
      SELECT derived_node_id, proposed_label, declared_domain, anchor_concept_id, disposition, rationale
      FROM minting_dispositions
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, disposition, proposed_label`;
    const mergeRows = await this.sql<MergeRow[]>`
      SELECT declared_domain, canonical_derived_node_id, canonical_label, absorbed_label, absorbed_aliases,
             proposing_signal, proposing_score, rationale, canonical_selection_reason
      FROM derived_node_merges
      WHERE enrichment_id = ${header.enrichment_id}
      ORDER BY declared_domain, canonical_label, absorbed_label`;

    const bundleRows = await this.sql<BundleRow[]>`
      SELECT b.derived_node_id, b.generating_model, b.rationale
      FROM enrichment_grounding_bundles b
      JOIN derived_graph_nodes n ON n.derived_node_id = b.derived_node_id
      WHERE n.enrichment_id = ${header.enrichment_id}`;
    const bundleByNode = new Map(bundleRows.map((row) => [row.derived_node_id, row]));
    const passageRows = await this.sql<PassageRow[]>`
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

    const dispositionRows = await this.sql<{ derived_node_id: string; outcome: string }[]>`
      SELECT d.derived_node_id, d.outcome
      FROM artifact_versions a,
      JSON_TABLE(a.payload, '$.groundingDispositions[*]' COLUMNS (
        derived_node_id text PATH '$.derivedNodeId',
        outcome text PATH '$.outcome'
      )) AS d
      WHERE a.artifact_type = 'enrichment_run' AND a.payload->>'enrichmentId' = ${header.enrichment_id}`;
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
      // The banded prior's confidence interface (ADR-0024) off the same difficulty row.
      // Null for a node without a difficulty row or a pre-banding layer (components
      // carry no band) — the floor fails open on null.
      difficultyBand: row.difficulty_band === null ? null : Number(row.difficulty_band),
      difficultyContested: row.difficulty_contested === null ? null : row.difficulty_contested === "1",
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

    return {
      summary: toEnrichmentSummary(header),
      nodes,
      edges,
      originCounts: summarizeOriginCounts(nodes),
      rescueDispositions,
      mintingDispositions,
      merges
    };
  }
}

const enrichmentSummaryColumns = (sql: Sql) => sql`
  g.enrichment_id, g.graph_version_id, g.enrichment_config_hash, g.judge_model, g.difficulty_method,
  g.status, g.started_at, g.completed_at,
  (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id) AS edge_count,
  (SELECT count(*) FROM inferred_prerequisite_edges e WHERE e.enrichment_id = g.enrichment_id AND NOT e.uncertain) AS certain_edge_count,
  (SELECT count(*) FROM concept_difficulties d WHERE d.enrichment_id = g.enrichment_id) AS concept_count,
  (SELECT count(*) FROM study_items si WHERE si.enrichment_id = g.enrichment_id AND si.superseded_at IS NULL) AS study_item_count`;

function toEnrichmentSummary(row: EnrichmentSummaryRow): EnrichmentSummary {
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
    studyItemCount: Number(row.study_item_count),
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
  };
}

function summarizeOriginCounts(nodes: Pick<DerivedGraphNode, "declaredDomain" | "groundingOrigin">[]): DomainOriginCounts[] {
  const byDomain = new Map<string, DomainOriginCounts>();
  for (const node of nodes) {
    const counts = byDomain.get(node.declaredDomain) ?? { domain: node.declaredDomain, anchor: 0, sourceMentioned: 0, llmGrounded: 0 };
    if (node.groundingOrigin === "document_anchored") counts.anchor += 1;
    else if (node.groundingOrigin === "source_mentioned") counts.sourceMentioned += 1;
    else counts.llmGrounded += 1;
    byDomain.set(node.declaredDomain, counts);
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

type EnrichmentSummaryRow = {
  enrichment_id: string;
  // NULL for a synthetic (source-less) layer.
  graph_version_id: string | null;
  enrichment_config_hash: string;
  judge_model: string;
  difficulty_method: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  edge_count: number;
  certain_edge_count: number;
  concept_count: number;
  study_item_count: number;
};

type NodeRow = {
  derived_node_id: string;
  node_kind: string;
  grounding_origin: string;
  role: string;
  label: string;
  aliases: string[];
  declared_domain: string;
  score: number | null;
  neural_rationale: string | null;
  // JSONB `->>` projections of the banded components; null when the row or key is absent.
  difficulty_band: string | null;
  difficulty_contested: string | null;
  has_study_item: boolean;
};

type EdgeRow = {
  prerequisite_derived_node_id: string;
  dependent_derived_node_id: string;
  confidence: number;
  uncertain: boolean;
  judge_model: string;
};

type RescueRow = {
  derived_node_id: string;
  canonical_label: string;
  declared_domain: string;
  disposition: string;
  rationale: string;
  grounding_span: string;
};

type MintingRow = {
  derived_node_id: string;
  proposed_label: string;
  declared_domain: string;
  anchor_concept_id: string;
  disposition: string;
  rationale: string;
};

type MergeRow = {
  declared_domain: string;
  canonical_derived_node_id: string;
  canonical_label: string;
  absorbed_label: string;
  absorbed_aliases: string[];
  proposing_signal: string;
  proposing_score: number;
  rationale: string;
  canonical_selection_reason: string;
};

type BundleRow = {
  derived_node_id: string;
  generating_model: string;
  rationale: string;
};

type PassageRow = {
  derived_node_id: string;
  passage_type: string;
  grounding_origin: string;
  generated_text: string | null;
  evidence_quote: string | null;
  salience_rank: number;
};
