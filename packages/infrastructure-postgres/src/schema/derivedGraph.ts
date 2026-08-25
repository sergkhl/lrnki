import { sql } from "drizzle-orm";
import type { AbsorbedNodeGrounding } from "@lrnki/domain-core";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { concepts, graphVersions } from "./publishedGraph.js";
import { sourceBlocks, sourceResources } from "./sourcesAndExtraction.js";

export const graphEnrichments = pgTable(
  "graph_enrichments",
  {
    enrichmentId: uuid("enrichment_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id"),
    enrichmentConfigHash: text("enrichment_config_hash").notNull(),
    status: text("status").notNull(),
    judgeModel: text("judge_model").notNull(),
    difficultyMethod: text("difficulty_method").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "graph_enrichments_graph_version_id_fkey",
    }),
    check("graph_enrichments_status_check", sql`status IN ('running', 'succeeded', 'failed')`),
  ],
);

export const derivedGraphNodes = pgTable(
  "derived_graph_nodes",
  {
    derivedNodeId: uuid("derived_node_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    nodeKind: text("node_kind").notNull(),
    conceptId: uuid("concept_id"),
    groundingOrigin: text("grounding_origin").notNull(),
    role: text("role").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    aliases: jsonb("aliases").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "derived_graph_nodes_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.conceptId],
      foreignColumns: [concepts.conceptId],
      name: "derived_graph_nodes_concept_id_fkey",
    }),
    unique("derived_graph_nodes_enrichment_id_concept_id_key").on(
      table.enrichmentId,
      table.conceptId,
    ),
    check("derived_graph_nodes_node_kind_check", sql`node_kind IN ('anchor', 'enrichment')`),
    check(
      "derived_graph_nodes_grounding_origin_check",
      sql`grounding_origin IN ('document_anchored', 'source_mentioned', 'llm_grounded')`,
    ),
    check(
      "derived_graph_nodes_role_check",
      sql`role IN ('anchor', 'prerequisite', 'synthetic_primary')`,
    ),
    check(
      "derived_graph_nodes_check",
      sql`(
        node_kind = 'anchor'
        AND concept_id IS NOT NULL
        AND grounding_origin = 'document_anchored'
        AND role = 'anchor'
      ) OR (
        node_kind = 'enrichment'
        AND concept_id IS NULL
        AND grounding_origin IN ('source_mentioned', 'llm_grounded')
        AND role IN ('prerequisite', 'synthetic_primary')
      )`,
    ),
  ],
);

export const enrichmentGroundingBundles = pgTable(
  "enrichment_grounding_bundles",
  {
    enrichmentGroundingBundleId: uuid("enrichment_grounding_bundle_id").primaryKey().notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    groundingOrigin: text("grounding_origin").notNull(),
    generatingModel: text("generating_model").notNull(),
    rationale: text("rationale").notNull(),
    bundle: jsonb("bundle").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "enrichment_grounding_bundles_derived_node_id_fkey",
    }),
    unique("enrichment_grounding_bundles_derived_node_id_key").on(table.derivedNodeId),
    check(
      "enrichment_grounding_bundles_grounding_origin_check",
      sql`grounding_origin IN ('llm_grounded')`,
    ),
  ],
);

export const enrichmentGroundingPassages = pgTable(
  "enrichment_grounding_passages",
  {
    enrichmentGroundingPassageId: uuid("enrichment_grounding_passage_id")
      .primaryKey()
      .notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    passageType: text("passage_type").notNull(),
    groundingOrigin: text("grounding_origin").notNull(),
    sourceResourceId: uuid("source_resource_id"),
    sourceBlockId: uuid("source_block_id"),
    evidenceQuote: text("evidence_quote"),
    generatedText: text("generated_text"),
    headingPath: jsonb("heading_path").notNull(),
    locator: jsonb("locator").notNull(),
    verbatimCheck: jsonb("verbatim_check").notNull(),
    salienceRank: integer("salience_rank").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "enrichment_grounding_passages_derived_node_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "enrichment_grounding_passages_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "enrichment_grounding_passages_source_block_id_fkey",
    }),
    check(
      "enrichment_grounding_passages_passage_type_check",
      sql`passage_type IN ('definition', 'mention')`,
    ),
    check(
      "enrichment_grounding_passages_grounding_origin_check",
      sql`grounding_origin IN ('source_mentioned', 'llm_grounded')`,
    ),
    check(
      "enrichment_grounding_passages_check",
      sql`(
        grounding_origin = 'source_mentioned'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND generated_text IS NULL
      ) OR (
        grounding_origin = 'llm_grounded'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND generated_text IS NOT NULL
      )`,
    ),
  ],
);

export const inferredPrerequisiteEdges = pgTable(
  "inferred_prerequisite_edges",
  {
    inferredPrerequisiteEdgeId: uuid("inferred_prerequisite_edge_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    predicate: text("predicate").default("inferred-prerequisite-of").notNull(),
    prerequisiteDerivedNodeId: uuid("prerequisite_derived_node_id").notNull(),
    dependentDerivedNodeId: uuid("dependent_derived_node_id").notNull(),
    confidence: real("confidence").notNull(),
    uncertain: boolean("uncertain").default(false).notNull(),
    judgeModel: text("judge_model").notNull(),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "inferred_prerequisite_edges_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.prerequisiteDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "inferred_prerequisite_edges_prerequisite_derived_node_id_fkey",
    }),
    foreignKey({
      columns: [table.dependentDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "inferred_prerequisite_edges_dependent_derived_node_id_fkey",
    }),
    unique("inferred_prerequisite_edges_enrichment_id_prerequisite_deri_key").on(
      table.enrichmentId,
      table.prerequisiteDerivedNodeId,
      table.dependentDerivedNodeId,
    ),
    check(
      "inferred_prerequisite_edges_confidence_check",
      sql`confidence >= 0 AND confidence <= 1`,
    ),
    check(
      "inferred_prerequisite_edges_check",
      sql`prerequisite_derived_node_id <> dependent_derived_node_id`,
    ),
  ],
);

export const conceptDifficulties = pgTable(
  "concept_difficulties",
  {
    conceptDifficultyId: uuid("concept_difficulty_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    score: real("score").notNull(),
    method: text("method").notNull(),
    components: jsonb("components").notNull(),
    neuralRationale: text("neural_rationale").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "concept_difficulties_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "concept_difficulties_derived_node_id_fkey",
    }),
    unique("concept_difficulties_enrichment_id_derived_node_id_key").on(
      table.enrichmentId,
      table.derivedNodeId,
    ),
  ],
);

export const rescueDispositions = pgTable(
  "rescue_dispositions",
  {
    rescueDispositionId: uuid("rescue_disposition_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    disposition: text("disposition").notNull(),
    rationale: text("rationale").notNull(),
    groundingSpan: text("grounding_span").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "rescue_dispositions_enrichment_id_fkey",
    }),
    check(
      "rescue_dispositions_disposition_check",
      sql`disposition IN ('accepted', 'dropped', 'kept_judge_unavailable')`,
    ),
  ],
);

export const mintingDispositions = pgTable(
  "minting_dispositions",
  {
    mintingDispositionId: uuid("minting_disposition_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    proposedLabel: text("proposed_label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    anchorConceptId: uuid("anchor_concept_id").notNull(),
    disposition: text("disposition").notNull(),
    rationale: text("rationale").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "minting_dispositions_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.anchorConceptId],
      foreignColumns: [concepts.conceptId],
      name: "minting_dispositions_anchor_concept_id_fkey",
    }),
    check(
      "minting_dispositions_disposition_check",
      sql`disposition IN ('accepted', 'dropped', 'kept_judge_unavailable')`,
    ),
  ],
);

export const derivedNodeMerges = pgTable(
  "derived_node_merges",
  {
    derivedNodeMergeId: uuid("derived_node_merge_id").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    canonicalDerivedNodeId: uuid("canonical_derived_node_id").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    canonicalNodeKind: text("canonical_node_kind").notNull(),
    absorbedDerivedNodeId: uuid("absorbed_derived_node_id").notNull(),
    absorbedLabel: text("absorbed_label").notNull(),
    absorbedAliases: jsonb("absorbed_aliases").notNull(),
    absorbedNodeKind: text("absorbed_node_kind").notNull(),
    // The physical column predates typed grounding retention. Its current code-owned
    // JSON shape is AbsorbedNodeGrounding; keep the column name so this behavior fix
    // does not create an unrelated reset-only schema rename.
    absorbedGrounding: jsonb("absorbed_evidence").$type<AbsorbedNodeGrounding>().notNull(),
    proposingSignal: text("proposing_signal").notNull(),
    proposingScore: real("proposing_score").notNull(),
    rationale: text("rationale").notNull(),
    canonicalSelectionReason: text("canonical_selection_reason").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "derived_node_merges_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.canonicalDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "derived_node_merges_canonical_derived_node_id_fkey",
    }),
    check(
      "derived_node_merges_canonical_node_kind_check",
      sql`canonical_node_kind IN ('anchor', 'enrichment')`,
    ),
    check(
      "derived_node_merges_absorbed_node_kind_check",
      sql`absorbed_node_kind IN ('anchor', 'enrichment')`,
    ),
    check(
      "derived_node_merges_proposing_signal_check",
      sql`proposing_signal IN ('embedding_cosine')`,
    ),
    check(
      "derived_node_merges_canonical_selection_reason_check",
      sql`canonical_selection_reason IN (
        'anchor_over_enrichment',
        'higher_evidence_count',
        'stable_id_tiebreak'
      )`,
    ),
    check(
      "derived_node_merges_check",
      sql`canonical_derived_node_id <> absorbed_derived_node_id`,
    ),
  ],
);
