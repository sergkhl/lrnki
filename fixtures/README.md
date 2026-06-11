# Curated fixtures

Stable English-language sources for integration quality runs. Generated artifacts belong under `tmp/`, not here.

## Canonical fixture matrix

Two gates (decided 2026-06-11): Gate 1 exercises the full pipeline through native parsers across three domains; Gate 2 adds Docling formats and freezes the ADR-0013 oracle suite.

### Gate 1 — first real-use quality run (native parsers)

| # | Source | Domain | Format | License | Status |
|---|--------|--------|--------|---------|--------|
| 1 | *The Rust Programming Language*, ch. 4.1 "What Is Ownership?" | Software engineering | Markdown | MIT/Apache-2.0 | `markdown/rust-book-ch04-01-what-is-ownership.md` ✓ |
| 2 | OpenStax *Biology 2e*, §14.3 "Basics of DNA Replication" | Molecular biology | HTML | CC BY 4.0 | `html/openstax-biology-2e-14-3-dna-replication.html` ✓ |
| 3 | Adam Smith, *The Wealth of Nations*, Book I ch. I–III (Project Gutenberg) | Economics | Plaintext | Public domain | `plaintext/wealth-of-nations-book1-ch1-3.txt` ✓ |

Fixture 3 is a deliberate robustness probe: long-paragraph 18th-century prose, no structural markup.

Each fixture file is pure source content. Declared Domain (ADR-0015) and provenance live in
`fixtures/manifest.json`, which `worker:kg register-from-manifest` reads — never parsed from file
content, so the content hash stays stable.

### Gate 2 — frozen mixed-format oracle suite (adds Docling)

| # | Source | Domain | Format | License | Status |
|---|--------|--------|--------|---------|--------|
| 4 | CoDA: Towards Effective Cross-domain Knowledge Transfer via CoT-guided Domain Adaptation | Computer science | PDF | arXiv | `pdf/2604.19488v1.pdf` ✓ |
| 5 | FEMA Independent Study course document (or GOV.UK statutory-guidance DOCX) | Emergency management / law | DOCX | Public domain / OGL | to add |
| 6 | CDC *Principles of Epidemiology in Public Health Practice* lecture slides | Healthcare | PPTX | Public domain (US gov) | to add |

Caveat: fixture 4 is an ML paper processed by an ML pipeline — extractor familiarity makes its scores a best-case bound, never the headline number.

## Layout

One subdirectory per format: `pdf/`, `html/`, `markdown/`, `plaintext/`, `docx/`, `pptx/`. Each fixture is registered with its Declared Domain (ADR-0015) and content hash before any extraction run.
