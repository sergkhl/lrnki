# TODO

## TODO

- **Re-author all five Expeditions from online research — in progress in Unit 6.** Unit 1 established
  the final schema-v2 contract. Critical Thinking revision `dc27a643…e55b43`, Probability and
  Statistics revision `9be3bb79…7978d1`, and Personal Finance revision `767d26bc…7452f9a` passed
  complete learner-first private/source review, as did Machine Learning revision
  `60366ccf…0e4e82`, after every structural, cueing, transfer, route, and claim-specific source
  finding was repaired. Apply the consolidated rules while researching, authoring, qualifying, and
  independently reviewing Neuroscience under the
  [priority-1 plan](./2026-09-01-research-authored-three-leg-expeditions.md) before the atomic cutover
  and validation units.

## COMPLETED

- **The learner product now runs only on directly authored Expeditions (2026-08-31).** Codex CLI
  authors the exact tracked documents consumed by the server; one all-or-nothing qualifier owns
  schema, references, source anchors, learner-safe projections, and canonical revisions without a
  model, compiler, package, installer, content database, or runtime requalification. One deep
  learner-runtime module owns private grading and the retained full game over a single validated
  Postgres aggregate. The graph, extraction, enrichment, generation, Admin Lab, worker, LiteLLM,
  Docling, ingestion, content-store, and inspection systems are deleted. Durable policy lives in
  [ADR-0042](../adr/0042-author-expeditions-directly-without-runtime-models.md), authoring mechanics
  in [content/AUTHORING.md](../../content/AUTHORING.md), runtime/setup mechanics in the root
  [README](../../README.md), and native claims in the
  [rig README](../../apps/learner-app/e2e-native/README.md). Detailed implementation and evidence
  are retained in commits `1e2567a`, `3bf2c04`, and `d4e81f0`.

## VALIDATION

### Directly authored learner runtime — 2026-08-31

- `pnpm check` passed the five-Expedition content qualifier, exact five-table schema parity, every
  workspace typecheck/test, lint, API and Expo builds, 25 learner-app suites/149 tests, and 20/20
  intercepted Playwright scenarios at phone and desktop sizes. `pnpm test:db` passed all migration
  classifier and live test-Postgres suites; both Compose configurations and `git diff --check`
  passed.
- The guarded local reset produced exactly Better Auth's `account`, `session`, `user`, and
  `verification` tables plus `learner_journey_state`, with one migration-history row. Positive
  controls found the aggregate table and no sampled removed relation. Final real-use teardown left
  zero users and zero journey rows.
- Direct semantic/source inspection passed all 18 lesson sections, 26 activities, 10 Support Paths,
  five matching sets, five impostor sets, both Guardian pool classes, and 44 section/explanation
  anchors across the accepted five-primer catalog. The project-owned primers remain a local
  playtest basis, not independently verified factual or arbitrary-source evidence.
- A real Better Auth/Hono/Postgres journey completed Critical Thinking's full acquisition,
  calibration, restoration, Support, Guardian, reward, leaderboard, persistence, and isolation
  lifecycle, then completed every Stop/activity, a Support Path, calibration behavior, and one Leg
  Guardian in each other Expedition. Fresh production-format phone and desktop web journeys passed,
  and their three reserved learners were deleted exactly.
- A fresh Android SDK-57 e2e APK passed sign-in, Guardian presentation, and the retained 320-dp
  Support Path authority check; its isolated dialog-collapse mutant failed the intended body/footer
  assertion 3/3. A fresh iOS SDK-57 Debug simulator build passed the canonical authored-runtime
  Maestro flow after the runner fixed the Docker/DADB discovery hang and related clean-state issues.
  The flow also exposed and drove a regression-covered trail-to-Journal navigation fix.
- Evidence is local automated, owned development/test Postgres, intercepted and real-backend web,
  Android emulator, and separately identified iOS Debug-simulator evidence. It is not deployed,
  distributable, physical-device, production, release, external-fact, or arbitrary-source evidence.
