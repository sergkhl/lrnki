# Curated fixtures

Stable English-language sources for integration quality runs. Generated artifacts belong under `tmp/`, not here.

## Project-authored diagnostic sources

[`diagnostic-manifest.json`](./diagnostic-manifest.json) registers a compact source-backed workflow
suite authored for lrnki. It supplements the real-source quality matrix below; it does not replace
representative real Curated Source inspection or act as a standing semantic oracle under ADR-0013.

| Source | Domain | Format | Diagnostic pressure |
|--------|--------|--------|---------------------|
| *Harbor Dispatch Core Protocol* | Harbor operations | Markdown | Carrier versus referent, expiring authority, conditional scope, and one intentionally undefined prerequisite |
| *North Quay Tide Margin Supplement* | Harbor operations | HTML | A second Curated Source supplies the missing prerequisite, distinguishes related quantities, and limits a threshold to one context |
| *North Quay Release Definitions Addendum* | Harbor operations | Markdown | Later source-supplied teaching-unit completion plus a non-title operator-handbook carrier negative |
| *Islanded Microgrid Reserve Procedure* | Microgrid operations | Plaintext | Mode-qualified rules, measurement versus measured state, emergency exception, and ordered recovery |
| *Archive Frame Encoding* | Data serialization | Markdown | Octet, Unicode scalar, and grapheme distinctions; equal-value non-equivalence; checksum scope |

The harbor set is the source-acquisition handoff example. The core protocol alone names Tide Margin
without defining its calculation; the first supplement supplies it. The definitions addendum models
later source-supplied gap closure and distinguishes the operator handbook carrier from its operational
referents. Each addition enters through the same Curated Source interface: tests must not inject its
text directly into a model prompt or treat a mention as a definition.

These files are intentionally short enough for direct artifact inspection. Their prose may expose a
candidate verifier or generator defect, but a fixed expected neural output must not become a
deterministic quality oracle. Prompt and forced-tool descriptions remain domain-neutral and must not
name these fixture concepts or expected outcomes.

## Canonical fixture matrix

Two gates (decided 2026-06-11, clarified 2026-06-16): Gate 1 exercises the
full pipeline through native parsers across the manifest-backed native fixture
batch; Gate 2 adds Docling mixed formats. Quality is judged by representative
real-source inspection (rule-14), not a standing oracle benchmark — the off-core
oracle triangle and label aligner were retired after the admission-precision fix
(ADR-0013).

### Gate 1 — first real-use quality run (native parsers)

| # | Source | Domain | Format | License | Status |
|---|--------|--------|--------|---------|--------|
| 1 | *The Rust Programming Language*, ch. 4.1 "What Is Ownership?" | Software engineering | Markdown | MIT/Apache-2.0 | `markdown/rust-book-ch04-01-what-is-ownership.md` ✓ |
| 2 | OpenStax *Biology 2e*, §14.3 "Basics of DNA Replication" | Molecular biology | HTML | CC BY 4.0 | `html/openstax-biology-2e-14-3-dna-replication.html` ✓ |
| 3 | Adam Smith, *The Wealth of Nations*, Book I ch. I–III (Project Gutenberg) | Economics | Plaintext | Public domain | `plaintext/wealth-of-nations-book1-ch1-3.txt` ✓ |
| 4 | AlRabah et al., *InstructKG: Instructor-Aligned Knowledge Graphs for Personalized Learning* (arXiv 2602.17111v1) | Educational technology | Markdown | arXiv preprint | `markdown/datalab-output-2602.17111v1.pdf.md` ✓ |

Fixture 3 is a deliberate robustness probe: long-paragraph 18th-century prose, no structural markup.
Fixture 4 is a native Markdown parser stress fixture: the Markdown was converted
ahead of time during curation, then registered and parsed as `text/markdown`.
It is not a Gate 2 Docling-at-ingestion fixture.

Each fixture file is pure source content. Declared Domain (ADR-0015) and provenance live in
`fixtures/manifest.json`, which `worker:kg register-from-manifest` reads — never parsed from file
content, so the content hash stays stable.

### Gate 2 — mixed-format curated suite (adds Docling)

| # | Source | Domain | Format | License | Status |
|---|--------|--------|--------|---------|--------|
| 1 | Toledo et al., *AI Research Agents for Machine Learning* (arXiv 2507.02554v2) | Machine learning systems | PDF | arXiv preprint | `pdf/2507.02554v2.pdf` ✓ (Docling-ingested, run `9b92bd64`) |
| 2 | FEMA Independent Study course document (or GOV.UK statutory-guidance DOCX) | Emergency management / law | DOCX | Public domain / OGL | to add |
| 3 | CDC *Principles of Epidemiology in Public Health Practice* lecture slides | Healthcare | PPTX | Public domain (US gov) | to add |

Fixtures 4–6 are converted by the version-pinned Docling adapter (`docling-serve-cpu` v1.23.0 +
`docling` 2.102.1) over HTTP: async submit→poll→fetch, OCR off, table structure off (tables are
non-teachable placeholders), figures as `<!-- image -->` placeholders. The converted Markdown runs
through the same shared structure pass as the native parsers. Conversion is one-time per fixture;
extraction/build/enrichment replay off the stored blocks.

Caveat: fixture 4 is an ML paper processed by an LLM extraction pipeline — extractor familiarity
makes its scores a best-case bound, never the headline number. PDF→Markdown of math-heavy text also
introduces token-spacing artifacts, an inherent layout-extraction limit.

## Layout

One subdirectory per format: `pdf/`, `html/`, `markdown/`, `plaintext/`, `docx/`, `pptx/`. Each fixture is registered with its Declared Domain (ADR-0015) and content hash before any extraction run.
