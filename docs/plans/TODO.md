# TODO

## TODO

### Execution order

- **Finish learner-interaction platform gates — IN PROGRESS (U1–U5 landed; U6 remains).** Execute
  [plan 2026-07-10-003](./2026-07-10-003-feat-learner-interaction-system-plan.md); its
  "Execution Status" section is the authoritative handoff. The visual regressions are fixed and
  re-verified in Playwright, and the web real-use gate passed with 51 server-keyed grades across all
  three item types. OpenRouter Xiaomi BYOK resolved the production-generation provider block.
  Remaining U6 work is the fresh-generation rerun, normal/reduced-motion recording, Android build
  plus physical-device validation, ADR-0032/0035 consolidation, deployment, and live smoke testing.

- **Fix expedition discoverability (curated Explore + Browse all).** Execute
  [plan 2026-07-10-005](./2026-07-10-005-fix-expedition-catalog-discovery-plan.md): the journal's
  top-3 readiness slice hides ready trails (reproduced: `jackie chan` cannot reach the photosynthesis
  trail). Curated top-5 Explore + searchable Browse all `/catalog` screen, ≥2-stop structural floor,
  one-time cleanup of degenerate/`test`-domain enrichments; rule-14 gate = search "photo" → Begin.

- **MiMo extraction follow-ups (measure-first).** Execute
  [plan 2026-07-10-004](./2026-07-10-004-chore-mimo-extraction-follow-ups-plan.md): durable
  discovery-coverage audit over all 5 fixture domains resolving the cutover's "recall variance
  worth watching" caveat (conditional sampling tune per its decision rule), trailing-nullable
  descriptor-shape protection, and restoration of honest per-journey cost attribution after
  OpenRouter Xiaomi BYOK made provider-reported response cost zero. The production route stays on
  forced-tool-compliant OpenRouter BYOK; native Xiaomi remains experiments-only.

- **Consolidate Derived Graph Layer completion.** Execute
  [plan 2026-07-11-001](./2026-07-11-001-refactor-derived-graph-layer-completion-plan.md): one deep
  completion module for Graph Enrichment and Synthetic Topic Generation, lifecycle-aware structural
  guarantees, stable config identities, and production real-use inspection of both variants.

### Evidence-triggered follow-up

- **Difficulty / Leg-Trial follow-up (measure-first).** The goal-gradient flow evaluation (plan
  2026-07-10-001 R7) established the measurement path over `response_log` — correctness by
  attempt-order, retry depth per item, activity gaps. Wait for representative real learner traffic
  (not the gate driver's perfect play), then decide the support ladder and the deferred Leg Trial
  ("boss fight") + retention mechanic (incl. resonance dimming, the mastery-revocation decision)
  at the leg-completion seam the duel's grade-only contract already proved.

## COMPLETED

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
