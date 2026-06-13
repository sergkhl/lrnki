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
  discoveredLabel: text("discovered_label").notNull(),
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
  modelTier: text("model_tier").notNull(),
  tier: text("tier").notNull(),
  proposedCanonicalLabel: text("proposed_canonical_label").notNull(),
  standaloneLearningObjective: jsonb("standalone_learning_objective").notNull(),
  establishedDomainMeaning: jsonb("established_domain_meaning").notNull(),
  organizingPower: jsonb("organizing_power").notNull(),
  coreSelected: boolean("core_selected").notNull(),
  selectionReasonCode: text("selection_reason_code").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  boundaryReasonCodes: jsonb("boundary_reason_codes").notNull(),
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
  boundaryReasonCodes: jsonb("boundary_reason_codes").notNull(),
  extractionAttempt: integer("extraction_attempt").notNull(),
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
  extractionAttempt: integer("extraction_attempt").notNull(),
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

// ---------------------------------------------------------------------------
// Graph Enrichment — third operation, derived layer keyed to a published
// version (ADR-0019). LLM-proposed, symbolically constrained; never mutates the
// asserted core. Normalized rows below are the query/traversal surface; the
// immutable replay copy is an `artifact_versions` envelope (artifact_type
// 'graph-enrichment', graph_version_id set). Inferred relations live in their
// OWN namespace and intentionally do NOT reference relation_definitions, whose
// closed asserted registry (ADR-0016) the published_claims FK enforces.
// ---------------------------------------------------------------------------

export const graphEnrichments = pgTable("graph_enrichments", {
  enrichmentId: uuid("enrichment_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  // Replay identity: same (version + config) re-derives the same layer (ADR-0019).
  enrichmentConfigHash: text("enrichment_config_hash").notNull(),
  status: text("status").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  judgeModel: text("judge_model").notNull(),
  difficultyMethod: text("difficulty_method").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, (table) => [unique().on(table.graphVersionId, table.enrichmentConfigHash)]);

// Contextual-embedding cluster membership — provenance for how prerequisite pairs
// were gated (ADR-0012 tier 2). Inspection/audit only; never an edge authority.
export const enrichmentConceptClusters = pgTable("enrichment_concept_clusters", {
  enrichmentConceptClusterId: uuid("enrichment_concept_cluster_id").primaryKey(),
  enrichmentId: uuid("enrichment_id").notNull().references(() => graphEnrichments.enrichmentId),
  clusterId: text("cluster_id").notNull(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId)
}, (table) => [unique().on(table.enrichmentId, table.conceptId)]);

// The inferred prerequisite DAG: prerequisite must precede dependent. Survives
// only after deterministic cycle removal + transitive reduction + weak-edge cut.
// `uncertain` rows are kept for inspection but excluded from path traversal.
// Acyclicity and self-loop exclusion are app-enforced (symbolic half); the
// unique key forbids duplicate directed edges per enrichment.
export const inferredPrerequisiteEdges = pgTable("inferred_prerequisite_edges", {
  inferredPrerequisiteEdgeId: uuid("inferred_prerequisite_edge_id").primaryKey(),
  enrichmentId: uuid("enrichment_id").notNull().references(() => graphEnrichments.enrichmentId),
  // Separate inferred namespace — intentionally NOT an FK to relation_definitions.
  predicate: text("predicate").notNull().default("inferred-prerequisite-of"),
  prerequisiteConceptId: uuid("prerequisite_concept_id").notNull().references(() => concepts.conceptId),
  dependentConceptId: uuid("dependent_concept_id").notNull().references(() => concepts.conceptId),
  confidence: real("confidence").notNull(),
  uncertain: boolean("uncertain").notNull().default(false),
  clusterId: text("cluster_id"),
  provenance: jsonb("provenance").notNull()
}, (table) => [unique().on(table.enrichmentId, table.prerequisiteConceptId, table.dependentConceptId)]);

// Baseline node difficulty per enrichment. `method` = 'dag-depth-mock' in the
// slice; Bradley-Terry later. `components` keeps the interpretable inputs
// (e.g. { topoDepth, fanIn }) so the score is never an opaque number.
export const conceptDifficulties = pgTable("concept_difficulties", {
  conceptDifficultyId: uuid("concept_difficulty_id").primaryKey(),
  enrichmentId: uuid("enrichment_id").notNull().references(() => graphEnrichments.enrichmentId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  score: real("score").notNull(),
  method: text("method").notNull(),
  components: jsonb("components").notNull()
}, (table) => [unique().on(table.enrichmentId, table.conceptId)]);

// ---------------------------------------------------------------------------
// Learner Path — vertical-slice projection output (ADR-0019). CLI computes and
// persists; the Admin Lab Cytoscape view renders read-only (ADR-0011, rule 12).
// learner_state_ref identifies the (mock) learner; real IRT/KT reuses the shape.
// ---------------------------------------------------------------------------

export const learnerPaths = pgTable("learner_paths", {
  learnerPathId: uuid("learner_path_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  enrichmentId: uuid("enrichment_id").notNull().references(() => graphEnrichments.enrichmentId),
  targetConceptId: uuid("target_concept_id").notNull().references(() => concepts.conceptId),
  learnerStateRef: text("learner_state_ref").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique().on(table.enrichmentId, table.targetConceptId, table.learnerStateRef)]);

export const learnerPathSteps = pgTable("learner_path_steps", {
  learnerPathStepId: uuid("learner_path_step_id").primaryKey(),
  learnerPathId: uuid("learner_path_id").notNull().references(() => learnerPaths.learnerPathId),
  position: integer("position").notNull(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  difficulty: real("difficulty").notNull(),
  includedReason: text("included_reason").notNull()
}, (table) => [unique().on(table.learnerPathId, table.position), unique().on(table.learnerPathId, table.conceptId)]);
