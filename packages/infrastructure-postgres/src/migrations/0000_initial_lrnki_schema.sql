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
  cost_usd real,
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

-- Flatten study-item-bank artifact payloads: one row per typed Study Item with its
-- item type, derived node, grounding provenance, question, self-report prompt (null for
-- option_select), and a citation/option count, for Admin Lab inspection (R7, R15). Reads
-- the immutable `study_item_bank` artifact the Study Item Bank store writes beside its
-- normalized rows.
CREATE VIEW artifact_study_items AS
SELECT a.graph_version_id, si.study_item_id, si.item_type, si.enrichment_id, si.derived_node_id,
       si.grounding_provenance, si.question, si.self_report_prompt, si.citation_count, si.option_count
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
    self_report_prompt text PATH '$.selfReportPrompt',
    citation_count integer PATH '$.citations.size()',
    option_count integer PATH '$.options.size()'
  )
) AS si
WHERE a.artifact_type = 'study_item_bank';

-- ---------------------------------------------------------------------------
-- Graph Enrichment — third operation, derived layer keyed to a published
-- version (ADR-0019). LLM-proposed, symbolically constrained; never mutates the
-- asserted core. Inferred relations live in their OWN namespace and intentionally
-- do NOT reference relation_definitions (the closed asserted registry, ADR-0016).
-- ---------------------------------------------------------------------------

CREATE TABLE graph_enrichments (
  enrichment_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
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
  role text NOT NULL CHECK (role IN ('anchor', 'prerequisite')),
  canonical_label text NOT NULL,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  aliases jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrichment_id, concept_id),
  CHECK (
    (node_kind = 'anchor' AND concept_id IS NOT NULL AND grounding_origin = 'document_anchored' AND role = 'anchor')
    OR
    (node_kind = 'enrichment' AND concept_id IS NULL AND grounding_origin IN ('source_mentioned', 'llm_grounded') AND role = 'prerequisite')
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
  -- for any pair touching an llm_grounded node, the validated DeepSeek alias otherwise.
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
-- Learner Path — vertical-slice projection output (ADR-0019). CLI computes and
-- persists; the Admin Lab Cytoscape view renders read-only (ADR-0011, rule 12).
-- ---------------------------------------------------------------------------

-- The learner path spans the DERIVED node space (anchors ∪ enrichment nodes), so its
-- target and step endpoints reference derived_graph_nodes, not the asserted concepts
-- table (U7 FK repoint). A target may be an anchor or — once minting/rescue run — an
-- enrichment node; the asserted layer is still never mutated (R5).
CREATE TABLE learner_paths (
  learner_path_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  target_derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  learner_state_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrichment_id, target_derived_node_id, learner_state_ref)
);

CREATE TABLE learner_path_steps (
  learner_path_step_id uuid PRIMARY KEY,
  learner_path_id uuid NOT NULL REFERENCES learner_paths(learner_path_id),
  position integer NOT NULL,
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  difficulty real NOT NULL,
  included_reason text NOT NULL CHECK (included_reason IN ('prerequisite', 'target')),
  UNIQUE (learner_path_id, position),
  UNIQUE (learner_path_id, derived_node_id)
);

-- ---------------------------------------------------------------------------
-- Learner Study Loop — learner-neutral typed Study Item Bank keyed to the Derived
-- Graph Layer (R7, R12, ADR-0026). At most one item PER TYPE per derived node
-- (UNIQUE (derived_node_id, item_type)), conditioned on that node's grounding. Items
-- retain graph_version_id for publication scope and key their subject on
-- derived_node_id so anchors and enrichment nodes share one identity space.
-- Regenerable; never mutates the asserted core or the Derived Graph Layer.
-- ---------------------------------------------------------------------------

CREATE TABLE study_items (
  study_item_id uuid PRIMARY KEY,
  item_type text NOT NULL CHECK (item_type IN ('self_assessment', 'option_select')),
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  grounding_provenance text NOT NULL CHECK (grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')),
  question text NOT NULL,
  answer_key text,
  self_report_prompt text,
  generating_model text NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Type coherence: a self_assessment item carries an answer_key + self_report_prompt
  -- (calibration reads them); an option_select item carries NEITHER — its content lives
  -- in study_item_options. Fail closed at the DB so no incoherent typed row can enter.
  CHECK (
    (item_type = 'self_assessment' AND answer_key IS NOT NULL AND self_report_prompt IS NOT NULL)
    OR
    (item_type = 'option_select' AND answer_key IS NULL AND self_report_prompt IS NULL)
  ),
  UNIQUE (derived_node_id, item_type)
);

-- Options for option_select items (R9). Exactly one is_correct per item, enforced by the
-- deterministic guard at build time (U2). `ordinal` preserves a stable render order.
-- The correct option's grounding lives in study_item_citations; distractors are
-- generated and carry none. Cascade so item regeneration (delete-then-insert) clears
-- options too.
CREATE TABLE study_item_options (
  option_id uuid PRIMARY KEY,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  option_text text NOT NULL,
  is_correct boolean NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('source', 'generated')),
  UNIQUE (study_item_id, ordinal)
);

-- Grounded-answer citations are provenance-tagged. They back the self_assessment answer
-- key and the option_select correct answer alike, keyed by study_item_id. Source
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
  derived_node_id uuid REFERENCES derived_graph_nodes(derived_node_id),
  generated_passage_text text,
  CHECK (
    (provenance = 'source' AND source_resource_id IS NOT NULL AND source_block_id IS NOT NULL AND evidence_quote IS NOT NULL AND derived_node_id IS NULL AND generated_passage_text IS NULL)
    OR
    (provenance = 'generated' AND source_resource_id IS NULL AND source_block_id IS NULL AND evidence_quote IS NULL AND derived_node_id IS NOT NULL AND generated_passage_text IS NOT NULL)
  )
);

-- Derived nodes that yielded NO study item at all (no usable grounding), recorded as a
-- durable fact (not a transient log line). A node that grounds a self_assessment item but
-- fails to yield an option_select item is NOT here — it simply lacks that type and the
-- frontier surfaces it as cardless-for-studying (R13). Regeneration replaces an
-- enrichment's rejections alongside its items. The no-item frontier fallback reads
-- `reason` instead of guessing from grounding origin.
CREATE TABLE rejected_study_items (
  rejected_study_item_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
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
-- intent per (learner, node), so it is naturally upsert/delete. Revealing a node's
-- answer and tapping "I knew it" writes `known`; "I forgot" writes `learn`. Reversal
-- (R7) is a single-row delete/overwrite — no append-only seeded rows to reconcile.
-- The trusted-edge prerequisite down-closure of the `known` set is derived at read
-- time (not materialized), so this table holds only the direct verdicts. There are
-- no evidence weights (rule 18): a verdict is a discrete intent, not a graded score.
-- ---------------------------------------------------------------------------

CREATE TABLE calibration_verdicts (
  learner_state_ref text NOT NULL,
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
  verdict text NOT NULL CHECK (verdict IN ('known', 'learn')),
  updated_at timestamptz NOT NULL DEFAULT now(),
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

CREATE TABLE response_log (
  response_id uuid PRIMARY KEY,
  learner_state_ref text NOT NULL,
  study_item_id uuid NOT NULL REFERENCES study_items(study_item_id),
  derived_node_id uuid NOT NULL REFERENCES derived_graph_nodes(derived_node_id),
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
  UNIQUE (learner_state_ref, attempt_seq)
);

-- Flatten Response Log rows for Admin Lab inspection (R15, R16). A plain relational
-- projection — the log is normalized, not artifact-enveloped (it is learner state,
-- not a published artifact).
CREATE VIEW artifact_response_log AS
SELECT response_id, learner_state_ref, study_item_id, derived_node_id, signal_type,
       judged_outcome, graded_score,
       response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
FROM response_log;
