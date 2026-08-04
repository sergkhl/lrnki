import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { derivedGraphNodes, graphEnrichments } from "./derivedGraph.js";
import { graphVersions } from "./publishedGraph.js";
import { sourceBlocks, sourceResources } from "./sourcesAndExtraction.js";

export const studyItems = pgTable(
  "study_items",
  {
    studyItemId: uuid("study_item_id").primaryKey().notNull(),
    itemType: text("item_type").notNull(),
    graphVersionId: uuid("graph_version_id"),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    groundingProvenance: text("grounding_provenance").notNull(),
    question: text("question").notNull(),
    explanation: text("explanation"),
    facet: text("facet"),
    explorableTerms: jsonb("explorable_terms").default([]).notNull(),
    generatingModel: text("generating_model").notNull(),
    configHash: text("config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "study_items_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "study_items_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "study_items_derived_node_id_fkey",
    }),
    unique("study_items_study_item_id_item_type_derived_node_id_key").on(
      table.studyItemId,
      table.itemType,
      table.derivedNodeId,
    ),
    uniqueIndex("study_items_one_current_per_node_type")
      .on(table.derivedNodeId, table.itemType)
      .where(sql`superseded_at IS NULL`),
    index("study_items_enrichment_current_idx")
      .on(table.enrichmentId)
      .where(sql`superseded_at IS NULL`),
    check(
      "study_items_item_type_check",
      sql`item_type IN ('option_select', 'matching', 'impostor')`,
    ),
    check(
      "study_items_grounding_provenance_check",
      sql`grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')`,
    ),
  ],
);

export const studyItemOptions = pgTable(
  "study_item_options",
  {
    optionId: uuid("option_id").primaryKey().notNull(),
    studyItemId: uuid("study_item_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    optionText: text("option_text").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    provenance: text("provenance").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "study_item_options_study_item_id_fkey",
    }).onDelete("cascade"),
    unique("study_item_options_study_item_id_ordinal_key").on(
      table.studyItemId,
      table.ordinal,
    ),
    uniqueIndex("study_item_options_one_correct_per_item")
      .on(table.studyItemId)
      .where(sql`is_correct`),
    check("study_item_options_ordinal_check", sql`ordinal BETWEEN 0 AND 3`),
    check(
      "study_item_options_provenance_check",
      sql`provenance IN ('source', 'generated')`,
    ),
  ],
);

export const matchingPairs = pgTable(
  "matching_pairs",
  {
    matchingPairId: uuid("matching_pair_id").primaryKey().notNull(),
    matchTileId: uuid("match_tile_id").notNull(),
    studyItemId: uuid("study_item_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    promptText: text("prompt_text").notNull(),
    matchText: text("match_text").notNull(),
    provenance: text("provenance").notNull(),
    sourceResourceId: uuid("source_resource_id"),
    sourceBlockId: uuid("source_block_id"),
    evidenceQuote: text("evidence_quote"),
    matchKind: text("match_kind"),
    derivedNodeId: uuid("derived_node_id"),
    generatedPassageText: text("generated_passage_text"),
  },
  (table) => [
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "matching_pairs_study_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "matching_pairs_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "matching_pairs_source_block_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "matching_pairs_derived_node_id_fkey",
    }),
    unique("matching_pairs_match_tile_id_key").on(table.matchTileId),
    unique("matching_pairs_study_item_id_ordinal_key").on(table.studyItemId, table.ordinal),
    unique("matching_pairs_study_item_id_prompt_text_key").on(
      table.studyItemId,
      table.promptText,
    ),
    unique("matching_pairs_study_item_id_match_text_key").on(
      table.studyItemId,
      table.matchText,
    ),
    unique("matching_pairs_study_item_id_match_tile_id_key").on(
      table.studyItemId,
      table.matchTileId,
    ),
    check("matching_pairs_ordinal_check", sql`ordinal BETWEEN 0 AND 3`),
    check("matching_pairs_provenance_check", sql`provenance IN ('source', 'generated')`),
    check("matching_pairs_match_kind_check", sql`match_kind IN ('exact', 'normalized')`),
    check(
      "matching_pairs_check",
      sql`btrim(prompt_text) <> ''
        AND btrim(match_text) <> ''
        AND lower(btrim(prompt_text)) <> lower(btrim(match_text))`,
    ),
    check(
      "matching_pairs_check1",
      sql`(
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      )`,
    ),
  ],
);

export const studyItemCitations = pgTable(
  "study_item_citations",
  {
    studyItemCitationId: uuid("study_item_citation_id").primaryKey().notNull(),
    studyItemId: uuid("study_item_id").notNull(),
    provenance: text("provenance").notNull(),
    sourceResourceId: uuid("source_resource_id"),
    sourceBlockId: uuid("source_block_id"),
    evidenceQuote: text("evidence_quote"),
    matchKind: text("match_kind"),
    derivedNodeId: uuid("derived_node_id"),
    generatedPassageText: text("generated_passage_text"),
  },
  (table) => [
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "study_item_citations_study_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "study_item_citations_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "study_item_citations_source_block_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "study_item_citations_derived_node_id_fkey",
    }),
    check("study_item_citations_provenance_check", sql`provenance IN ('source', 'generated')`),
    check("study_item_citations_match_kind_check", sql`match_kind IN ('exact', 'normalized')`),
    check(
      "study_item_citations_check",
      sql`(
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      )`,
    ),
  ],
);

export const impostorStatements = pgTable(
  "impostor_statements",
  {
    impostorStatementId: uuid("impostor_statement_id").primaryKey().notNull(),
    studyItemId: uuid("study_item_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    statementText: text("statement_text").notNull(),
    isImpostor: boolean("is_impostor").notNull(),
    provenance: text("provenance").notNull(),
    sourceResourceId: uuid("source_resource_id"),
    sourceBlockId: uuid("source_block_id"),
    evidenceQuote: text("evidence_quote"),
    matchKind: text("match_kind"),
    derivedNodeId: uuid("derived_node_id"),
    generatedPassageText: text("generated_passage_text"),
    revealText: text("reveal_text"),
    lieSource: text("lie_source"),
    siblingLabel: text("sibling_label"),
  },
  (table) => [
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "impostor_statements_study_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "impostor_statements_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "impostor_statements_source_block_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "impostor_statements_derived_node_id_fkey",
    }),
    unique("impostor_statements_study_item_id_ordinal_key").on(
      table.studyItemId,
      table.ordinal,
    ),
    uniqueIndex("impostor_statements_one_impostor_per_item")
      .on(table.studyItemId)
      .where(sql`is_impostor`),
    check("impostor_statements_ordinal_check", sql`ordinal BETWEEN 0 AND 3`),
    check("impostor_statements_provenance_check", sql`provenance IN ('source', 'generated')`),
    check("impostor_statements_match_kind_check", sql`match_kind IN ('exact', 'normalized')`),
    check("impostor_statements_lie_source_check", sql`lie_source IN ('sibling', 'generated')`),
    check(
      "impostor_statements_check",
      sql`(
        is_impostor = false
        AND provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
        AND reveal_text IS NULL
        AND lie_source IS NULL
        AND sibling_label IS NULL
      ) OR (
        is_impostor = false
        AND provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
        AND reveal_text IS NULL
        AND lie_source IS NULL
        AND sibling_label IS NULL
      ) OR (
        is_impostor = true
        AND provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
        AND reveal_text IS NOT NULL
        AND lie_source IS NOT NULL
        AND (sibling_label IS NOT NULL) = (lie_source = 'sibling')
      )`,
    ),
  ],
);

export const rejectedStudyItems = pgTable(
  "rejected_study_items",
  {
    rejectedStudyItemId: uuid("rejected_study_item_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id"),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    itemType: text("item_type").notNull(),
    reason: text("reason").notNull(),
    configHash: text("config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "rejected_study_items_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "rejected_study_items_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "rejected_study_items_derived_node_id_fkey",
    }),
    unique("rejected_study_items_derived_node_id_item_type_key").on(
      table.derivedNodeId,
      table.itemType,
    ),
    check(
      "rejected_study_items_item_type_check",
      sql`item_type IN ('option_select', 'matching', 'impostor')`,
    ),
  ],
);

export const enrichmentLayerPurposes = pgTable(
  "enrichment_layer_purposes",
  {
    enrichmentId: uuid("enrichment_id").primaryKey().notNull(),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "enrichment_layer_purposes_enrichment_id_fkey",
    }),
  ],
);

export const conceptLessons = pgTable(
  "concept_lessons",
  {
    conceptLessonId: uuid("concept_lesson_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id"),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    explorableTerms: jsonb("explorable_terms").default([]).notNull(),
    generatingModel: text("generating_model").notNull(),
    configHash: text("config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "concept_lessons_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "concept_lessons_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "concept_lessons_derived_node_id_fkey",
    }),
    unique("concept_lessons_concept_lesson_id_derived_node_id_key").on(
      table.conceptLessonId,
      table.derivedNodeId,
    ),
    uniqueIndex("concept_lessons_one_current_per_node")
      .on(table.derivedNodeId)
      .where(sql`superseded_at IS NULL`),
    index("concept_lessons_enrichment_current_idx")
      .on(table.enrichmentId)
      .where(sql`superseded_at IS NULL`),
  ],
);

export const conceptLessonSections = pgTable(
  "concept_lesson_sections",
  {
    conceptLessonSectionId: uuid("concept_lesson_section_id").primaryKey().notNull(),
    conceptLessonId: uuid("concept_lesson_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    kind: text("kind").notNull(),
    bodyText: text("body_text").notNull(),
    items: text("items").array(),
    groundingProvenance: text("grounding_provenance").notNull(),
    diagramCaption: text("diagram_caption"),
    diagramSpec: text("diagram_spec"),
  },
  (table) => [
    foreignKey({
      columns: [table.conceptLessonId],
      foreignColumns: [conceptLessons.conceptLessonId],
      name: "concept_lesson_sections_concept_lesson_id_fkey",
    }).onDelete("cascade"),
    unique("concept_lesson_sections_concept_lesson_id_ordinal_key").on(
      table.conceptLessonId,
      table.ordinal,
    ),
    check("concept_lesson_sections_ordinal_check", sql`ordinal >= 0`),
    check(
      "concept_lesson_sections_kind_check",
      sql`kind IN ('gist', 'intuition', 'definition', 'examples', 'applications', 'formulas')`,
    ),
    check(
      "concept_lesson_sections_grounding_provenance_check",
      sql`grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')`,
    ),
    check(
      "concept_lesson_sections_check",
      sql`(diagram_caption IS NULL AND diagram_spec IS NULL)
        OR (diagram_caption IS NOT NULL AND diagram_spec IS NOT NULL)`,
    ),
  ],
);

export const conceptLessonSectionCitations = pgTable(
  "concept_lesson_section_citations",
  {
    conceptLessonSectionCitationId: uuid("concept_lesson_section_citation_id")
      .primaryKey()
      .notNull(),
    conceptLessonSectionId: uuid("concept_lesson_section_id").notNull(),
    provenance: text("provenance").notNull(),
    sourceResourceId: uuid("source_resource_id"),
    sourceBlockId: uuid("source_block_id"),
    evidenceQuote: text("evidence_quote"),
    matchKind: text("match_kind"),
    derivedNodeId: uuid("derived_node_id"),
    generatedPassageText: text("generated_passage_text"),
  },
  (table) => [
    foreignKey({
      columns: [table.conceptLessonSectionId],
      foreignColumns: [conceptLessonSections.conceptLessonSectionId],
      name: "concept_lesson_section_citations_concept_lesson_section_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "concept_lesson_section_citations_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "concept_lesson_section_citations_source_block_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "concept_lesson_section_citations_derived_node_id_fkey",
    }),
    unique("concept_lesson_section_citations_concept_lesson_section_id_key").on(
      table.conceptLessonSectionId,
    ),
    check(
      "concept_lesson_section_citations_provenance_check",
      sql`provenance IN ('source', 'generated')`,
    ),
    check(
      "concept_lesson_section_citations_match_kind_check",
      sql`match_kind IN ('exact', 'normalized')`,
    ),
    check(
      "concept_lesson_section_citations_check",
      sql`(
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      )`,
    ),
  ],
);

export const lessonAbsentNodes = pgTable(
  "lesson_absent_nodes",
  {
    lessonAbsentNodeId: uuid("lesson_absent_node_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id"),
    enrichmentId: uuid("enrichment_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    reason: text("reason").notNull(),
    configHash: text("config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "lesson_absent_nodes_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "lesson_absent_nodes_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "lesson_absent_nodes_derived_node_id_fkey",
    }),
    unique("lesson_absent_nodes_derived_node_id_key").on(table.derivedNodeId),
  ],
);
