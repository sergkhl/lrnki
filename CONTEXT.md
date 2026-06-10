# Lrnki Greenfield Context

## Product boundary

Lrnki builds a Learner-Neutral Core Concept Graph from curated learning resources. The static graph contains durable, independently meaningful, independently teachable concepts and typed, evidence-backed claims. Learner-specific mastery, sequencing, and personalization remain downstream and are intentionally deferred.

## Current scope

The initial application contains five deep modules:

1. Structured Source Ingestion
2. Concept Admission
3. Concept-Conditioned Claim Extraction
4. Static Graph Refinement
5. Atomic Graph Publication

Admin Lab is retained as the minimal operational interface for source, run, candidate, claim, graph-version, and artifact exploration.

## Persistence

PostgreSQL 18 is the only required database. Published graph state is normalized relational data. Run artifacts are immutable JSONB envelopes and expose JSON_TABLE inspection views.

## LLM contract

All structured model responses use forced named tool schemas through LiteLLM aliases. Free-form JSON output is not an application contract. Tool arguments are validated locally and evidence quotes are checked deterministically against stored source blocks.

## Ontology boundary

The operational graph is relational. RDF compatibility is an export and alignment boundary: stable internal IRIs, lightweight SKOS-compatible mappings, provenance projection, JSON-LD export, and optional SHACL checks. A triplestore, SPARQL endpoint, and general OWL reasoner are not MVP dependencies.
