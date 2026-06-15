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
  // Raw model confidence signal only; no composite score.
  confidence: real("confidence").notNull()
});

// Run-scoped Concept Evidence Profiles (ADR-0007 reset). One per admitted atomic
// Concept; references the run-local CANDIDATE, never a published concept. Replaces
// run_claims. `complete` is true only when a verified definition passage survives.
export const runConceptEvidenceProfiles = pgTable("run_concept_evidence_profiles", {
  runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  conceptCandidateId: uuid("concept_candidate_id").notNull().references(() => conceptCandidates.conceptCandidateId),
  tier: text("tier").notNull(),
  complete: boolean("complete").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique().on(table.runId, table.conceptCandidateId)]);

// Definition and mention passages — both are verbatim source quotes. `kind`
// separates them; `salienceRank` preserves the neural order for mentions.
export const runEvidencePassages = pgTable("run_evidence_passages", {
  runEvidencePassageId: uuid("run_evidence_passage_id").primaryKey(),
  runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").notNull().references(() => runConceptEvidenceProfiles.runConceptEvidenceProfileId),
  kind: text("kind").notNull(),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull(),
  salienceRank: integer("salience_rank").notNull()
});

// Optional typed assertions — guarded evidence, never edges. `defines` carries a
// literal; `explicit-prerequisite-hint` references an admitted Concept candidate.
export const runOptionalAssertions = pgTable("run_optional_assertions", {
  runOptionalAssertionId: uuid("run_optional_assertion_id").primaryKey(),
  runConceptEvidenceProfileId: uuid("run_concept_evidence_profile_id").notNull().references(() => runConceptEvidenceProfiles.runConceptEvidenceProfileId),
  assertionType: text("assertion_type").notNull(),
  literalValue: text("literal_value"),
  objectCandidateId: uuid("object_candidate_id").references(() => conceptCandidates.conceptCandidateId)
});

export const runOptionalAssertionEvidence = pgTable("run_optional_assertion_evidence", {
  runOptionalAssertionEvidenceId: uuid("run_optional_assertion_evidence_id").primaryKey(),
  runOptionalAssertionId: uuid("run_optional_assertion_id").notNull().references(() => runOptionalAssertions.runOptionalAssertionId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull()
});

// ---------------------------------------------------------------------------
// Graph-Version Builds — deterministic, LLM-free, atomic (ADR-0010, ADR-0017)
// ---------------------------------------------------------------------------

// Each published version names the base version it extends (ADR-0007 reset R3);
// baseGraphVersionId is null only for the initial build.
export const graphVersions = pgTable("graph_versions", {
  graphVersionId: uuid("graph_version_id").primaryKey(),
  baseGraphVersionId: uuid("base_graph_version_id"),
  status: text("status").notNull(),
  refinementConfigHash: text("refinement_config_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true })
});

// Stable Concept identity. Presentation belongs to immutable graph-version snapshots.
export const concepts = pgTable("concepts", {
  conceptId: uuid("concept_id").primaryKey(),
  iri: text("iri").notNull().unique(),
  normalizedLabel: text("normalized_label").notNull(),
  declaredDomain: text("declared_domain").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique().on(table.normalizedLabel, table.declaredDomain)]);

export const graphVersionConcepts = pgTable("graph_version_concepts", {
  graphVersionConceptId: uuid("graph_version_concept_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  canonicalLabel: text("canonical_label").notNull(),
  trustTier: text("trust_tier").notNull(),
  homograph: boolean("homograph").notNull().default(false)
}, (table) => [unique().on(table.graphVersionId, table.conceptId)]);

export const graphVersionConceptAliases = pgTable("graph_version_concept_aliases", {
  graphVersionConceptAliasId: uuid("graph_version_concept_alias_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId),
  label: text("label").notNull()
}, (table) => [unique().on(table.graphVersionId, table.conceptId, table.label)]);

export const graphVersionRunMemberships = pgTable("graph_version_run_memberships", {
  graphVersionRunMembershipId: uuid("graph_version_run_membership_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  runId: uuid("run_id").notNull().references(() => extractionRuns.runId),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId)
}, (table) => [unique().on(table.graphVersionId, table.runId)]);

// Published Concept Evidence Profiles (ADR-0007 reset) replace published claims.
// One CEP per Concept per graph version; a published snapshot has ZERO asserted
// edges (R5). Evidence is the cumulative union of the base version plus the newly
// selected runs, exact-deduplicated (R3, AE2).
export const graphVersionConceptEvidenceProfiles = pgTable("graph_version_concept_evidence_profiles", {
  graphVersionConceptEvidenceProfileId: uuid("graph_version_concept_evidence_profile_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  conceptId: uuid("concept_id").notNull().references(() => concepts.conceptId)
}, (table) => [unique().on(table.graphVersionId, table.conceptId)]);

// Definition and mention passages — verbatim source quotes with full provenance
// (R2). `kind` separates them; `salienceRank` preserves the published order.
export const graphVersionEvidencePassages = pgTable("graph_version_evidence_passages", {
  graphVersionEvidencePassageId: uuid("graph_version_evidence_passage_id").primaryKey(),
  graphVersionConceptEvidenceProfileId: uuid("graph_version_concept_evidence_profile_id").notNull().references(() => graphVersionConceptEvidenceProfiles.graphVersionConceptEvidenceProfileId),
  kind: text("kind").notNull(),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull(),
  headingPath: jsonb("heading_path").notNull(),
  locator: jsonb("locator").notNull(),
  salienceRank: integer("salience_rank").notNull()
});

// Optional typed assertions — guarded evidence inside a CEP, never edges (R6).
export const graphVersionOptionalAssertions = pgTable("graph_version_optional_assertions", {
  graphVersionOptionalAssertionId: uuid("graph_version_optional_assertion_id").primaryKey(),
  graphVersionConceptEvidenceProfileId: uuid("graph_version_concept_evidence_profile_id").notNull().references(() => graphVersionConceptEvidenceProfiles.graphVersionConceptEvidenceProfileId),
  assertionType: text("assertion_type").notNull(),
  literalValue: text("literal_value"),
  objectConceptId: uuid("object_concept_id").references(() => concepts.conceptId)
});

export const graphVersionOptionalAssertionEvidence = pgTable("graph_version_optional_assertion_evidence", {
  graphVersionOptionalAssertionEvidenceId: uuid("graph_version_optional_assertion_evidence_id").primaryKey(),
  graphVersionOptionalAssertionId: uuid("graph_version_optional_assertion_id").notNull().references(() => graphVersionOptionalAssertions.graphVersionOptionalAssertionId),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => sourceResources.sourceResourceId),
  sourceBlockId: uuid("source_block_id").notNull().references(() => sourceBlocks.sourceBlockId),
  evidenceQuote: text("evidence_quote").notNull(),
  headingPath: jsonb("heading_path").notNull(),
  locator: jsonb("locator").notNull()
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
// 'enrichment_run.v2', graph_version_id set). Inferred prerequisite edges are the
// ONLY edges in the system: the published asserted layer carries Concepts plus CEPs
// and no edges at all (ADR-0007 reset, R5).
// ---------------------------------------------------------------------------

export const graphEnrichments = pgTable("graph_enrichments", {
  enrichmentId: uuid("enrichment_id").primaryKey(),
  graphVersionId: uuid("graph_version_id").notNull().references(() => graphVersions.graphVersionId),
  enrichmentConfigHash: text("enrichment_config_hash").notNull(),
  status: text("status").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  judgeModel: text("judge_model").notNull(),
  difficultyMethod: text("difficulty_method").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

// Prerequisite Candidate Selection groups. These never decide Concept identity.
export const enrichmentPrerequisiteCandidateGroups = pgTable("enrichment_prerequisite_candidate_groups", {
  enrichmentPrerequisiteCandidateGroupId: uuid("enrichment_prerequisite_candidate_group_id").primaryKey(),
  enrichmentId: uuid("enrichment_id").notNull().references(() => graphEnrichments.enrichmentId),
  groupId: text("group_id").notNull(),
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
  candidateGroupId: text("candidate_group_id"),
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
