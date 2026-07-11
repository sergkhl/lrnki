# TODO

## TODO

### Execution order

- **Consolidate Derived Graph Layer completion.** Execute
  [plan 2026-07-11-001](./2026-07-11-001-refactor-derived-graph-layer-completion-plan.md): one deep
  completion module for Graph Enrichment and Synthetic Topic Generation, lifecycle-aware structural
  guarantees, stable config identities, and production real-use inspection of both variants.

### Evidence-triggered follow-up

- **Difficulty / Leg-Trial follow-up (measure-first).** The goal-gradient flow evaluation (plan
  2026-07-10-001 R7) established the measurement path over `response_log` — correctness by
  attempt-order, retry depth per item, activity gaps. Wait for representative real learner traffic
  (not the g≥ate driver's perfect play), then decide the support ladder and the deferred Leg Trial
  ("boss fight") + retention mechanic (incl. resonance dimming, the mastery-revocation decision)
  at the leg-completion seam the duel's grade-only contract already proved.

## COMPLETED

- **MiMo extraction follow-ups: discovery-coverage audit, trailing-nullable protection, BYOK cost
  attribution (2026-07-11, plan 2026-07-10-004).** A durable `kg-worker audit-discovery-coverage`
  command runs the cross-family independent judge (gpt-oss-120b) K-sampled over an extraction run's
  admitted set and the source's teachable blocks, aggregating recurrence by normalized objective
  OR shared source grounding. A config-derived congruence test locks the one proven-fatal MiMo
  wire-schema shape (an object whose final property admits `null`) by parsing the MiMo-routed
  aliases from `litellm/config.yaml`; it caught two LIVE offenders (`concept-lesson` sections,
  `study-item-blueprint` plans), both reordered so a required property closes the object. BYOK cost
  attribution is restored in the ADR-0029 read path: the spend adapter derives an explicitly
  labeled `estimatedSpend` for zero-spend OpenRouter BYOK rows from the versioned deployment prices
  in `litellm/config.yaml` (reconciled exactly against OpenRouter's retained
  `upstream_inference_cost`), kept distinguishable from provider-billed spend and rendered `≈…est.`
  Rule-14 gate PASS: fresh MiMo extraction of all five `fixtures/manifest.json` sources (5 domains,
  mixed formats), audited at K=3. R5 decision: **U2 tuning SKIPPED** — zero domains with a
  human-confirmed principal-concept miss (economics/InstructKG/AIRA clean; the two recurring Rust
  and biology misses verified NOT losses — one retained as a mention, one a source Learning-Objective
  integration prompt). The Rust cross-family diff vs DeepSeek `21f0399f` confirmed the candidate-count
  drop lived entirely in the optional discard pile, not the core. Production stays on OpenRouter
  Xiaomi BYOK; native Xiaomi remains experiments-only. Evidence:
  `tmp/2026-07-10-mimo-extraction-follow-ups/`.

- **Expedition discoverability — curated Explore + Browse all catalog (2026-07-11, plan
  2026-07-10-005).** Explore is explicitly curated to its top five candidates, while the lazy
  `/catalog` route exposes every shared, beginnable ≥2-stop expedition with case-insensitive
  search across the persisted trail vocabulary. Degenerate and placeholder development data was
  removed. Rule-14 PASS: Playwright authenticated as `jackie chan`, opened Browse all from Explore,
  searched `photo`, found both Plant Biology trails, and Began Carbon-fixation into its populated
  seven-crystal study session with no console errors. Evidence:
  `tmp/2026-07-10-expedition-catalog-cleanup/`.

- **Learner interaction system and deferred native surfaces (2026-07-10/11, plan 2026-07-10-003).**
  Hard-cut the Learner App to one app-owned NativeWind component system (`src/ui/`: Screen, Text,
  PressableSurface, Button, IconButton, Card, Input, Progress, Dialog, BottomSheet, SideSheet,
  FullScreenDialog, OverlayHeader; single token source; lint-enforced boundary), restored the
  deferred journal overlays (right SideSheet menu, self-contained Board dialog, splash coordinator),
  gave every overlay a circular semantic icon header and one dismissal contract, and added
  restrained event-bound Reanimated motion with a single reduced-motion policy and selective
  semantic haptics. Root-cause fix for the reported visual regressions: Reanimated-wrapped
  components are not auto-registered with NativeWind, so their `className` was silently dropped —
  fixed with `cssInterop`; a second web-only leak (react-native-svg `origin` → raw `transform-origin`
  DOM attribute on the crystal-assembly path) was found on the fresh-generation gate and fixed with
  an explicit pivot-decomposition transform. Decisions:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (amended) and
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) (amended). Rule-14 web gates
  PASS: session-3 migrated-UI gate (51 server-keyed grades, evidence
  `tmp/2026-07-10-learner-interaction-system/`) and session-4 fresh-production-generation gate
  (cold topic → 137s → 8 nodes / 19 study items / 8 lessons → 16/16 server-keyed correct grades,
  plus normal/reduced-motion recordings, evidence
  `tmp/2026-07-11-learner-interaction-fresh-gen/`), resolving the earlier MiMo `441 risk_control`
  block via OpenRouter Xiaomi BYOK. The Android preview build + physical-device pass is a manual
  step in [BLOCKERS.md](./BLOCKERS.md) (web correctness is the completion bar); iOS runtime
  validation is deferred.

- **Production extraction moved to Xiaomi MiMo v2.5; DeepSeek fully retired (2026-07-10, plan
  2026-07-10-002).** The six extraction aliases route to `openrouter/xiaomi/mimo-v2.5`
  (single-host provider pin for prefix-cache reuse, reasoning disabled); all DeepSeek deployments
  and `DEEPSEEK_API_KEY` plumbing deleted; AGENTS rule 5 names the `model_group_alias` block as
  the source of truth. Config hashes proved alias-stable across the cutover. One MiMo defect fixed
  in the same change: its constrained tool decoder intermittently stringifies nested
  array-of-object arguments and truncates before a trailing literal `null`, so the impostor wire
  schema is now fully flat (adapter rebinds to the unchanged domain draft). Rule-14 gate PASS on
  the Rust-ownership fixture end-to-end with spend attributed to MiMo. Follow-up caveats live in
  [plan 2026-07-10-004](./2026-07-10-004-chore-mimo-extraction-follow-ups-plan.md). Evidence:
  `tmp/2026-07-10-extraction-model-switch-mimo/`.

- **Learner goal gradient, constructive Crystal Vista, and duel arena (2026-07-10, plan
  2026-07-10-001).** Advance-visible goal hierarchy: layer-purpose Neural Stage Descriptor
  (`layer-purpose-generation` under `study_items`, fail-open to a mechanical template, one
  `enrichment_layer_purposes` row per enrichment), merged summit header, leg banners, summit-push
  eyebrow, and trail terminus. Constructive Crystal Vista on RN primitives (leg-cluster fusion
  auras, summit keystone, memory door replacing the bare label chip), tiered fog-naming, and the
  `/duel` re-port over the pure `duelMachine`. Rule-14 web-first gate PASS (7/7 nodes mastered via
  server-keyed grading; `response_log` byte-identical across 5 duel grades); flow-evaluation
  method established as the difficulty follow-up baseline. Zero new persistence beyond the one
  purpose row. Evidence: `tmp/2026-07-10-goal-gradient/`.

- **Universal Expo learner app shipped and cut over; learner-api dev loop without rebuilds
  (2026-07-09/10, plan 2026-07-09-001).** One Expo universal app `apps/learner-app` (Expo Router +
  NativeWind + react-native-svg) renders the full v1 parity cut over the unchanged typed learner
  API; `@lrnki/application` gained the client-safe `./projection` subpath. Cutover executed on
  web-only evidence (user decision; the native check is backed by the Android local-build
  pipeline): `apps/learner-web` deleted, AGENTS rule 15 rescoped to Admin Lab. Caddy routes
  `api.lrnki.globesoul.com` dev-first to a host-run tsx watch process with container fallback, and
  the Caddyfile is baked into a built caddy image (root-cause fix for the VPS daemon/checkout
  filesystem divergence). Decisions:
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) (amended) and
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md). Rule-14 web
  half PASS; evidence `tmp/2026-07-09-learner-app-universal-expo/`; runbook in the
  [README](../../README.md#deployment).

- **Learner App separation and live deployment (2026-07-08/09).** The learner surface moved out of
  Admin Lab: `apps/learner-api` (Hono + zod thin mappers over `@lrnki/application`, opaque hashed
  bearer sessions in the new `learner_sessions` table, PIN + rate limit, relocated
  topic-generation supervisor, one shared pool) behind Caddy TLS at
  `https://api.lrnki.globesoul.com`, static learner web at `https://lrnki.globesoul.com` (GitHub
  Pages), internal litellm/docling/postgres ports bound VPS-local; Admin Lab lost every learner
  route and stays SSH-tunnel-private. Decision:
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md). Rule-14 gates PASS
  (separation and deployment); evidence `tmp/2026-07-08-learner-app-separation/` and
  `tmp/2026-07-09-learner-app-deployment/`.

- **Operations, observability, and architecture deepening (2026-07-07/08).** Journey-first
  Operations page with one merged stage table (`mergeOperationStageRows`), live cost/tokens/calls
  chips, collapsed finished cards, and the operator "bottleneck" surface renamed **Cost &
  timings**; the operation-timeline catalog made provably complete via a set-equality +
  disjointness assertion ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md));
  Neural Stage Descriptors with dotprompt files and mechanical config hashes replacing adapter
  classes and hand-bumped hashes
  ([ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)), proven
  byte-identical across both composition roots; the shared neural client-construction policy in
  `createNeuralClients()`; learner grading collapsed behind one tested `gradeStudyResponse`
  application use-case consuming the read model per
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md); and the one-time
  learner-state wipe + `/learn` read-path dedup (10.5s → 2.59s warm). Accepted framings: the
  2026-07-07 architecture deepening review (completed and deleted; its rejected-findings ledger is
  preserved by the [2026-07-11 review](../brainstorms/2026-07-11-architecture-deepening-review.md)).
  Rule-14 gates PASS per change; evidence under `tmp/2026-07-07-*/` and `tmp/2026-07-08-*/`.

- **Learner registry, weekly leaderboard, Crystal Duel, and board UX (2026-07-07/08).** Free-text
  identity replaced by a `learners` registry with PIN gate and real FKs on the learner-state
  tables (`/learn/session` is the sole PIN-aware route, the swap point for real auth). Weekly
  ISO-week banded score reads off the SAME Study Session projection every surface reads (no
  parallel mastery SQL), rendered as a cohort-of-10 Dialog with seeded Faker rivals, a derived
  division ladder (0/10/30/75), chase banner, seam-triggered splash, and idempotent
  `weekly_podium`. The Crystal Duel is a five-question grade-only retrieval sprint over a pure
  exhaustive `duelMachine`: it persists nothing (`response_log` byte-identical across a duel) and
  winning earns a durable `duel_win` crest. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md). Rule-14
  gate PASS; evidence `tmp/2026-07-07-leaderboard-duel/`.

- **Expedition generation durability, queue reliability, latency, and probe calibration
  (2026-07-05→07).** Topic-expedition generation is a durable claimed row completed by the
  supervisor: bounded-parallel (cap 2), one staleness predicate shared by claim and fail,
  operation-id fencing with heartbeat, transient-vs-terminal error classification, an orphaned-row
  reaper, and a two-minute liveness predicate shared with the UI
  ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md)). Study-item generation
  runs bounded per-node concurrency 4 (measured 261.5s → 94.5s). The Knowledge-Boundary Probe has
  a repeatable `calibrate-boundary-probe` command and measured defaults (K=10, temperature 0.7,
  threshold 0.89), plus a deny-listed alias with a cross-family ordered fallback
  ([ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md)).

- **Learner study experience: sectioned trail, crystals, lessons, and study-item quality
  (2026-07-02→06).** The Study Session projection is layer-wide and sectioned with a derived
  summit and the single completion rule (terminology in [CONTEXT.md](../../CONTEXT.md); the
  persisted expedition target was deleted). Per-concept procedural growing crystals and the
  Crystal Vista replaced the gem icon; the trail gained opaque portals, one-tap grading with
  explanations, known-ground ghost crystals, two-column tap-pair matching, Begin/Resume entry with
  one-step topic planning, and journal theming on shadcn semantic tokens. Concept Lessons carry
  list-structured examples/applications with a cross-family redundancy judge and a
  one-substantive-section minimum; Study Item Blueprints have a structural sparse pre-gate; a
  dedicated Rescued-Node Canonical Labeling step replaced the durability-judge field. Intrinsic
  difficulty became a comparative in-set banded prior with a confident-floor trail floor
  ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), amended). Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## VALIDATION

- **MiMo extraction follow-ups gate, 2026-07-11.** Deterministic envelope: workspace `typecheck`
  exit 0 (repaired one stale pre-existing `expeditionJournalView.test.ts` fixture missing the new
  `ExpeditionCandidate.searchTerms` field), workspace `test` green (application 533,
  infrastructure-litellm 144, learner-app 150, admin-lab 62), `lint` 0 errors (9 pre-existing
  warnings). Real-use: five fresh production MiMo extractions (Rust 9 core / biology 4 / economics 4
  / InstructKG 5 / AIRA 7), each audited at K=3 by gpt-oss-120b — recurring misses 1/1/0/0/0, all
  surviving human inspection as non-losses; the trailing-nullable test caught and fixed two live
  fatal-shape schemas; a fresh extraction operation's Cost & timings rendered `≈$0.0890` with BYOK
  stages estimated and judge stages billed, distinguishable. Disposable state: none (real-source
  extraction runs retained; no learner state created). Evidence:
  `tmp/2026-07-10-mimo-extraction-follow-ups/`.

- **Learner interaction system fresh-generation + motion gate, 2026-07-11 (session 4).**
  Deterministic envelope after the CrystalGlyph DOM fix: workspace `typecheck` exit 0, `lint` 0
  errors (8 pre-existing warnings), learner-app `test` 36 suites / 148 tests green,
  `CrystalGlyph.test.tsx` 6/6. Real-use: the `kg-domain-inference` alias returned HTTP 200 with
  valid forced-tool output (no `441 risk_control`); a cold "ocean tides" topic generated in 137s
  (8 nodes / 19 study items across all three types / 8 lessons); 16 server-keyed `auto` grades, all
  correct, across option-select/impostor/matching through the migrated overlays; the assembly-path
  console error was reproduced, fixed, and re-verified clean (14 assembly actions, 0 errors);
  normal and reduced-motion recordings captured console-error-clean. Disposable learners deleted;
  the generated enrichment left intact. Evidence: `tmp/2026-07-11-learner-interaction-fresh-gen/`.

- **Universal-Expo cutover + learner-api dev loop, 2026-07-10.** Deterministic envelope after
  deleting `apps/learner-web`: workspace `typecheck` exit 0, workspace `test` exit 0 (learner-app
  68), `lint` 0 errors (8 pre-existing warnings), `expo export --platform web` all 5 routes.
  Dev-loop live checks against the real public host: with no dev process,
  `https://api.lrnki.globesoul.com/health` served by the container (incl. correct
  `access-control-allow-origin: https://lrnki.globesoul.com` from the rebuilt image); starting
  `pnpm --filter @lrnki/learner-api dev` took over the hostname (proven by stopping the
  container while public health stayed OK); a `tsx watch` restart triggered by a source touch
  kept the public URL healthy with no image rebuild; killing the dev process fell traffic back
  to the container within ~15s. The container→host hop required the documented one-time
  `ufw allow in on br-lrnki to any port 8787` (default-DROP timed out both bridge gateways;
  host loopback was reachable). The web export re-check is a smoke pass, not a re-run of the
  rule-14 gate (evidence unchanged in `tmp/2026-07-09-learner-app-universal-expo/`).

- Each COMPLETED outcome above names its rule-14 real-use gate result and `tmp/` evidence
  directory; the full per-change validation transcripts live in git history. Tests remain
  deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output.
