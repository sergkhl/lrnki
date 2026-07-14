-- Single initial migration (AGENTS rule 8). Reset local state rather than adding migrations.
-- This file is the SINGLE SOURCE OF TRUTH for the database schema (AGENTS rule 18):
-- there is no Drizzle schema and no `drizzle-kit generate` path. Stores query raw SQL
-- via `postgres`; scripts/migrate-db.sh applies this file directly with psql.
-- Edit this DDL directly (including the JSON_TABLE views and CHECK constraints below).

-- ---------------------------------------------------------------------------
-- Curated source registration and normalization (ADR-0004, ADR-0015)
-- ---------------------------------------------------------------------------

CREATE TABLE source_resources (
  source_resource_id uuid PRIMARY KEY,
  content_hash text NOT NULL UNIQUE,
  content_type text NOT NULL,
  object_key text NOT NULL,
  declared_domain text NOT NULL,
  title text NOT NULL,
  source_uri text,
  license text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_documents (
  source_document_id uuid PRIMARY KEY,
  source_resource_id uuid NOT NULL REFERENCES source_resources(source_resource_id),
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  parser_config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_blocks (
  source_block_id uuid PRIMARY KEY,
  source_document_id uuid NOT NULL REFERENCES source_documents(source_document_id),
  block_id text NOT NULL,
  block_type text NOT NULL,
  text text NOT NULL,
  heading_path jsonb NOT NULL,
  locator jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- Extraction Runs — per-source, run-scoped, never publish (ADR-0017)
-- ---------------------------------------------------------------------------

CREATE TABLE extraction_runs (
  run_id uuid PRIMARY KEY,
  source_resource_id uuid NOT NULL REFERENCES source_resources(source_resource_id),
  source_document_id uuid NOT NULL REFERENCES source_documents(source_document_id),
  pipeline_config_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  degraded boolean NOT NULL DEFAULT false,
  latency_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE concept_candidates (
  concept_candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  candidate_key text NOT NULL,
  discovered_label text NOT NULL,
  canonical_label text NOT NULL,
  normalized_label text NOT NULL,
  aliases jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, candidate_key)
);

CREATE TABLE concept_candidate_mentions (
  concept_candidate_mention_id uuid PRIMARY KEY,
  concept_candidate_id uuid NOT NULL REFERENCES concept_candidates(concept_candidate_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL
);

CREATE TABLE concept_admission_decisions (
  concept_admission_decision_id uuid PRIMARY KEY,
  concept_candidate_id uuid NOT NULL REFERENCES concept_candidates(concept_candidate_id),
  model_tier text NOT NULL CHECK (model_tier IN ('core', 'optional', 'reject', 'quarantine')),
  tier text NOT NULL CHECK (tier IN ('core', 'optional', 'reject', 'quarantine')),
  proposed_canonical_label text NOT NULL,
  standalone_learning_objective jsonb NOT NULL,
  established_domain_meaning jsonb NOT NULL,
  definition_bearing_treatment jsonb NOT NULL,
  organizing_power jsonb NOT NULL,
  core_selected boolean NOT NULL,
  selection_reason_code text NOT NULL,
  reason_codes jsonb NOT NULL,
  boundary_reason_codes jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1)
);

-- Run-scoped Concept Evidence Profiles (ADR-0007 reset) replace run claims. One
-- per admitted atomic Concept; references the run-local candidate, never a
-- published concept. `complete` requires a verified definition passage.
CREATE TABLE run_concept_evidence_profiles (
  run_concept_evidence_profile_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  concept_candidate_id uuid NOT NULL REFERENCES concept_candidates(concept_candidate_id),
  tier text NOT NULL CHECK (tier IN ('core', 'optional', 'reject', 'quarantine')),
  complete boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, concept_candidate_id)
);

-- Definition and mention passages — verbatim source quotes. `kind` separates them;
-- `salience_rank` preserves the neural order for mentions.
CREATE TABLE run_evidence_passages (
  run_evidence_passage_id uuid PRIMARY KEY,
  run_concept_evidence_profile_id uuid NOT NULL REFERENCES run_concept_evidence_profiles(run_concept_evidence_profile_id),
  kind text NOT NULL CHECK (kind IN ('definition', 'mention')),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL,
  salience_rank integer NOT NULL
);

-- Optional typed assertions — guarded evidence, never edges. `defines` carries a
-- literal; concept-to-concept relationships remain mention passages.
CREATE TABLE run_optional_assertions (
  run_optional_assertion_id uuid PRIMARY KEY,
  run_concept_evidence_profile_id uuid NOT NULL REFERENCES run_concept_evidence_profiles(run_concept_evidence_profile_id),
  assertion_type text NOT NULL CHECK (assertion_type IN ('defines')),
  literal_value text,
  CHECK (assertion_type = 'defines' AND literal_value IS NOT NULL)
);

CREATE TABLE run_optional_assertion_evidence (
  run_optional_assertion_evidence_id uuid PRIMARY KEY,
  run_optional_assertion_id uuid NOT NULL REFERENCES run_optional_assertions(run_optional_assertion_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL
);

-- ---------------------------------------------------------------------------
-- Graph-Version Builds — deterministic, LLM-free, atomic (ADR-0010, ADR-0017)
-- ---------------------------------------------------------------------------

-- Each published version names the base version it extends (ADR-0007 reset R3);
-- base_graph_version_id is NULL only for the initial build. CEP evidence is the
-- UNION of the base version's evidence plus the newly selected runs.
CREATE TABLE graph_versions (
  graph_version_id uuid PRIMARY KEY,
  base_graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  status text NOT NULL CHECK (status IN ('building', 'published', 'failed')),
  refinement_config_hash text NOT NULL,
  published_at timestamptz
);

CREATE TABLE concepts (
  concept_id uuid PRIMARY KEY,
  iri text NOT NULL UNIQUE,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_label, declared_domain)
);

CREATE TABLE graph_version_concepts (
  graph_version_concept_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  canonical_label text NOT NULL,
  trust_tier text NOT NULL,
  homograph boolean NOT NULL DEFAULT false,
  UNIQUE (graph_version_id, concept_id)
);

CREATE TABLE graph_version_concept_aliases (
  graph_version_concept_alias_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  label text NOT NULL,
  UNIQUE (graph_version_id, concept_id, label)
);

CREATE TABLE graph_version_run_memberships (
  graph_version_run_membership_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  source_resource_id uuid NOT NULL REFERENCES source_resources(source_resource_id),
  UNIQUE (graph_version_id, run_id)
);

-- Published Concept Evidence Profiles (ADR-0007 reset) replace published claims. A
-- published snapshot carries one CEP per Concept and ZERO asserted edges (R5). CEP
-- evidence is cumulative across versions: each build unions the base version's
-- evidence with the newly selected runs and exact-deduplicates (R3, AE2).
CREATE TABLE graph_version_concept_evidence_profiles (
  graph_version_concept_evidence_profile_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  UNIQUE (graph_version_id, concept_id)
);

-- Definition and mention passages — verbatim source quotes with full provenance
-- (R2). `kind` separates them; `salience_rank` preserves the published order.
CREATE TABLE graph_version_evidence_passages (
  graph_version_evidence_passage_id uuid PRIMARY KEY,
  graph_version_concept_evidence_profile_id uuid NOT NULL REFERENCES graph_version_concept_evidence_profiles(graph_version_concept_evidence_profile_id),
  kind text NOT NULL CHECK (kind IN ('definition', 'mention')),
  source_resource_id uuid NOT NULL REFERENCES source_resources(source_resource_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL,
  heading_path jsonb NOT NULL,
  locator jsonb NOT NULL,
  salience_rank integer NOT NULL
);

-- Optional typed assertions — guarded evidence inside a CEP, never edges (R6).
-- `defines` carries a literal.
CREATE TABLE graph_version_optional_assertions (
  graph_version_optional_assertion_id uuid PRIMARY KEY,
  graph_version_concept_evidence_profile_id uuid NOT NULL REFERENCES graph_version_concept_evidence_profiles(graph_version_concept_evidence_profile_id),
  assertion_type text NOT NULL CHECK (assertion_type IN ('defines')),
  literal_value text,
  CHECK (assertion_type = 'defines' AND literal_value IS NOT NULL)
);

CREATE TABLE graph_version_optional_assertion_evidence (
  graph_version_optional_assertion_evidence_id uuid PRIMARY KEY,
  graph_version_optional_assertion_id uuid NOT NULL REFERENCES graph_version_optional_assertions(graph_version_optional_assertion_id),
  source_resource_id uuid NOT NULL REFERENCES source_resources(source_resource_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL,
  heading_path jsonb NOT NULL,
  locator jsonb NOT NULL
);

CREATE TABLE refinement_decisions (
  refinement_decision_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  decision_type text NOT NULL,
  subject jsonb NOT NULL,
  outcome text NOT NULL,
  rationale text NOT NULL,
  provenance jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- Immutable artifact envelopes (ADR-0003)
-- ---------------------------------------------------------------------------

CREATE TABLE artifact_versions (
  artifact_id text PRIMARY KEY,
  artifact_type text NOT NULL,
  run_id uuid REFERENCES extraction_runs(run_id),
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  producer text NOT NULL,
  producer_version text NOT NULL,
  config_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- JSON_TABLE inspection surface (ADR-0003, Postgres 18)
-- ---------------------------------------------------------------------------

-- Flatten extraction-run artifact payloads: one row per candidate with its
-- admission proposal and effective decision, for the Admin Lab Run Inspector.
CREATE VIEW artifact_run_candidates AS
SELECT a.run_id, c.candidate_key, c.discovered_label, c.canonical_label,
       c.aliases, c.mention_count, c.model_tier, c.tier,
       c.proposed_canonical_label, c.standalone_learning_objective,
       c.established_domain_meaning, c.definition_bearing_treatment,
       c.organizing_power, c.core_selected,
       c.selection_reason_code,
       c.reason_codes, c.boundary_reason_codes, c.confidence
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.candidates[*]'
  COLUMNS (
    candidate_key text PATH '$.candidateKey',
    discovered_label text PATH '$.discoveredLabel',
    canonical_label text PATH '$.canonicalLabel',
    aliases jsonb PATH '$.aliases',
    mention_count integer PATH '$.mentions.size()',
    model_tier text PATH '$.admission.modelTier',
    tier text PATH '$.admission.tier',
    proposed_canonical_label text PATH '$.admission.proposedCanonicalLabel',
    standalone_learning_objective jsonb PATH '$.admission.standaloneLearningObjective',
    established_domain_meaning jsonb PATH '$.admission.establishedDomainMeaning',
    definition_bearing_treatment jsonb PATH '$.admission.definitionBearingTreatment',
    organizing_power jsonb PATH '$.admission.organizingPower',
    core_selected boolean PATH '$.admission.coreSelected',
    selection_reason_code text PATH '$.admission.selectionReasonCode',
    reason_codes jsonb PATH '$.admission.reasonCodes',
    boundary_reason_codes jsonb PATH '$.admission.boundaryReasonCodes',
    confidence numeric PATH '$.admission.confidence'
  )
) AS c
WHERE a.artifact_type = 'extraction_run';

-- Flatten extraction-run artifact payloads: one row per Concept Evidence Profile
-- with its definition/mention/assertion counts, for the Admin Lab Run Inspector.
CREATE VIEW artifact_run_evidence_profiles AS
SELECT a.run_id, p.candidate_key, p.tier, p.complete,
       p.definition_count, p.mention_count, p.assertion_count
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.evidenceProfiles[*]'
  COLUMNS (
    candidate_key text PATH '$.candidateKey',
    tier text PATH '$.tier',
    complete boolean PATH '$.complete',
    definition_count integer PATH '$.definitions.size()',
    mention_count integer PATH '$.mentions.size()',
    assertion_count integer PATH '$.assertions.size()'
  )
) AS p
WHERE a.artifact_type = 'extraction_run';

-- Flatten graph-snapshot artifact payloads: one row per published Concept with its
-- identity and trust tier, for the Admin Lab published view (ADR-0007 reset).
CREATE VIEW artifact_graph_concepts AS
SELECT a.graph_version_id, c.concept_id, c.iri, c.canonical_label,
       c.normalized_label, c.declared_domain, c.trust_tier, c.homograph
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.concepts[*]'
  COLUMNS (
    concept_id text PATH '$.conceptId',
    iri text PATH '$.iri',
    canonical_label text PATH '$.canonicalLabel',
    normalized_label text PATH '$.normalizedLabel',
    declared_domain text PATH '$.declaredDomain',
    trust_tier text PATH '$.trustTier',
    homograph boolean PATH '$.homograph'
  )
) AS c
WHERE a.artifact_type = 'graph_snapshot';

-- Flatten graph-snapshot CEPs: one row per Concept Evidence Profile with its
-- definition/mention/assertion counts and zero asserted edges (R5).
CREATE VIEW artifact_graph_cep_profiles AS
SELECT a.graph_version_id, p.concept_id,
       p.definition_count, p.mention_count, p.assertion_count
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.evidenceProfiles[*]'
  COLUMNS (
    concept_id text PATH '$.conceptId',
    definition_count integer PATH '$.definitions.size()',
    mention_count integer PATH '$.mentions.size()',
    assertion_count integer PATH '$.assertions.size()'
  )
) AS p
WHERE a.artifact_type = 'graph_snapshot';

-- Flatten graph-snapshot typed assertions: one row per optional `defines`
-- assertion inside a published CEP.
CREATE VIEW artifact_graph_cep_assertions AS
SELECT a.graph_version_id, t.concept_id, t.assertion_type,
       t.literal_value
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.evidenceProfiles[*]'
  COLUMNS (
    concept_id text PATH '$.conceptId',
    NESTED PATH '$.assertions[*]' COLUMNS (
      assertion_type text PATH '$.type',
      literal_value text PATH '$.literalValue'
    )
  )
) AS t
WHERE a.artifact_type = 'graph_snapshot' AND t.assertion_type IS NOT NULL;

-- Flatten enrichment-run artifact payloads: one row per derived graph node with
-- node kind, grounding origin, and role for Admin Lab inspection.
CREATE VIEW artifact_derived_graph_nodes AS
SELECT a.graph_version_id, a.payload->>'enrichmentId' AS enrichment_id,
       n.derived_node_id, n.node_kind, n.concept_id, n.grounding_origin,
       n.role, n.canonical_label, n.normalized_label, n.declared_domain
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.derivedNodes[*]'
  COLUMNS (
    derived_node_id text PATH '$.derivedNodeId',
    node_kind text PATH '$.nodeKind',
    concept_id text PATH '$.conceptId',
    grounding_origin text PATH '$.groundingOrigin',
    role text PATH '$.role',
    canonical_label text PATH '$.canonicalLabel',
    normalized_label text PATH '$.normalizedLabel',
    declared_domain text PATH '$.declaredDomain'
  )
) AS n
WHERE a.artifact_type = 'enrichment_run';

-- Flatten study-item-bank artifact payloads: one row per Study Item with its derived node,
-- grounding provenance, question, and per-type count, for Admin Lab inspection (R7, R15).
-- `option_count` is null for impostor rows and `statement_count` is null for option-select
-- rows — JSON_TABLE returns null when the path is absent. Reads the immutable
-- `study_item_bank` artifact the Study Item Bank store writes beside its normalized rows.
CREATE VIEW artifact_study_items AS
SELECT a.graph_version_id, si.study_item_id, si.item_type, si.enrichment_id, si.derived_node_id,
       si.grounding_provenance, si.question, si.facet, si.option_count, si.pair_count, si.statement_count
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.studyItems[*]'
  COLUMNS (
    study_item_id text PATH '$.studyItemId',
    item_type text PATH '$.itemType',
    enrichment_id text PATH '$.enrichmentId',
    derived_node_id text PATH '$.derivedNodeId',
    grounding_provenance text PATH '$.groundingProvenance',
    question text PATH '$.question',
    facet text PATH '$.facet',
    option_count integer PATH '$.options.size()',
    pair_count integer PATH '$.pairs.size()',
    statement_count integer PATH '$.statements.size()'
  )
) AS si
WHERE a.artifact_type = 'study_item_bank';

-- Flatten concept-lesson-bank artifact payloads: one row per persisted Concept Lesson with
-- its derived node, label, and section count, for Admin Lab inspection (ADR-0031). Reads the
-- immutable `concept_lesson_bank` artifact the Concept Lesson store writes beside its rows.
CREATE VIEW artifact_concept_lessons AS
SELECT a.graph_version_id, cl.derived_node_id, cl.enrichment_id, cl.canonical_label, cl.section_count, cl.sections
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.lessons[*]'
  COLUMNS (
    derived_node_id text PATH '$.derivedNodeId',
    enrichment_id text PATH '$.enrichmentId',
    canonical_label text PATH '$.canonicalLabel',
    section_count integer PATH '$.sections.size()',
    sections json PATH '$.sections'
  )
) AS cl
WHERE a.artifact_type = 'concept_lesson_bank';

-- ---------------------------------------------------------------------------
-- Graph Enrichment — third operation, derived layer keyed to a published
-- version (ADR-0019). LLM-proposed, symbolically constrained; never mutates the
-- asserted core. Inferred relations live in their OWN namespace and intentionally
-- do NOT reference relation_definitions (the closed asserted registry, ADR-0016).
-- ---------------------------------------------------------------------------

CREATE TABLE graph_enrichments (
  enrichment_id uuid PRIMARY KEY,
  -- NULL for synthetic (source-less) layers, which have no published asserted version;
  -- non-null for enrichment layers derived from a published graph version (ADR-0019).
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  enrichment_config_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  judge_model text NOT NULL,
  difficulty_method text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE derived_graph_nodes (
  derived_node_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  node_kind text NOT NULL CHECK (node_kind IN ('anchor', 'enrichment')),
  concept_id uuid REFERENCES concepts(concept_id),
  grounding_origin text NOT NULL CHECK (grounding_origin IN ('document_anchored', 'source_mentioned', 'llm_grounded')),
  role text NOT NULL CHECK (role IN ('anchor', 'prerequisite', 'synthetic_primary')),
  canonical_label text NOT NULL,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  aliases jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrichment_id, concept_id),
  CHECK (
    (node_kind = 'anchor' AND concept_id IS NOT NULL AND grounding_origin = 'document_anchored' AND role = 'anchor')
    OR
    (node_kind = 'enrichment' AND concept_id IS NULL AND grounding_origin IN ('source_mentioned', 'llm_grounded') AND role IN ('prerequisite', 'synthetic_primary'))
  )
);

CREATE TABLE enrichment_grounding_bundles (
  enrichment_grounding_bundle_id uuid PRIMARY KEY,
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  grounding_origin text NOT NULL CHECK (grounding_origin IN ('llm_grounded')),
  generating_model text NOT NULL,
  rationale text NOT NULL,
  bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (derived_node_id)
);

CREATE TABLE enrichment_grounding_passages (
  enrichment_grounding_passage_id uuid PRIMARY KEY,
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  passage_type text NOT NULL CHECK (passage_type IN ('definition', 'mention')),
  grounding_origin text NOT NULL CHECK (grounding_origin IN ('source_mentioned', 'llm_grounded')),
  source_resource_id uuid REFERENCES source_resources(source_resource_id),
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  generated_text text,
  heading_path jsonb NOT NULL,
  locator jsonb NOT NULL,
  verbatim_check jsonb NOT NULL,
  salience_rank integer NOT NULL,
  CHECK (
    (grounding_origin = 'source_mentioned' AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND generated_text IS NULL)
    OR
    (grounding_origin = 'llm_grounded' AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND generated_text IS NOT NULL)
  )
);

CREATE TABLE inferred_prerequisite_edges (
  inferred_prerequisite_edge_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  predicate text NOT NULL DEFAULT 'inferred-prerequisite-of',
  prerequisite_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  dependent_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  uncertain boolean NOT NULL DEFAULT false,
  -- Which judge model ordered this pair (U4): the cross-family generated-node alias
  -- for any pair touching an llm_grounded node, the validated extractor-family alias otherwise.
  judge_model text NOT NULL,
  provenance jsonb NOT NULL,
  UNIQUE (enrichment_id, prerequisite_derived_node_id, dependent_derived_node_id),
  CHECK (prerequisite_derived_node_id <> dependent_derived_node_id)
);

CREATE TABLE concept_difficulties (
  concept_difficulty_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  score real NOT NULL,
  method text NOT NULL,
  components jsonb NOT NULL,
  -- The neural judge's free-text difficulty rationale (ADR-0024). Kept beside the
  -- strictly-numeric `components` JSONB so an operator can read why a node scored as it
  -- did. NOT NULL: the production judge's forced-tool schema always requires `rationale`,
  -- so the port always supplies one (empty string for any structural-only producer).
  neural_rationale text NOT NULL,
  UNIQUE (enrichment_id, derived_node_id)
);

-- ---------------------------------------------------------------------------
-- Learner Registry (plan 2026-07-07-005, R1). The identity table the four
-- learner-state tables key against. `learner_ref` is the compact-normalized ref
-- (`compactLearnerRef`) produced at the gate, so it is the natural primary key and
-- what every learner-state FK references. Real humans only — there is no `is_mock`
-- flag and simulated rivals never get a row (KTD1). `pin_hash` is a salted SHA-256
-- of a short numeric PIN (KTD8): a labeled placeholder for real authentication, not
-- a security claim on an open dev database.
-- ---------------------------------------------------------------------------

CREATE TABLE learners (
  learner_ref text PRIMARY KEY,
  display_name text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Durable learner awards (plan 2026-07-07-005, R8). One row per earned flair. A
-- `weekly_podium` is awarded lazily and idempotently on first entry into a new ISO week
-- (top 3 of the prior week's final standings, KTD6). `dedupe_key` scopes idempotency:
-- the ISO week key for a podium. The UNIQUE makes re-award a no-op. Real learners only —
-- rivals are fiction and never earn persisted awards (KTD1).
CREATE TABLE learner_awards (
  award_id uuid PRIMARY KEY,
  learner_ref text NOT NULL REFERENCES learners(learner_ref),
  award_type text NOT NULL CHECK (award_type IN ('weekly_podium')),
  dedupe_key text NOT NULL,
  context jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_ref, award_type, dedupe_key)
);

CREATE INDEX learner_awards_learner_idx ON learner_awards (learner_ref, created_at DESC);

-- Opaque bearer sessions for the learner API (plan 2026-07-08-003, KTD3). The raw
-- token lives only client-side; the API stores its SHA-256 and resolves it to a
-- learner on every authenticated route. Revocation is row deletion — no JWT state.
CREATE TABLE learner_sessions (
  token_hash text PRIMARY KEY,
  learner_ref text NOT NULL REFERENCES learners(learner_ref) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learner_sessions_learner_idx ON learner_sessions (learner_ref);

-- ---------------------------------------------------------------------------
-- Learner Expeditions — learner-owned route/generation state for the Learner App.
-- This table does not persist mastery, readiness, rewards, or trail shape; those
-- derive from the Study Session projection and the published graph. It only
-- remembers the learner's expedition rows, active selection, current generation
-- operation pointer, and the ready enrichment once generation completes.
-- ---------------------------------------------------------------------------

CREATE TABLE learner_expeditions (
  learner_expedition_id uuid PRIMARY KEY,
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  kind text NOT NULL CHECK (kind IN ('topic')),
  title text NOT NULL,
  declared_domain text,
  status text NOT NULL CHECK (status IN ('generating', 'ready', 'failed')),
  current_operation_id uuid,
  current_operation_type text CHECK (current_operation_type IN ('extraction', 'minting', 'enrichment', 'study_items')),
  enrichment_id uuid REFERENCES graph_enrichments(enrichment_id),
  active boolean NOT NULL DEFAULT false,
  failure_message text,
  generation_attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((current_operation_id IS NULL AND current_operation_type IS NULL) OR (current_operation_id IS NOT NULL AND current_operation_type IS NOT NULL)),
  -- The summit is derived at read time (ADR-0032), so a ready expedition needs only its
  -- enrichment; there is no persisted target to constrain.
  CHECK ((status = 'ready' AND enrichment_id IS NOT NULL AND declared_domain IS NOT NULL) OR status <> 'ready')
);

CREATE UNIQUE INDEX learner_expeditions_one_active_per_learner
  ON learner_expeditions (learner_state_ref)
  WHERE active;

CREATE UNIQUE INDEX learner_expeditions_one_enrichment_per_learner
  ON learner_expeditions (learner_state_ref, enrichment_id)
  WHERE enrichment_id IS NOT NULL;

CREATE INDEX learner_expeditions_learner_state_ref_idx ON learner_expeditions (learner_state_ref, created_at DESC);
CREATE INDEX learner_expeditions_enrichment_idx ON learner_expeditions (enrichment_id);

-- Rescue durability dispositions (U4, ADR-0019 refinement). One row per AGGREGATED
-- source_mentioned rescue candidate the durability judge ruled on (U3). A `dropped`
-- candidate has no derived_graph_nodes row, so derived_node_id is correlation-only
-- (no FK). The relational projection mirrors the immutable JSONB trace so Admin Lab
-- reads dispositions without recompute (rules 11/12).
CREATE TABLE rescue_dispositions (
  rescue_disposition_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL,
  canonical_label text NOT NULL,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('accepted', 'dropped', 'kept_judge_unavailable')),
  rationale text NOT NULL,
  grounding_span text NOT NULL
);

-- Minting durability dispositions. One row per RESERVED assumed-prerequisite proposal
-- the minting durability judge ruled on before grounding generation. A `dropped`
-- proposal has no derived_graph_nodes row, so derived_node_id is correlation-only
-- (no FK), mirroring rescue_dispositions. The anchor_concept_id records the asserted
-- Concept the proposal would have scaffolded — always a surviving published Concept, so
-- it carries a real FK (unlike the correlation-only derived_node_id).
CREATE TABLE minting_dispositions (
  minting_disposition_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL,
  proposed_label text NOT NULL,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  anchor_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  disposition text NOT NULL CHECK (disposition IN ('accepted', 'dropped', 'kept_judge_unavailable')),
  rationale text NOT NULL
);

-- Derived-layer semantic merges (plan U4, ADR-0012/0019, AGENTS rule 20). One row per
-- ABSORBED node the dedup sub-stage collapsed into a canonical near-duplicate (U3). The
-- canonical node SURVIVES, so canonical_derived_node_id has an FK; the absorbed node is
-- REMOVED from the layer, so absorbed_derived_node_id is correlation-only with NO FK
-- (exactly as rescue_dispositions.derived_node_id is correlation-only for dropped
-- candidates). The absorbed node's label/aliases/kind/evidence are SNAPSHOTTED here so
-- Admin Lab reads a merge without rehydrating a deleted node (U5). Lives only on the
-- derived layer; published Concept identity and IRIs are untouched (R7). The absorbed
-- node is always an enrichment node — an anchor is never absorbed (KTD6).
CREATE TABLE derived_node_merges (
  derived_node_merge_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  declared_domain text NOT NULL,
  canonical_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  canonical_label text NOT NULL,
  canonical_node_kind text NOT NULL CHECK (canonical_node_kind IN ('anchor', 'enrichment')),
  absorbed_derived_node_id uuid NOT NULL,
  absorbed_label text NOT NULL,
  absorbed_aliases jsonb NOT NULL,
  absorbed_node_kind text NOT NULL CHECK (absorbed_node_kind IN ('anchor', 'enrichment')),
  absorbed_evidence jsonb NOT NULL,
  proposing_signal text NOT NULL CHECK (proposing_signal IN ('embedding_cosine')),
  proposing_score real NOT NULL,
  rationale text NOT NULL,
  canonical_selection_reason text NOT NULL CHECK (canonical_selection_reason IN ('anchor_over_enrichment', 'higher_evidence_count', 'stable_id_tiebreak')),
  CHECK (canonical_derived_node_id <> absorbed_derived_node_id)
);

-- ---------------------------------------------------------------------------
-- Learner Study Loop — learner-neutral typed Study Item Bank keyed to the Derived
-- Graph Layer (R7, R12, ADR-0026). At most one CURRENT item PER TYPE per derived
-- node (the partial unique index below), conditioned on that node's grounding. Items
-- retain graph_version_id for publication scope and key their subject on
-- derived_node_id so anchors and enrichment nodes share one identity space.
-- Regenerable; never mutates the asserted core or the Derived Graph Layer.
-- Regeneration never deletes a row: response_log.study_item_id (append-only, no
-- cascade — see that table's header) must keep resolving to whatever item a
-- learner actually answered, even after the bank moves on. `persist` supersedes
-- (sets superseded_at) the enrichment's current rows instead of deleting them, so
-- a prior generation survives as inspectable history alongside its own options /
-- citations / impostor statements (their cascades target the still-live parent
-- row, not a deleted one).
-- ---------------------------------------------------------------------------

CREATE TABLE study_items (
  study_item_id uuid PRIMARY KEY,
  item_type text NOT NULL CHECK (item_type IN ('option_select', 'matching', 'impostor')),
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  grounding_provenance text NOT NULL CHECK (grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')),
  question text NOT NULL,
  explanation text,
  facet text,
  -- Zero-to-five validated Explorable Terms (plan 2026-07-13-002 U1) from the question
  -- stem, stored as a jsonb array of strings. Affordance metadata only — never graph
  -- knowledge. Lives on the parent row (payload-on-parent) because it is bounded and
  -- regenerated wholesale with the item.
  explorable_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  generating_model text NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);

-- Uniqueness holds only among CURRENT items — the same partial-index idiom as
-- study_item_options_one_correct_per_item / impostor_statements_one_impostor_per_item
-- below. A superseded row from a prior generation is exempt so history can coexist
-- with a fresh regeneration.
CREATE UNIQUE INDEX study_items_one_current_per_node_type
  ON study_items (derived_node_id, item_type)
  WHERE superseded_at IS NULL;

-- Regeneration now supersedes rather than deletes, so a row's enrichment_id is scanned on
-- every regeneration (the supersede UPDATE) and every bank read (listStudyItemsForEnrichment)
-- against a table that only grows. Without this index both degrade to a full table scan as
-- superseded history accumulates.
CREATE INDEX study_items_enrichment_current_idx
  ON study_items (enrichment_id)
  WHERE superseded_at IS NULL;

-- Options for option_select items (R9). Store writes validate the four-option shape; the
-- schema backs that with ordinal bounds and at-most-one correct option per item.
-- `ordinal` preserves a stable render order.
-- The correct option's grounding lives in study_item_citations; distractors are
-- generated and carry none. Cascade so item regeneration (delete-then-insert) clears
-- options too.
CREATE TABLE study_item_options (
  option_id uuid PRIMARY KEY,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 3),
  option_text text NOT NULL,
  is_correct boolean NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  UNIQUE (study_item_id, ordinal)
);

CREATE UNIQUE INDEX study_item_options_one_correct_per_item
  ON study_item_options (study_item_id)
  WHERE is_correct;

CREATE TABLE matching_pairs (
  matching_pair_id uuid PRIMARY KEY,
  match_tile_id uuid NOT NULL UNIQUE,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 3),
  prompt_text text NOT NULL,
  match_text text NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  source_resource_id uuid REFERENCES source_resources(source_resource_id),
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  match_kind text CHECK (match_kind IN ('exact', 'normalized')),
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  generated_passage_text text,
  CHECK (btrim(prompt_text) <> '' AND btrim(match_text) <> '' AND lower(btrim(prompt_text)) <> lower(btrim(match_text))),
  CHECK (
    (provenance = 'source' AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND match_kind IS NOT NULL AND derived_node_id IS NULL AND generated_passage_text IS NULL)
    OR
    (provenance = 'generated' AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND match_kind IS NULL AND derived_node_id IS NOT NULL AND generated_passage_text IS NOT NULL)
  ),
  UNIQUE (study_item_id, ordinal),
  UNIQUE (study_item_id, prompt_text),
  UNIQUE (study_item_id, match_text),
  UNIQUE (study_item_id, match_tile_id)
);

-- Grounded-answer citations are provenance-tagged. They back the option_select correct
-- answer, keyed by study_item_id. Source
-- citations mirror real source evidence and require source ids + a verbatim quote.
-- Generated citations point at generated grounding text only and cannot smuggle nullable
-- source ids through the schema. Cascade so item regeneration clears citations too.
CREATE TABLE study_item_citations (
  study_item_citation_id uuid PRIMARY KEY,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id) ON DELETE CASCADE,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  source_resource_id uuid REFERENCES source_resources(source_resource_id),
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  -- Grounding fidelity for a source citation: whether the quote traced byte-exact or only
  -- after formatting normalization (ADR-0007 evidence matching, made inspectable). NULL on
  -- a generated citation.
  match_kind text CHECK (match_kind IN ('exact', 'normalized')),
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  generated_passage_text text,
  CHECK (
    (provenance = 'source' AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND match_kind IS NOT NULL AND derived_node_id IS NULL AND generated_passage_text IS NULL)
    OR
    (provenance = 'generated' AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND match_kind IS NULL AND derived_node_id IS NOT NULL AND generated_passage_text IS NOT NULL)
  )
);

-- Statements for impostor items (R1, KTD5). Four rows per item: three truths and exactly
-- one planted lie (the impostor). A truth carries inline provenance + a verified citation
-- mirroring study_item_citations; the impostor is `generated` and carries NO citation —
-- never a source quote (R5/R8). The impostor row, and only it, carries the reveal /
-- lie_source / sibling_label (denormalized onto the lie's row). One CHECK enforces the
-- three legal column shapes, so a source-cited impostor is unrepresentable — the structural
-- honesty backstop behind the application guard (U4). Cascade targets a hard-deleted
-- study_items row (never a superseded one, since regeneration now sets superseded_at
-- instead of deleting — see the study_items comment above).
CREATE TABLE impostor_statements (
  impostor_statement_id uuid PRIMARY KEY,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 3),
  statement_text text NOT NULL,
  is_impostor boolean NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  -- Inline citation columns mirroring study_item_citations (a truth's grounding).
  source_resource_id uuid REFERENCES source_resources(source_resource_id),
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  match_kind text CHECK (match_kind IN ('exact', 'normalized')),
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  generated_passage_text text,
  -- Impostor-row-only metadata (NULL on every truth).
  reveal_text text,
  lie_source text CHECK (lie_source IN ('sibling', 'generated')),
  sibling_label text,
  CHECK (
    -- Source-grounded truth: a verbatim source citation, no generated/impostor columns.
    (is_impostor = false AND provenance = 'source'
       AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND match_kind IS NOT NULL
       AND derived_node_id IS NULL AND generated_passage_text IS NULL
       AND reveal_text IS NULL AND lie_source IS NULL AND sibling_label IS NULL)
    OR
    -- Generated-origin truth: a generated citation, no source/impostor columns.
    (is_impostor = false AND provenance = 'generated'
       AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND match_kind IS NULL
       AND derived_node_id IS NOT NULL AND generated_passage_text IS NOT NULL
       AND reveal_text IS NULL AND lie_source IS NULL AND sibling_label IS NULL)
    OR
    -- The impostor: `generated`, NO citation at all, carries the reveal + lie_source;
    -- sibling_label present iff the lie was a mis-attributed sibling fact.
    (is_impostor = true AND provenance = 'generated'
       AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND match_kind IS NULL
       AND derived_node_id IS NULL AND generated_passage_text IS NULL
       AND reveal_text IS NOT NULL AND lie_source IS NOT NULL
       AND (sibling_label IS NOT NULL) = (lie_source = 'sibling'))
  ),
  UNIQUE (study_item_id, ordinal)
);

-- Exactly one impostor per item (the keyed lie). The application guard enforces the full
-- four-statements-one-impostor shape; this partial unique index is the structural backstop.
CREATE UNIQUE INDEX impostor_statements_one_impostor_per_item
  ON impostor_statements (study_item_id)
  WHERE is_impostor;

-- Derived nodes that yielded NO study item of a given type (no usable grounding), recorded
-- as a durable fact (not a transient log line). Keyed per `item_type` (KTD8) so a node can
-- be impostor-absent independently of having an option-select item. Regeneration replaces an
-- enrichment's rejections alongside its items. The no-item frontier fallback reads `reason`
-- instead of guessing from grounding origin.
CREATE TABLE rejected_study_items (
  rejected_study_item_id uuid PRIMARY KEY,
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  item_type text NOT NULL CHECK (item_type IN ('option_select', 'matching', 'impostor')),
  reason text NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (derived_node_id, item_type)
);

-- ---------------------------------------------------------------------------
-- Concept Lessons — the learner-neutral teaching SUBSTRATE (ADR-0031). One lesson per
-- derived node: an ordered set of typed, independently-optional sections that TEACH a
-- concept before it is tested. Option-select derives FROM this substrate (rule 18), so a
-- lesson is the single source of grounding for downstream study assets. Like the Study
-- Item Bank, lessons are a learner-NEUTRAL regenerable derived asset: regeneration is
-- replace-by-enrichment (delete-then-insert), never mutation of learner state, and never
-- a write to the asserted graph. The normalized rows are the query surface; the immutable
-- `concept_lesson_bank` artifact is the inspection trace `artifact_concept_lessons` flattens.
-- ---------------------------------------------------------------------------

-- Layer purpose — one learner-neutral capability statement per enrichment (plan
-- 2026-07-10-001 U1). Stored in PLAIN register (no theme words, ADR-0033); the Learner App
-- themes it at render. Fail-open: an enrichment with no row renders a mechanical template.
-- Regenerable derived asset like the lesson bank: regeneration upserts, never learner state.
CREATE TABLE enrichment_layer_purposes (
  enrichment_id uuid PRIMARY KEY REFERENCES graph_enrichments(enrichment_id),
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE concept_lessons (
  concept_lesson_id uuid PRIMARY KEY,
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  canonical_label text NOT NULL,
  -- Zero-to-five lesson-wide Explorable Terms (plan 2026-07-13-002 U1), each a
  -- {term, sectionKind} object naming the section whose body contains it verbatim. jsonb
  -- array; affordance metadata only, never graph knowledge.
  explorable_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  generating_model text NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (derived_node_id)
);

-- Ordered teaching sections (R2). `ordinal` preserves the render order; a section that
-- does not apply is simply ABSENT (no placeholder row, R3). `grounding_provenance` records
-- the authoritative provenance the assembler re-derived (a section is `source_*` only when
-- its quote verified verbatim). The diagram descriptor (R14) is an optional caption+spec
-- pair; the CHECK keeps the pair all-or-nothing.
-- Cascade so lesson regeneration (delete-then-insert) clears sections too.
CREATE TABLE concept_lesson_sections (
  concept_lesson_section_id uuid PRIMARY KEY,
  concept_lesson_id uuid NOT NULL REFERENCES concept_lessons(concept_lesson_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  kind text NOT NULL CHECK (kind IN ('gist', 'intuition', 'definition', 'examples', 'applications', 'formulas')),
  body_text text NOT NULL,
  items text[],
  grounding_provenance text NOT NULL CHECK (grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')),
  diagram_caption text,
  diagram_spec text,
  CHECK ((diagram_caption IS NULL AND diagram_spec IS NULL) OR (diagram_caption IS NOT NULL AND diagram_spec IS NOT NULL)),
  UNIQUE (concept_lesson_id, ordinal)
);

-- Per-section grounding citations are provenance-tagged exactly like study-item citations
-- (KTD2). A `source` citation mirrors real source evidence and requires source ids + a
-- verbatim quote; a `generated` citation points at generated grounding text only and cannot
-- smuggle nullable source ids through the schema (R8). At most one citation per section.
-- Cascade so lesson regeneration clears citations too.
CREATE TABLE concept_lesson_section_citations (
  concept_lesson_section_citation_id uuid PRIMARY KEY,
  concept_lesson_section_id uuid NOT NULL REFERENCES concept_lesson_sections(concept_lesson_section_id) ON DELETE CASCADE,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  source_resource_id uuid REFERENCES source_resources(source_resource_id),
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  -- Grounding fidelity for a source citation: byte-exact vs. normalized match (ADR-0007),
  -- made inspectable. NULL on a generated citation.
  match_kind text CHECK (match_kind IN ('exact', 'normalized')),
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  generated_passage_text text,
  CHECK (
    (provenance = 'source' AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND match_kind IS NOT NULL AND derived_node_id IS NULL AND generated_passage_text IS NULL)
    OR
    (provenance = 'generated' AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND match_kind IS NULL AND derived_node_id IS NOT NULL AND generated_passage_text IS NOT NULL)
  ),
  UNIQUE (concept_lesson_section_id)
);

-- Derived nodes whose grounding cannot meet the R3 minimum, recorded as a durable fact
-- (not a transient log line) so the operator lesson-absent visibility surface (U8) reads
-- the exact reason. Regeneration replaces an enrichment's absences alongside its lessons.
CREATE TABLE lesson_absent_nodes (
  lesson_absent_node_id uuid PRIMARY KEY,
  graph_version_id uuid REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  reason text NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (derived_node_id)
);

-- ---------------------------------------------------------------------------
-- Calibration Verdicts — the MUTABLE calibration store (R10, KTD1). Deliberately
-- the opposite of the response log: a calibration verdict is the learner's CURRENT
-- intent per (learner, node), so it is naturally upsert/delete. The calibration list
-- and study-side "skip as known" action write `known`; synthetic prefill may seed
-- `learn`. Reversal (R7) is a single-row delete/overwrite — no append-only seeded rows to reconcile.
-- The trusted-edge prerequisite down-closure of the `known` set is derived at read
-- time (not materialized), so this table holds only the direct verdicts. There are
-- no evidence weights (rule 18): a verdict is a discrete intent, not a graded score.
-- ---------------------------------------------------------------------------

CREATE TABLE calibration_verdicts (
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  verdict text NOT NULL CHECK (verdict IN ('known', 'learn')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_state_ref, derived_node_id)
);

CREATE TABLE lesson_reads (
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  first_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_state_ref, derived_node_id)
);

-- ---------------------------------------------------------------------------
-- Response Log — the ONE irreversible commitment (R4–R6). Append-only: every
-- GRADED recall attempt is an immutable row. There is no UPDATE or DELETE path in
-- the store port; Admin Lab resubmission APPENDS new rows (R5). The append-only
-- invariant holds for the LOG; the mutable calibration_verdicts table above is the
-- explicit exception, kept separate by nature (KTD1). With the weighted self-report
-- sweep retired (R18), the log is graded-only: the `self_report` signal type, the
-- `self_report_rating` column, and the `evidence_weight` column are gone. The log
-- stores the derived_node_id as the skill. Field set is deliberately IRT- and BKT-
-- sufficient: `study_item_id` is the per-item IRT key, `derived_node_id` the
-- per-skill BKT key, and `attempt_seq` the monotonic-per-learner sequence both
-- fits need (R6). A per-learner reset (R16) is an explicit operator nuke that deletes
-- rows directly, never a store-port path — the append-only guarantee stands.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U2, KTD2, ADR-0037). A learner-owned,
-- optional, one-level support branch off a parent Concept Marker. NEVER neutral graph
-- knowledge: a generated step's content lives entirely on the step (payload-on-step jsonb),
-- and only a `reference` step points back at a neutral node. Steps are immutable once
-- published, so the neutral supersede lifecycle / partial unique indexes / citation CHECKs are
-- deliberately NOT mirrored here; the generation validator enforces the option-shape invariants
-- before the fenced atomic publish.
-- ---------------------------------------------------------------------------

CREATE TABLE learner_scaffold_detours (
  detour_id uuid PRIMARY KEY,
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  parent_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  -- The advertised term as displayed, plus its normalized form for the idempotency key.
  term text NOT NULL,
  normalized_term text NOT NULL,
  status text NOT NULL CHECK (status IN ('generating', 'ready', 'failed', 'hidden')),
  -- The current/last generation attempt's operation id, kept SEPARATE from the stable
  -- detour_id (KTD7): retry clears it and the next claim installs a fresh operation/fence UUID.
  latest_operation_id uuid,
  -- The fencing token that guards the terminal publish (KTD9). Null when not being generated.
  claim_token uuid,
  -- Bounded generation attempts + claim timestamp for the process-level supervisor (KTD7): the
  -- shared claim/top-up scheduler claims a stale-or-unclaimed generating detour up to a maximum
  -- attempt budget, then fails an exhausted one. Mirrors the topic expedition's claim columns.
  generation_attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One detour per (learner, enrichment, parent, normalized term) — the idempotency key
  -- (R5/R13). A repeated request for the same term restores rather than duplicating.
  UNIQUE (learner_state_ref, enrichment_id, parent_derived_node_id, normalized_term)
);

CREATE INDEX learner_scaffold_detours_active_idx
  ON learner_scaffold_detours (learner_state_ref, enrichment_id)
  WHERE status <> 'hidden';

CREATE TABLE learner_scaffold_steps (
  scaffold_step_id uuid PRIMARY KEY,
  detour_id uuid NOT NULL REFERENCES learner_scaffold_detours(detour_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  kind text NOT NULL CHECK (kind IN ('reference', 'generated')),
  -- A `reference` step points at an existing neutral node (R8/R9); its lesson-read and
  -- option-select evidence are NEUTRAL response_log rows and canonical mastery is unchanged.
  referenced_derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  -- A `generated` step's whole content home (payload-on-step): the micro-lesson + one
  -- option-select item, with stable scaffold node/item/option ids inside. Citation-free and
  -- labeled generated (R11, KTD10). Immutable once published.
  payload jsonb,
  -- Mutable: when the learner read this generated micro-lesson (R12). Null until read.
  lesson_read_at timestamptz,
  -- Exactly one of the two shapes (KTD2): a reference carries a node id and no payload; a
  -- generated step carries a payload and no reference.
  CHECK (
    (kind = 'reference' AND referenced_derived_node_id IS NOT NULL AND payload IS NULL)
    OR (kind = 'generated' AND referenced_derived_node_id IS NULL AND payload IS NOT NULL)
  ),
  UNIQUE (detour_id, ordinal)
);

CREATE TABLE response_log (
  response_id uuid PRIMARY KEY,
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  -- Discriminated response subject (plan 2026-07-12-002 U2, KTD4). Exactly one of the two
  -- shapes: the NEUTRAL pair (study_item_id + derived_node_id) — the only scope base mastery,
  -- leaderboard, recall-challenge, journal, and calibration folds consume — or the SCAFFOLD reference
  -- (scaffold_step_id → a GENERATED learner-scoped step). An existing-node reference step
  -- studies the real node and so records NEUTRAL rows; only generated steps produce scaffold
  -- rows. The subject columns are nullable and the CHECK enforces mutual exclusivity.
  study_item_id uuid REFERENCES study_items(study_item_id),
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  scaffold_step_id uuid REFERENCES learner_scaffold_steps(scaffold_step_id),
  signal_type text NOT NULL CHECK (signal_type IN ('graded')),
  judged_outcome text CHECK (judged_outcome IN ('correct', 'partial', 'incorrect')),
  graded_score real CHECK (graded_score >= 0 AND graded_score <= 1),
  response_source text NOT NULL CHECK (response_source IN ('synthetic', 'human')),
  grader_identity text,
  batch_id uuid,
  attempt_seq integer NOT NULL,
  submitted_answer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Outcome coherence: a graded row carries an outcome AND a score. Fail-closed at
  -- the DB so no incoherent row can ever enter the durable log.
  CHECK (signal_type = 'graded' AND judged_outcome IS NOT NULL AND graded_score IS NOT NULL),
  -- Exactly one subject scope (KTD4): a neutral pair OR a scaffold step, never both, never
  -- neither, never a mixed shape.
  CHECK (
    (study_item_id IS NOT NULL AND derived_node_id IS NOT NULL AND scaffold_step_id IS NULL)
    OR (study_item_id IS NULL AND derived_node_id IS NULL AND scaffold_step_id IS NOT NULL)
  ),
  UNIQUE (learner_state_ref, attempt_seq)
);

-- Flatten Response Log rows for Admin Lab inspection (R15, R16). A plain relational
-- projection — the log is normalized, not artifact-enveloped (it is learner state,
-- not a published artifact).
CREATE VIEW artifact_response_log AS
SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id, signal_type,
       judged_outcome, graded_score,
       response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
FROM response_log;

-- ---------------------------------------------------------------------------
-- Recall Challenges (plan 2026-07-13-003, KTD2). One challenge row per attempt over a
-- section/enrichment scope, an IMMUTABLE ordered lineup of neutral Study Item references,
-- and append-only idempotent events. Status is materialized here for indexed queries, but
-- the lineup + ordered events are the replayable authority for the miss buffer, unresolved
-- queue, recovery mode, and resume state. Challenge answers NEVER write `response_log`
-- (KTD4) — a checksum of that log is byte-identical across any challenge-only actions.
-- ---------------------------------------------------------------------------

CREATE TABLE recall_challenges (
  challenge_id uuid PRIMARY KEY,
  learner_state_ref text NOT NULL REFERENCES learners(learner_ref),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  scope_kind text NOT NULL CHECK (scope_kind IN ('section', 'enrichment')),
  -- Stable scope identity (KTD2): the section milestone node or the enrichment summit node —
  -- never a mutable section ordinal.
  scope_anchor_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  status text NOT NULL CHECK (status IN ('active', 'won', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active challenge per learner/scope (KTD2): divergent device sessions resume the SAME
-- durable history instead of forking it.
CREATE UNIQUE INDEX recall_challenges_one_active_per_scope
  ON recall_challenges (learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id)
  WHERE status = 'active';

CREATE INDEX recall_challenges_learner_enrichment_idx
  ON recall_challenges (learner_state_ref, enrichment_id, created_at DESC);

-- The immutable lineup: coverage-first selected Study Item references in fight order. The FK
-- targets the item's PRIMARY KEY, so a lineup survives Study Item Bank regeneration (the
-- superseded row stays hydratable by identity, KTD4).
CREATE TABLE recall_challenge_lineup (
  challenge_id uuid NOT NULL REFERENCES recall_challenges(challenge_id) ON DELETE CASCADE,
  lineup_index integer NOT NULL CHECK (lineup_index >= 0),
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  PRIMARY KEY (challenge_id, lineup_index),
  UNIQUE (challenge_id, study_item_id)
);

-- Append-only challenge events: selection answers, Matching pair attempts, and lifecycle
-- actions. `attempt_ref` (answers) and `operation_ref` (lifecycle) are client-created UUIDs
-- held across retries — the partial uniques make a network replay a no-op that returns the
-- already-committed view. `response_duration_ms` is bounded, client-observed, untrusted
-- reporting evidence only (KTD8): no runtime branch reads it.
CREATE TABLE recall_challenge_events (
  event_id uuid PRIMARY KEY,
  challenge_id uuid NOT NULL REFERENCES recall_challenges(challenge_id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  kind text NOT NULL CHECK (kind IN ('selection_answer', 'matching_pair', 'retreat', 'resume', 'abandon')),
  attempt_ref uuid,
  operation_ref uuid,
  study_item_id uuid REFERENCES study_items(study_item_id),
  prompt_id text,
  chosen_id text,
  correct boolean,
  recovery_phase boolean,
  response_duration_ms integer CHECK (response_duration_ms IS NULL OR (response_duration_ms >= 0 AND response_duration_ms <= 3600000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly two column shapes (KTD2): an answer event carries attempt/item/answer facts (a
  -- Matching pair attempt additionally its prompt), a lifecycle event only its operation ref.
  CHECK (
    (kind IN ('selection_answer', 'matching_pair')
      AND attempt_ref IS NOT NULL AND operation_ref IS NULL
      AND study_item_id IS NOT NULL AND chosen_id IS NOT NULL
      AND correct IS NOT NULL AND recovery_phase IS NOT NULL
      AND ((kind = 'matching_pair' AND prompt_id IS NOT NULL) OR (kind = 'selection_answer' AND prompt_id IS NULL)))
    OR
    (kind IN ('retreat', 'resume', 'abandon')
      AND operation_ref IS NOT NULL AND attempt_ref IS NULL
      AND study_item_id IS NULL AND prompt_id IS NULL AND chosen_id IS NULL
      AND correct IS NULL AND recovery_phase IS NULL AND response_duration_ms IS NULL)
  ),
  UNIQUE (challenge_id, seq)
);

CREATE UNIQUE INDEX recall_challenge_events_attempt_idempotency
  ON recall_challenge_events (challenge_id, attempt_ref)
  WHERE attempt_ref IS NOT NULL;

CREATE UNIQUE INDEX recall_challenge_events_operation_idempotency
  ON recall_challenge_events (challenge_id, operation_ref)
  WHERE operation_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Operation-agnostic run-stage timeline (ADR-0029). ONE shared
-- pair of tables describes the sub-stage timeline for ALL THREE operations
-- (extraction, minting, enrichment + study-items) so progress and the
-- bottleneck report read one source of truth. This DESCRIBES operations;
-- it does not unify them (ADR-0017's operation split is preserved). The
-- reporter writes these rows incrementally on its own autocommit statements,
-- NEVER enlisted in an operation's terminal artifact transaction, so an
-- in-flight or crashed run still leaves a readable timeline. The application
-- records TIME and stage names only — never a cost figure; per-stage cost
-- is read live from LiteLLM request logs at report time, joined through the
-- application Operation Timeline catalog's closed LLM stage vocabulary.
-- ---------------------------------------------------------------------------

CREATE TABLE operation_runs (
  operation_run_id uuid PRIMARY KEY,
  operation_type text NOT NULL CHECK (operation_type IN ('extraction', 'minting', 'enrichment', 'study_items', 'scaffold')),
  operation_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  current_stage text,
  progress_done integer,
  progress_total integer,
  last_progress_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (operation_type, operation_id)
);

CREATE TABLE operation_run_stages (
  operation_run_stage_id uuid PRIMARY KEY,
  operation_run_id uuid NOT NULL REFERENCES operation_runs(operation_run_id),
  stage text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ok boolean,
  progress_done integer,
  progress_total integer,
  -- Redacted, structured failure reason for a failed stage (ADR-0006 fail-closed, made
  -- inspectable): the forced-tool exhaustion attempt trail or a bounded `other` message.
  -- NULL for ok/open stages. Captured at the model-output boundary, never the raw args.
  error_detail jsonb
);

CREATE INDEX operation_run_stages_run_idx ON operation_run_stages(operation_run_id);
