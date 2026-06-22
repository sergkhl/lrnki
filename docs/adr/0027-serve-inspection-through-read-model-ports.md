# ADR-0027: Serve inspection through read-model ports; serve learner projection through application use-cases

## Status

Accepted (2026-06-22). First slice landed: Run + Source inspection now served through
`RunInspectionReadPort` / `SourceInspectionReadPort` via the `PostgresInspectionRead`
adapter; no Admin Lab SQL remains on those surfaces. The remaining inspection reads
(`enrichments.ts`, `learnerPaths.ts`, `learnerLoop.ts`, Derived Graph Layer) and the (B)
projection use-cases are follow-up slices.

## Decision

Admin Lab inspection reads — Extraction Run, Source, and Derived Graph Layer inspection —
are served by read-only **read-model ports** that return a finished **Inspection Read
Model**. The storage adapter owns all queries and verbatim row-stitching; no UI embeds SQL.
Inspection Read Model types live in the `ports` contract.

Learner-facing **projection** surfaces — which fuse persisted reads with adaptation compute
(node classification, frontier selection, mastery, path projection) — are served by
`application` use-cases, not ports, so the read-and-compute fusion lives behind one seam that
both the Admin Lab and the forthcoming learner app consume. Projection types live in the
`application` layer.

Neither path admits raw query shapes into a UI.

The adapter returns data or `undefined`-for-not-found only; real DB errors propagate (to the
Next.js error boundary) instead of being silently rendered as empty. The "no `DATABASE_URL`
→ demo/empty" fallback stays a thin UI shell.

## Context

The `application` layer exposed only write/compute use-cases, so the Admin Lab reached past it
into Postgres with raw `JSON_TABLE` SQL for every read, and re-derived learner-neutral
computations the core already owns.

A single blanket "read-model port" refactor would be wrong. Pure inspection reads have no
compute and are admin-only: a finished read-model port matches the existing
graph/enrichment/path store idiom, and a passthrough `application` use-case over them would be
a shallow layer. Learner projection reads are read-and-compute fused and are shared with a
coming learner app: leaving them as finished-model ports would push the fusion — and the same
raw-read leak — into each consuming app instead of behind one seam.

Splitting by surface keeps the shared `ports`/`domain-core` contract free of either app's
presentation shapes (AGENTS rule 3) while giving both apps one `application` front door for
projection. Inspection reads are stabilized first; the projection use-cases follow once the
projection workflow settles, and absorb the learner-neutral computations currently re-derived
in the UI.

## Consequences

- Admin-presentation types (`RunSummary`, `RunInspection`, `RunProfile`, `ProfilePassage`,
  `ProfileAssertion`, `SourceSummary`, `SourceInspection`) live in `packages/ports`. This is an
  accepted, bounded cost of choice (A); projection types go to `application` under (B).
- A malformed route param (non-UUID run/source id) now surfaces a DB error via the error
  boundary rather than a silent 404; valid-but-absent ids still 404. This is the deliberate
  error-policy change above.
