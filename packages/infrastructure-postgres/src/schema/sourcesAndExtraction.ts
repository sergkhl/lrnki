import { sql } from "drizzle-orm";
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

export const sourceResources = pgTable(
  "source_resources",
  {
    sourceResourceId: uuid("source_resource_id").primaryKey().notNull(),
    contentHash: text("content_hash").notNull(),
    contentType: text("content_type").notNull(),
    objectKey: text("object_key").notNull(),
    declaredDomain: text("declared_domain").notNull(),
    title: text("title").notNull(),
    sourceUri: text("source_uri"),
    license: text("license"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("source_resources_content_hash_key").on(table.contentHash)],
);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    sourceDocumentId: uuid("source_document_id").primaryKey().notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
    parserName: text("parser_name").notNull(),
    parserVersion: text("parser_version").notNull(),
    parserConfigHash: text("parser_config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "source_documents_source_resource_id_fkey",
    }),
  ],
);

export const sourceBlocks = pgTable(
  "source_blocks",
  {
    sourceBlockId: uuid("source_block_id").primaryKey().notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    blockId: text("block_id").notNull(),
    blockType: text("block_type").notNull(),
    text: text("text").notNull(),
    headingPath: jsonb("heading_path").notNull(),
    locator: jsonb("locator").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceDocumentId],
      foreignColumns: [sourceDocuments.sourceDocumentId],
      name: "source_blocks_source_document_id_fkey",
    }),
  ],
);

export const extractionRuns = pgTable(
  "extraction_runs",
  {
    runId: uuid("run_id").primaryKey().notNull(),
    sourceResourceId: uuid("source_resource_id").notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    pipelineConfigHash: text("pipeline_config_hash").notNull(),
    status: text("status").notNull(),
    degraded: boolean("degraded").default(false).notNull(),
    latencyMs: integer("latency_ms"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceResourceId],
      foreignColumns: [sourceResources.sourceResourceId],
      name: "extraction_runs_source_resource_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceDocumentId],
      foreignColumns: [sourceDocuments.sourceDocumentId],
      name: "extraction_runs_source_document_id_fkey",
    }),
    check(
      "extraction_runs_status_check",
      sql`status IN ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const conceptCandidates = pgTable(
  "concept_candidates",
  {
    conceptCandidateId: uuid("concept_candidate_id").primaryKey().notNull(),
    runId: uuid("run_id").notNull(),
    candidateKey: text("candidate_key").notNull(),
    discoveredLabel: text("discovered_label").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    aliases: jsonb("aliases").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId],
      foreignColumns: [extractionRuns.runId],
      name: "concept_candidates_run_id_fkey",
    }),
    unique("concept_candidates_run_id_candidate_key_key").on(table.runId, table.candidateKey),
  ],
);

export const conceptCandidateMentions = pgTable(
  "concept_candidate_mentions",
  {
    conceptCandidateMentionId: uuid("concept_candidate_mention_id").primaryKey().notNull(),
    conceptCandidateId: uuid("concept_candidate_id").notNull(),
    sourceBlockId: uuid("source_block_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.conceptCandidateId],
      foreignColumns: [conceptCandidates.conceptCandidateId],
      name: "concept_candidate_mentions_concept_candidate_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "concept_candidate_mentions_source_block_id_fkey",
    }),
  ],
);

export const conceptAdmissionDecisions = pgTable(
  "concept_admission_decisions",
  {
    conceptAdmissionDecisionId: uuid("concept_admission_decision_id").primaryKey().notNull(),
    conceptCandidateId: uuid("concept_candidate_id").notNull(),
    modelTier: text("model_tier").notNull(),
    tier: text("tier").notNull(),
    proposedCanonicalLabel: text("proposed_canonical_label").notNull(),
    standaloneLearningObjective: jsonb("standalone_learning_objective").notNull(),
    establishedDomainMeaning: jsonb("established_domain_meaning").notNull(),
    definitionBearingTreatment: jsonb("definition_bearing_treatment").notNull(),
    organizingPower: jsonb("organizing_power").notNull(),
    coreSelected: boolean("core_selected").notNull(),
    selectionReasonCode: text("selection_reason_code").notNull(),
    reasonCodes: jsonb("reason_codes").notNull(),
    boundaryReasonCodes: jsonb("boundary_reason_codes").notNull(),
    confidence: real("confidence").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.conceptCandidateId],
      foreignColumns: [conceptCandidates.conceptCandidateId],
      name: "concept_admission_decisions_concept_candidate_id_fkey",
    }),
    check(
      "concept_admission_decisions_model_tier_check",
      sql`model_tier IN ('core', 'optional', 'reject', 'quarantine')`,
    ),
    check(
      "concept_admission_decisions_tier_check",
      sql`tier IN ('core', 'optional', 'reject', 'quarantine')`,
    ),
    check(
      "concept_admission_decisions_confidence_check",
      sql`confidence >= 0 AND confidence <= 1`,
    ),
  ],
);

export const runConceptEvidenceProfiles = pgTable(
  "run_concept_evidence_profiles",
  {
    runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").primaryKey().notNull(),
    runId: uuid("run_id").notNull(),
    conceptCandidateId: uuid("concept_candidate_id").notNull(),
    tier: text("tier").notNull(),
    complete: boolean("complete").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId],
      foreignColumns: [extractionRuns.runId],
      name: "run_concept_evidence_profiles_run_id_fkey",
    }),
    foreignKey({
      columns: [table.conceptCandidateId],
      foreignColumns: [conceptCandidates.conceptCandidateId],
      name: "run_concept_evidence_profiles_concept_candidate_id_fkey",
    }),
    unique("run_concept_evidence_profiles_run_id_concept_candidate_id_key").on(
      table.runId,
      table.conceptCandidateId,
    ),
    check(
      "run_concept_evidence_profiles_tier_check",
      sql`tier IN ('core', 'optional', 'reject', 'quarantine')`,
    ),
  ],
);

export const runEvidencePassages = pgTable(
  "run_evidence_passages",
  {
    runEvidencePassageId: uuid("run_evidence_passage_id").primaryKey().notNull(),
    runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").notNull(),
    kind: text("kind").notNull(),
    sourceBlockId: uuid("source_block_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    salienceRank: integer("salience_rank").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runConceptEvidenceProfileId],
      foreignColumns: [runConceptEvidenceProfiles.runConceptEvidenceProfileId],
      name: "run_evidence_passages_run_concept_evidence_profile_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "run_evidence_passages_source_block_id_fkey",
    }),
    check("run_evidence_passages_kind_check", sql`kind IN ('definition', 'mention')`),
  ],
);

export const runOptionalAssertions = pgTable(
  "run_optional_assertions",
  {
    runOptionalAssertionId: uuid("run_optional_assertion_id").primaryKey().notNull(),
    runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").notNull(),
    assertionType: text("assertion_type").notNull(),
    literalValue: text("literal_value"),
  },
  (table) => [
    foreignKey({
      columns: [table.runConceptEvidenceProfileId],
      foreignColumns: [runConceptEvidenceProfiles.runConceptEvidenceProfileId],
      name: "run_optional_assertions_run_concept_evidence_profile_id_fkey",
    }),
    check("run_optional_assertions_assertion_type_check", sql`assertion_type IN ('defines')`),
    check(
      "run_optional_assertions_check",
      sql`assertion_type = 'defines' AND literal_value IS NOT NULL`,
    ),
  ],
);

export const runOptionalAssertionEvidence = pgTable(
  "run_optional_assertion_evidence",
  {
    runOptionalAssertionEvidenceId: uuid("run_optional_assertion_evidence_id")
      .primaryKey()
      .notNull(),
    runOptionalAssertionId: uuid("run_optional_assertion_id").notNull(),
    sourceBlockId: uuid("source_block_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runOptionalAssertionId],
      foreignColumns: [runOptionalAssertions.runOptionalAssertionId],
      name: "run_optional_assertion_evidence_run_optional_assertion_id_fkey",
    }),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [sourceBlocks.sourceBlockId],
      name: "run_optional_assertion_evidence_source_block_id_fkey",
    }),
  ],
);
