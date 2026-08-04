import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  extractionRuns,
  sourceBlocks,
  sourceResources,
} from "./sourcesAndExtraction.js";

export const graphVersions = pgTable(
  "graph_versions",
  {
    graphVersionId: uuid("graph_version_id").primaryKey().notNull(),
    baseGraphVersionId: uuid("base_graph_version_id"),
    status: text("status").notNull(),
    refinementConfigHash: text("refinement_config_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.baseGraphVersionId],
      foreignColumns: [table.graphVersionId],
      name: "graph_versions_base_graph_version_id_fkey",
    }),
    check("graph_versions_status_check", sql`status IN ('building', 'published', 'failed')`),
  ],
);

export const concepts = pgTable(
  "concepts",
  {
    conceptId: uuid("concept_id").primaryKey().notNull(),
    iri: text("iri").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("concepts_iri_key").on(table.iri),
    unique("concepts_normalized_label_declared_domain_key").on(
      table.normalizedLabel,
      table.declaredDomain,
    ),
  ],
);

export const graphVersionConcepts = pgTable(
  "graph_version_concepts",
  {
    graphVersionConceptId: uuid("graph_version_concept_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    trustTier: text("trust_tier").notNull(),
    homograph: boolean("homograph").default(false).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "graph_version_concepts_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.conceptId],
      foreignColumns: [concepts.conceptId],
      name: "graph_version_concepts_concept_id_fkey",
    }),
    unique("graph_version_concepts_graph_version_id_concept_id_key").on(
      table.graphVersionId,
      table.conceptId,
    ),
  ],
);

export const graphVersionConceptAliases = pgTable(
  "graph_version_concept_aliases",
  {
    graphVersionConceptAliasId: uuid("graph_version_concept_alias_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "graph_version_concept_aliases_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.conceptId],
      foreignColumns: [concepts.conceptId],
      name: "graph_version_concept_aliases_concept_id_fkey",
    }),
    unique("graph_version_concept_aliases_graph_version_id_concept_id_l_key").on(
      table.graphVersionId,
      table.conceptId,
      table.label,
    ),
  ],
);

export const graphVersionRunMemberships = pgTable(
  "graph_version_run_memberships",
  {
    graphVersionRunMembershipId: uuid("graph_version_run_membership_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id").notNull(),
    runId: uuid("run_id").notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "graph_version_run_memberships_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.runId],
      foreignColumns: [extractionRuns.runId],
      name: "graph_version_run_memberships_run_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "graph_version_run_memberships_source_resource_id_fkey",
    }),
    unique("graph_version_run_memberships_graph_version_id_run_id_key").on(
      table.graphVersionId,
      table.runId,
    ),
  ],
);

export const graphVersionConceptEvidenceProfiles = pgTable(
  "graph_version_concept_evidence_profiles",
  {
    graphVersionConceptEvidenceProfileId: uuid("graph_version_concept_evidence_profile_id")
      .primaryKey()
      .notNull(),
    graphVersionId: uuid("graph_version_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "graph_version_concept_evidence_profiles_graph_version_id_fkey",
    }),
    foreignKey({
      columns: [table.conceptId],
      foreignColumns: [concepts.conceptId],
      name: "graph_version_concept_evidence_profiles_concept_id_fkey",
    }),
    unique("graph_version_concept_evidence__graph_version_id_concept_id_key").on(
      table.graphVersionId,
      table.conceptId,
    ),
  ],
);

export const graphVersionEvidencePassages = pgTable(
  "graph_version_evidence_passages",
  {
    graphVersionEvidencePassageId: uuid("graph_version_evidence_passage_id")
      .primaryKey()
      .notNull(),
    graphVersionConceptEvidenceProfileId: uuid(
      "graph_version_concept_evidence_profile_id",
    ).notNull(),
    kind: text("kind").notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
    sourceBlockId: uuid("source_block_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    headingPath: jsonb("heading_path").notNull(),
    locator: jsonb("locator").notNull(),
    salienceRank: integer("salience_rank").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionConceptEvidenceProfileId],
      foreignColumns: [
        graphVersionConceptEvidenceProfiles.graphVersionConceptEvidenceProfileId,
      ],
      name: "graph_version_evidence_passag_graph_version_concept_eviden_fkey",
    }),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "graph_version_evidence_passages_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "graph_version_evidence_passages_source_block_id_fkey",
    }),
    check(
      "graph_version_evidence_passages_kind_check",
      sql`kind IN ('definition', 'mention')`,
    ),
  ],
);

export const graphVersionOptionalAssertions = pgTable(
  "graph_version_optional_assertions",
  {
    graphVersionOptionalAssertionId: uuid("graph_version_optional_assertion_id")
      .primaryKey()
      .notNull(),
    graphVersionConceptEvidenceProfileId: uuid(
      "graph_version_concept_evidence_profile_id",
    ).notNull(),
    assertionType: text("assertion_type").notNull(),
    literalValue: text("literal_value"),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionConceptEvidenceProfileId],
      foreignColumns: [
        graphVersionConceptEvidenceProfiles.graphVersionConceptEvidenceProfileId,
      ],
      name: "graph_version_optional_assert_graph_version_concept_eviden_fkey",
    }),
    check(
      "graph_version_optional_assertions_assertion_type_check",
      sql`assertion_type IN ('defines')`,
    ),
    check(
      "graph_version_optional_assertions_check",
      sql`assertion_type = 'defines' AND literal_value IS NOT NULL`,
    ),
  ],
);

export const graphVersionOptionalAssertionEvidence = pgTable(
  "graph_version_optional_assertion_evidence",
  {
    graphVersionOptionalAssertionEvidenceId: uuid(
      "graph_version_optional_assertion_evidence_id",
    )
      .primaryKey()
      .notNull(),
    graphVersionOptionalAssertionId: uuid("graph_version_optional_assertion_id").notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
    sourceBlockId: uuid("source_block_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    headingPath: jsonb("heading_path").notNull(),
    locator: jsonb("locator").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionOptionalAssertionId],
      foreignColumns: [graphVersionOptionalAssertions.graphVersionOptionalAssertionId],
      name: "graph_version_optional_assert_graph_version_optional_asser_fkey",
    }),
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "graph_version_optional_assertion_eviden_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "graph_version_optional_assertion_evidence_source_block_id_fkey",
    }),
  ],
);

export const refinementDecisions = pgTable(
  "refinement_decisions",
  {
    refinementDecisionId: uuid("refinement_decision_id").primaryKey().notNull(),
    graphVersionId: uuid("graph_version_id").notNull(),
    decisionType: text("decision_type").notNull(),
    subject: jsonb("subject").notNull(),
    outcome: text("outcome").notNull(),
    rationale: text("rationale").notNull(),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "refinement_decisions_graph_version_id_fkey",
    }),
  ],
);

export const artifactVersions = pgTable(
  "artifact_versions",
  {
    artifactId: text("artifact_id").primaryKey().notNull(),
    artifactType: text("artifact_type").notNull(),
    runId: uuid("run_id"),
    graphVersionId: uuid("graph_version_id"),
    producer: text("producer").notNull(),
    producerVersion: text("producer_version").notNull(),
    configHash: text("config_hash").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId],
      foreignColumns: [extractionRuns.runId],
      name: "artifact_versions_run_id_fkey",
    }),
    foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.graphVersionId],
      name: "artifact_versions_graph_version_id_fkey",
    }),
  ],
);
