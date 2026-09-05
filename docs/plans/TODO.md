# TODO

## TODO

_None._

## COMPLETED

- **Documentation hygiene (2026-09-05).** Consolidated ADRs and linked workflow documentation into
  canonical owners, preserving project constraints and repairing stale references.
- **Researched Expedition catalog (2026-09-01).** Catalog cutover and learner-first/source review
  evidence remain in commits `28f325f`, `e10515d`, and `eba37f5`. The preceding full validation
  record is preserved in `7b88a36`.

## VALIDATION

### Documentation hygiene — 2026-09-05

- `git diff --check` and a one-off Node audit of all tracked Markdown links, anchors, and indexes
  passed. The audit resolved a known valid link and detected in-memory missing-target and
  missing-heading controls. The retired-reference search used surviving ADR references as its
  positive control.
- `pnpm content:check` qualified all five Expeditions at catalog revision `1c29d8c2…d78e9ff`.
- Evidence covers documentation consistency and content structure. Runtime, DB, browser, native,
  deployed, and physical-device gates were not run for this documentation-only change.
