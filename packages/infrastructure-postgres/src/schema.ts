import { boolean, integer, jsonb, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Curated source registration and normalization (ADR-0004, ADR-0015)
// ---------------------------------------------------------------------------

export const sourceResources = pgTable("source_resources", {
  sourceResourceId: uuid("source_resource_id").primaryKey(),
  contentHash: text("content_hash").notNull().unique(),
  contentType: text("content_type").notNull(),
  objectKey: text("object_key").notNull(),
  // Declared Domain is the human-assigned deterministic identity signal (ADR-0015).
  declaredDomain: text("declared_domain").notNull(),
  title: text("title").notNull(),
  sourceUri: text("source_uri"),
  license: text("license"),
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
  blockId: text("block_id").notNull(),
  blockType: text("block_type").notNull(),
  text: text("text").notNull(),
  headingPath: jsonb("heading_path").notNull(),
  locator: jsonb("locator").notNull()
});

// ---------------------------------------------------------------------------
// Closed relation registry (ADR-0016) — models choose, humans extend.
// ---------------------------------------------------------------------------

export const relationDefinitions = pgTable("relation_definitions", {
  relationDefinitionId: uuid("relation_definition_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  predicate: text("predicate").notNull().unique(),
  description: text("description").notNull(),
  // "concept" => concept-to-concept; "literal" => concept-to-literal.
  objectKind: text("object_kind").notNull(),
  constraints: jsonb("constraints").notNull()
});

// ---------------------------------------------------------------------------
// Extraction Runs — per-source, LLM-heavy, run-scoped, never publish (ADR-0017)
// ---------------------------------------------------------------------------

export const extractionRuns = pgTable("extraction_runs", {
  runId: uuid("run_id").primaryKey(),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => sourceDocuments.sourceDocumentId),
  pipelineConfigHash: text("pipeline_config_hash").notNull(),
  status: text("status").notNull(),
  costUsd: real("cost_usd"),
  latencyMs: integer("latency_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const conceptCandidates = pgTable("concept_candidates", {
  conceptCandidateId: uuid("concept_candidate_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  candidateKey: text("candidate_key").notNull(),
  canonicalLabel: text("canonical_label").notNull(),
  normalizedLabel: text("normalized_label").notNull(),
  aliases: jsonb("aliases").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique().on(table.runId, table.candidateKey)]);

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
  // Raw model confidence signal only; no composite score (concept-first plan §1).
  confidence: real("confidence").notNull()
});

// Run-scoped claims reference admitted CANDIDATES, not published concepts.
export const runClaims = pgTable("run_claims", {
  runClaimId: uuid("run_claim_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  subjectCandidateId: uuid("subject_candidate_id").notNull().references(() => conceptCandidates.conceptCandidateId),
  predicate: text("predicate").notNull().references(() => relationDefinitions.predicate),
  // For concept-objects, objectCandidateId is set; for literal-objects, objectLiteral holds value/datatype.
  objectKind: text("object_kind").notNull(),
  objectCandidateId: uuid("object_candidate_id").references(() => conceptCandidates.conceptCandidateId),
  objectLiteral: jsonb("object_literal"),
  // Raw signals (no composite edge-confidence): model confidence, evidence count, validation outcome.
  modelConfidence: real("model_confidence").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  validationOutcome: text("validation_outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const runClaimEvidence = pgTable("run_claim_evidence", {
  runClaimEvidenceId: uuid("run_claim_evidence_id").primaryKey(),
  runClaimId: uuid("run_claim_id").notNull().references(() => runClaims.runClaimId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull()
});

// Missing-concept proposals: claim-extractor escape hatch, inspected in Admin Lab only.
export const missingConceptProposals = pgTable("missing_concept_proposals", {
  missingConceptProposalId: uuid("missing_concept_proposal_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  proposedLabel: text("proposed_label").notNull(),
  rationale: text("rationale").notNull(),
  sourceBlockId: uuid("source_block_id").references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// ---------------------------------------------------------------------------
// Graph-Version Builds — deterministic, LLM-free, atomic (ADR-0010, ADR-0017)
// ---------------------------------------------------------------------------

export const graphVersions = pgTable("graph_versions", {
  graphVersionId: uuid("graph_version_id").primaryKey(),
  status: text("status").notNull(),
  refinementConfigHash: text("refinement_config_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true })
});

// Durable published concepts. IRI minted once at first publication, never re-derived (ADR-0015).
export const concepts = pgTable("concepts", {
  conceptId: uuid("concept_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  canonicalLabel: text("canonical_label").notNull(),
  normalizedLabel: text("normalized_label").notNull(),
  declaredDomain: text("declared_domain").notNull(),
  trustTier: text("trust_tier").notNull(),
  homograph: boolean("homograph").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique().on(table.normalizedLabel, table.declaredDomain)]);

export const conceptAliases = pgTable("concept_aliases", {
  conceptAliasId: uuid("concept_alias_id").primaryKey(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  label: text("label").notNull()
}, (table) => [unique().on(table.conceptId, table.label)]);

export const graphVersionConceptMemberships = pgTable("graph_version_concept_memberships", {
  graphVersionConceptMembershipId: uuid("graph_version_concept_membership_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId)
}, (table) => [unique().on(table.graphVersionId, table.conceptId)]);

export const graphVersionRunMemberships = pgTable("graph_version_run_memberships", {
  graphVersionRunMembershipId: uuid("graph_version_run_membership_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId)
}, (table) => [unique().on(table.graphVersionId, table.runId)]);

export const publishedClaims = pgTable("published_claims", {
  publishedClaimId: uuid("published_claim_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  subjectConceptId: uuid("subject_concept_id").notNull().references(() => concepts.conceptId),
  predicate: text("predicate").notNull().references(() => relationDefinitions.predicate),
  objectKind: text("object_kind").notNull(),
  objectConceptId: uuid("object_concept_id").references(() => concepts.conceptId),
  objectLiteral: jsonb("object_literal"),
  trustTier: text("trust_tier").notNull(),
  modelConfidence: real("model_confidence").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  contradictionState: text("contradiction_state").notNull()
});

export const publishedClaimEvidence = pgTable("published_claim_evidence", {
  publishedClaimEvidenceId: uuid("published_claim_evidence_id").primaryKey(),
  publishedClaimId: uuid("published_claim_id").notNull().references(() => publishedClaims.publishedClaimId),
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

// ---------------------------------------------------------------------------
// Immutable artifact envelopes (ADR-0003)
// ---------------------------------------------------------------------------

export const artifactVersions = pgTable("artifact_versions", {
  artifactId: text("artifact_id").primaryKey(),
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
