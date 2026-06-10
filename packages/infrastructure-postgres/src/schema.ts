import { boolean, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const sourceResources = pgTable("source_resources", {
  sourceResourceId: uuid("source_resource_id").primaryKey(),
  contentHash: text("content_hash").notNull().unique(),
  contentType: text("content_type").notNull(),
  objectKey: text("object_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const sourceDocuments = pgTable("source_documents", {
  sourceDocumentId: uuid("source_document_id").primaryKey(),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId),
  parserName: text("parser_name").notNull(),
  parserVersion: text("parser_version").notNull(),
  parserConfigHash: text("parser_config_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const sourceBlocks = pgTable("source_blocks", {
  sourceBlockId: uuid("source_block_id").primaryKey(),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => sourceDocuments.sourceDocumentId),
  blockType: text("block_type").notNull(),
  text: text("text").notNull(),
  headingPath: jsonb("heading_path").notNull(),
  locator: jsonb("locator").notNull()
});

export const extractionRuns = pgTable("extraction_runs", {
  runId: uuid("run_id").primaryKey(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const graphVersions = pgTable("graph_versions", {
  graphVersionId: uuid("graph_version_id").primaryKey(),
  status: text("status").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true })
});

export const conceptCandidates = pgTable("concept_candidates", {
  conceptCandidateId: uuid("concept_candidate_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  canonicalLabel: text("canonical_label").notNull(),
  aliases: jsonb("aliases").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const conceptCandidateMentions = pgTable("concept_candidate_mentions", {
  conceptCandidateMentionId: uuid("concept_candidate_mention_id").primaryKey(),
  conceptCandidateId: uuid("concept_candidate_id").notNull().references(() => conceptCandidates.conceptCandidateId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull()
});

export const conceptAdmissionDecisions = pgTable("concept_admission_decisions", {
  conceptAdmissionDecisionId: uuid("concept_admission_decision_id").primaryKey(),
  conceptCandidateId: uuid("concept_candidate_id").notNull().references(() => conceptCandidates.conceptCandidateId),
  tier: text("tier").notNull(),
  independentlyMeaningful: boolean("independently_meaningful").notNull(),
  independentlyTeachable: boolean("independently_teachable").notNull(),
  durableBeyondSource: boolean("durable_beyond_source").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  confidence: real("confidence").notNull()
});

export const concepts = pgTable("concepts", {
  conceptId: uuid("concept_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  canonicalLabel: text("canonical_label").notNull(),
  trustTier: text("trust_tier").notNull()
});

export const graphVersionMemberships = pgTable("graph_version_memberships", {
  graphVersionMembershipId: uuid("graph_version_membership_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId)
});

export const conceptAliases = pgTable("concept_aliases", {
  conceptAliasId: uuid("concept_alias_id").primaryKey(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  label: text("label").notNull(),
  accepted: boolean("accepted").default(false).notNull()
});

export const relationDefinitions = pgTable("relation_definitions", {
  relationDefinitionId: uuid("relation_definition_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  predicate: text("predicate").notNull().unique(),
  description: text("description").notNull(),
  constraints: jsonb("constraints").notNull()
});

export const conceptClaims = pgTable("concept_claims", {
  claimId: uuid("claim_id").primaryKey(),
  subjectConceptId: uuid("subject_concept_id").notNull().references(() => concepts.conceptId),
  predicate: text("predicate").notNull(),
  object: jsonb("object").notNull(),
  scope: text("scope").notNull(),
  confidence: real("confidence").notNull(),
  contradictionState: text("contradiction_state").notNull()
});

export const claimEvidence = pgTable("claim_evidence", {
  claimEvidenceId: uuid("claim_evidence_id").primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => conceptClaims.claimId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull()
});

export const refinementDecisions = pgTable("refinement_decisions", {
  refinementDecisionId: uuid("refinement_decision_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  decisionType: text("decision_type").notNull(),
  subject: jsonb("subject").notNull(),
  outcome: text("outcome").notNull(),
  rationale: text("rationale").notNull(),
  provenance: jsonb("provenance").notNull()
});

export const ontologyTerms = pgTable("ontology_terms", {
  ontologyTermId: uuid("ontology_term_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  termType: text("term_type").notNull(),
  label: text("label").notNull(),
  metadata: jsonb("metadata").notNull()
});

export const externalOntologyMappings = pgTable("external_ontology_mappings", {
  externalOntologyMappingId: uuid("external_ontology_mapping_id").primaryKey(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  externalIri: text("external_iri").notNull(),
  mappingType: text("mapping_type").notNull(),
  confidence: real("confidence").notNull(),
  provenance: jsonb("provenance").notNull()
});

export const artifactVersions = pgTable("artifact_versions", {
  artifactId: uuid("artifact_id").primaryKey(),
  artifactType: text("artifact_type").notNull(),
  schemaVersion: text("schema_version").notNull(),
  runId: uuid("run_id").references(() => extractionRuns.runId),
  graphVersionId: uuid("graph_version_id").references(() => graphVersions.graphVersionId),
  producer: text("producer").notNull(),
  producerVersion: text("producer_version").notNull(),
  configHash: text("config_hash").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
