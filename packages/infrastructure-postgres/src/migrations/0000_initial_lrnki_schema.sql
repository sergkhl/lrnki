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
-- Closed relation registry (ADR-0016) — models choose, humans extend
-- ---------------------------------------------------------------------------

CREATE TABLE relation_definitions (
  relation_definition_id uuid PRIMARY KEY,
  iri text NOT NULL UNIQUE,
  predicate text NOT NULL UNIQUE,
  description text NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN ('concept', 'literal')),
  constraints jsonb NOT NULL
);

INSERT INTO relation_definitions (relation_definition_id, iri, predicate, description, object_kind, constraints) VALUES
  (gen_random_uuid(), 'https://lrnki.local/relation/is-a', 'is-a', 'Subject concept is a kind of the object concept.', 'concept', '{}'::jsonb),
  (gen_random_uuid(), 'https://lrnki.local/relation/part-of', 'part-of', 'Subject concept is a constituent part of the object concept.', 'concept', '{}'::jsonb),
  (gen_random_uuid(), 'https://lrnki.local/relation/asserted-prerequisite-of', 'asserted-prerequisite-of', 'The source explicitly states the subject concept is a prerequisite of the object concept.', 'concept', '{}'::jsonb),
  (gen_random_uuid(), 'https://lrnki.local/relation/contrasts-with', 'contrasts-with', 'Subject concept is explicitly contrasted with the object concept.', 'concept', '{}'::jsonb),
  (gen_random_uuid(), 'https://lrnki.local/relation/uses', 'uses', 'Subject concept uses or depends on the object concept.', 'concept', '{}'::jsonb),
  (gen_random_uuid(), 'https://lrnki.local/relation/defined-as', 'defined-as', 'Subject concept is defined as the literal value.', 'literal', '{}'::jsonb);

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

CREATE TABLE graph_versions (
  graph_version_id uuid PRIMARY KEY,
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

CREATE TABLE published_claims (
  published_claim_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  subject_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  predicate text NOT NULL REFERENCES relation_definitions(predicate),
  object_kind text NOT NULL CHECK (object_kind IN ('concept', 'literal')),
  object_concept_id uuid REFERENCES concepts(concept_id),
  object_literal jsonb,
  trust_tier text NOT NULL,
  model_confidence real NOT NULL CHECK (model_confidence >= 0 AND model_confidence <= 1),
  evidence_count integer NOT NULL,
  contradiction_state text NOT NULL CHECK (contradiction_state IN ('none', 'possible', 'material'))
);

CREATE TABLE published_claim_evidence (
  published_claim_evidence_id uuid PRIMARY KEY,
  published_claim_id uuid NOT NULL REFERENCES published_claims(published_claim_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL
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
  embedding_model text NOT NULL,
  judge_model text NOT NULL,
  difficulty_method text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE enrichment_prerequisite_candidate_groups (
  enrichment_prerequisite_candidate_group_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  group_id text NOT NULL,
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  UNIQUE (enrichment_id, concept_id)
);

CREATE TABLE inferred_prerequisite_edges (
  inferred_prerequisite_edge_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  predicate text NOT NULL DEFAULT 'inferred-prerequisite-of',
  prerequisite_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  dependent_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  uncertain boolean NOT NULL DEFAULT false,
  candidate_group_id text,
  provenance jsonb NOT NULL,
  UNIQUE (enrichment_id, prerequisite_concept_id, dependent_concept_id),
  CHECK (prerequisite_concept_id <> dependent_concept_id)
);

CREATE TABLE concept_difficulties (
  concept_difficulty_id uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  score real NOT NULL,
  method text NOT NULL,
  components jsonb NOT NULL,
  UNIQUE (enrichment_id, concept_id)
);

-- ---------------------------------------------------------------------------
-- Learner Path — vertical-slice projection output (ADR-0019). CLI computes and
-- persists; the Admin Lab Cytoscape view renders read-only (ADR-0011, rule 12).
-- ---------------------------------------------------------------------------

CREATE TABLE learner_paths (
  learner_path_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  enrichment_id uuid NOT NULL REFERENCES graph_enrichments(enrichment_id),
  target_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  learner_state_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrichment_id, target_concept_id, learner_state_ref)
);

CREATE TABLE learner_path_steps (
  learner_path_step_id uuid PRIMARY KEY,
  learner_path_id uuid NOT NULL REFERENCES learner_paths(learner_path_id),
  position integer NOT NULL,
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  difficulty real NOT NULL,
  included_reason text NOT NULL CHECK (included_reason IN ('prerequisite', 'target')),
  UNIQUE (learner_path_id, position),
  UNIQUE (learner_path_id, concept_id)
);
