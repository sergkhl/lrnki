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
  tier text NOT NULL CHECK (tier IN ('core', 'optional', 'reject', 'quarantine')),
  independently_meaningful boolean NOT NULL,
  independently_teachable boolean NOT NULL,
  durable_beyond_source boolean NOT NULL,
  reason_codes jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE run_claims (
  run_claim_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  subject_candidate_id uuid NOT NULL REFERENCES concept_candidates(concept_candidate_id),
  predicate text NOT NULL REFERENCES relation_definitions(predicate),
  object_kind text NOT NULL CHECK (object_kind IN ('concept', 'literal')),
  object_candidate_id uuid REFERENCES concept_candidates(concept_candidate_id),
  object_literal jsonb,
  model_confidence real NOT NULL CHECK (model_confidence >= 0 AND model_confidence <= 1),
  evidence_count integer NOT NULL,
  validation_outcome text NOT NULL CHECK (validation_outcome IN ('verified', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((object_kind = 'concept' AND object_candidate_id IS NOT NULL) OR (object_kind = 'literal' AND object_literal IS NOT NULL))
);

CREATE TABLE run_claim_evidence (
  run_claim_evidence_id uuid PRIMARY KEY,
  run_claim_id uuid NOT NULL REFERENCES run_claims(run_claim_id),
  source_block_id uuid NOT NULL REFERENCES source_blocks(source_block_id),
  evidence_quote text NOT NULL
);

CREATE TABLE missing_concept_proposals (
  missing_concept_proposal_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  proposed_label text NOT NULL,
  rationale text NOT NULL,
  source_block_id uuid REFERENCES source_blocks(source_block_id),
  evidence_quote text,
  created_at timestamptz NOT NULL DEFAULT now()
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
  canonical_label text NOT NULL,
  normalized_label text NOT NULL,
  declared_domain text NOT NULL,
  trust_tier text NOT NULL,
  homograph boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_label, declared_domain)
);

CREATE TABLE concept_aliases (
  concept_alias_id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  label text NOT NULL,
  UNIQUE (concept_id, label)
);

CREATE TABLE graph_version_concept_memberships (
  graph_version_concept_membership_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  UNIQUE (graph_version_id, concept_id)
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

-- Flatten admission-decision artifact payloads for Admin Lab run inspection.
CREATE VIEW artifact_admission_decisions AS
SELECT a.artifact_id, a.run_id, decision.candidate_key, decision.tier, decision.confidence
FROM artifact_versions a,
JSON_TABLE(
  a.payload,
  '$.decisions[*]'
  COLUMNS (
    candidate_key text PATH '$.candidateId',
    tier text PATH '$.tier',
    confidence numeric PATH '$.confidence'
  )
) AS decision
WHERE a.artifact_type = 'concept_admission.v1';
