-- Single initial migration (AGENTS rule 8). Reset local state rather than adding migrations.

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
-- literal; `explicit-prerequisite-hint` references an admitted Concept candidate.
CREATE TABLE run_optional_assertions (
  run_optional_assertion_id uuid PRIMARY KEY,
  run_concept_evidence_profile_id uuid NOT NULL REFERENCES run_concept_evidence_profiles(run_concept_evidence_profile_id),
  assertion_type text NOT NULL CHECK (assertion_type IN ('defines', 'explicit-prerequisite-hint')),
  literal_value text,
  object_candidate_id uuid REFERENCES concept_candidates(concept_candidate_id),
  CHECK ((assertion_type = 'defines' AND literal_value IS NOT NULL) OR (assertion_type = 'explicit-prerequisite-hint' AND object_candidate_id IS NOT NULL))
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
-- `defines` carries a literal; `explicit-prerequisite-hint` references a published
-- Concept whose target was present in the same graph version.
CREATE TABLE graph_version_optional_assertions (
  graph_version_optional_assertion_id uuid PRIMARY KEY,
  graph_version_concept_evidence_profile_id uuid NOT NULL REFERENCES graph_version_concept_evidence_profiles(graph_version_concept_evidence_profile_id),
  assertion_type text NOT NULL CHECK (assertion_type IN ('defines', 'explicit-prerequisite-hint')),
  literal_value text,
  object_concept_id uuid REFERENCES concepts(concept_id),
  CHECK ((assertion_type = 'defines' AND literal_value IS NOT NULL) OR (assertion_type = 'explicit-prerequisite-hint' AND object_concept_id IS NOT NULL))
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
  schema_version text NOT NULL,
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
       c.established_domain_meaning, c.organizing_power, c.core_selected,
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
    organizing_power jsonb PATH '$.admission.organizingPower',
    core_selected boolean PATH '$.admission.coreSelected',
    selection_reason_code text PATH '$.admission.selectionReasonCode',
    reason_codes jsonb PATH '$.admission.reasonCodes',
    boundary_reason_codes jsonb PATH '$.admission.boundaryReasonCodes',
    confidence numeric PATH '$.admission.confidence'
  )
) AS c
WHERE a.artifact_type = 'extraction_run.v5';

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
WHERE a.artifact_type = 'extraction_run.v5';

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
WHERE a.artifact_type = 'graph_snapshot.v2';

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
WHERE a.artifact_type = 'graph_snapshot.v2';

-- Flatten graph-snapshot typed assertions: one row per optional assertion inside a
-- published CEP, for inspecting guarded `defines` / `explicit-prerequisite-hint`.
CREATE VIEW artifact_graph_cep_assertions AS
SELECT a.graph_version_id, t.concept_id, t.assertion_type,
       t.literal_value, t.object_concept_id
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.evidenceProfiles[*]'
  COLUMNS (
    concept_id text PATH '$.conceptId',
    NESTED PATH '$.assertions[*]' COLUMNS (
      assertion_type text PATH '$.type',
      literal_value text PATH '$.literalValue',
      object_concept_id text PATH '$.objectConceptId'
    )
  )
) AS t
WHERE a.artifact_type = 'graph_snapshot.v2' AND t.assertion_type IS NOT NULL;

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
WHERE a.artifact_type = 'enrichment_run.v2';

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
  UNIQUE (enrichment_id, derived_node_id)
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
