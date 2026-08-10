# Resolve cross-source Concept identity within Declared Domains

Status: Accepted

## Decision

Every Curated Source has a human-assigned Declared Domain. Concepts merge on exact normalized labels
within that scope or through an explicit adjudicated semantic-identity decision under
[ADR-0012](0012-embeddings-permitted-except-prerequisite-derivation.md); every merge is recorded.

The same label in different Declared Domains remains separate and is flagged as a homograph rather
than quarantined. Quarantine is reserved for unresolved identity or meaning conflicts within one
scope. Candidate Discovery is not alias authority: only source-grounded admitted labels or later
identity decisions create aliases.

Concept IRIs are readable identifiers minted once at first publication and retained when labels
change.

## Context

Exact-label-only identity fragments same-domain synonyms, while global label identity collapses
homographs. Domain-scoped, recorded adjudication keeps publication conservative without making each
source a permanent island.
