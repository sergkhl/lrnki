CREATE TABLE source_resources (
  source_resource_id uuid PRIMARY KEY,
  content_hash text NOT NULL UNIQUE,
  content_type text NOT NULL,
  object_key text NOT NULL,
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
  block_type text NOT NULL,
  text text NOT NULL,
  heading_path jsonb NOT NULL,
  locator jsonb NOT NULL
);

CREATE TABLE extraction_runs (
  run_id uuid PRIMARY KEY,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE graph_versions (
  graph_version_id uuid PRIMARY KEY,
  status text NOT NULL,
  published_at timestamptz
);

CREATE TABLE concept_candidates (
  concept_candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES extraction_runs(run_id),
  canonical_label text NOT NULL,
  aliases jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE concepts (
  concept_id uuid PRIMARY KEY,
  iri text NOT NULL UNIQUE,
  canonical_label text NOT NULL,
  trust_tier text NOT NULL
);

CREATE TABLE graph_version_memberships (
  graph_version_membership_id uuid PRIMARY KEY,
  graph_version_id uuid NOT NULL REFERENCES graph_versions(graph_version_id),
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  UNIQUE (graph_version_id, concept_id)
);

CREATE TABLE concept_aliases (
  concept_alias_id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  label text NOT NULL,
  accepted boolean NOT NULL DEFAULT false
);

CREATE TABLE relation_definitions (
  relation_definition_id uuid PRIMARY KEY,
  iri text NOT NULL UNIQUE,
  predicate text NOT NULL UNIQUE,
  description text NOT NULL,
  constraints jsonb NOT NULL
);

CREATE TABLE concept_claims (
  claim_id uuid PRIMARY KEY,
  subject_concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  predicate text NOT NULL,
  object jsonb NOT NULL,
  scope text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  contradiction_state text NOT NULL CHECK (contradiction_state IN ('none', 'possible', 'material'))
);

CREATE TABLE claim_evidence (
  claim_evidence_id uuid PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES concept_claims(claim_id),
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

CREATE TABLE ontology_terms (
  ontology_term_id uuid PRIMARY KEY,
  iri text NOT NULL UNIQUE,
  term_type text NOT NULL,
  label text NOT NULL,
  metadata jsonb NOT NULL
);

CREATE TABLE external_ontology_mappings (
  external_ontology_mapping_id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES concepts(concept_id),
  external_iri text NOT NULL,
  mapping_type text NOT NULL CHECK (mapping_type IN ('exact_match', 'close_match', 'broad_match', 'narrow_match', 'related_match')),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  provenance jsonb NOT NULL
);

CREATE TABLE artifact_versions (
  artifact_id uuid PRIMARY KEY,
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

CREATE VIEW artifact_concept_candidates AS
SELECT artifact_id, candidate_id, canonical_label, proposed_tier
FROM artifact_versions,
JSON_TABLE(
  payload,
  '$.candidates[*]'
  COLUMNS (
    candidate_id text PATH '$.candidateId',
    canonical_label text PATH '$.canonicalLabel',
    proposed_tier text PATH '$.proposedTier'
  )
) AS candidate
WHERE artifact_type = 'concept_candidate_pool.v1';
