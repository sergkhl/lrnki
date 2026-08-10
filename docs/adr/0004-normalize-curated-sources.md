# Normalize curated sources into Structured Documents

Status: Accepted

## Decision

Every Curated Source enters the core through a format adapter that produces source-located Structured
Document blocks. Extraction consumes that normalized representation rather than raw files, so quote
provenance stays stable while format-specific parsing remains outside the core.

## Context

The extraction pipeline has concrete text, HTML, and document-parser consumers. A normalized,
location-preserving seam lets them share one evidence contract without teaching domain modules about
file formats.
