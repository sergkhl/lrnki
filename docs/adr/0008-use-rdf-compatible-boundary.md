# Use an RDF-compatible ontology boundary without an RDF-first runtime

Status: Accepted

## Decision

Assign stable internal Concept IRIs. Do not introduce a triplestore, SPARQL endpoint, or general OWL reasoner in the MVP, and keep no standing JSON-LD export utility — an exporter is introduced only when a real consumer exists (the unused export sidecar was removed 2026-07-17 after a zero-consumer scan).
