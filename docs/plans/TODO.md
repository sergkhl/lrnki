<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Source-less Grounding and answer correlation — in progress; U0 complete, U1 next.** Follow the
  [active plan](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md). The deep
  admission interface now supplies batch-owned aliases and exact-context peers to Grounding
  Generation. Replace answer arrays with an exact key-indexed provider shape next, then qualify all
  three affected consumers before unblocking latency work.

- **Topic Expedition generation latency — blocked; U3 remains `FIX_FIRST`.** Follow
  [the active plan](./2026-08-22-001-repair-topic-expedition-generation-latency.md) in U0–U4 order.
  The bounded admission pipeline and honest 19-stage Journal profile are complete, but equal widths
  8, 12, and 16 all exceeded seven minutes during enrichment and every settled attempt rejected
  over-broad Grounding Bundles. Production-model prompt/schema and pre-draft trials did not clear
  the unchanged admission contract and were discarded. Keep width four and resume only after the
  deepening plan supplies a successful, fully inspected quality baseline.

## COMPLETED

- **Topic Expedition generation is scoped to DeepSeek and its stage decisions are frozen
  (2026-08-23).** One composition-owned routing value moves the nine direct generators without
  repointing shared consumers; exact aliases, assignments, fallbacks, and operation identities are
  source/config owned. Local provider recovery passed under natural load. Mixed-domain inspection
  kept seventeen stages and handed only Grounding Generation plus Verification Answering to the
  [ready successor](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md).
  Detailed record: commits `54329cf`, `8efc7e7`, `3938f19`, `8adfa00`, `f3e2a79`, and `8bf3e3a`.

- **Concept Canonicalization is explicit and replayable (2026-08-23).** An immutable inspected
  artifact now separates neural identity judgment from LLM-free Graph-Version Build, and the
  application catalog alone owns operation-stage membership. A local production-model gate across
  PDF, Markdown, and HTML sources passed; two publications from one artifact replayed exactly.
  Durable policy lives in [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md), and
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md); operator commands live
  in the root [README](../../README.md#concept-canonicalization-and-graph-publication). Detailed
  record: commits `a84edcc`, `935fe13`, `546b9db`, and `617e058`.

- **The DeepSeek Provider Route is repaired and attributable (2026-08-23).** The three production
  aliases now share one FP8, reasoning-disabled Model Assignment with provider failover owned only by
  LiteLLM. The canonical topology and sampling-policy boundary live in
  [`litellm/config.yaml`](../../litellm/config.yaml) and the client source; reusable cutover mechanics
  live in the root [README](../../README.md#deployment). Deployed candidate: `eadf16d`.

- **Source-less Grounding Admission is shared and one-pass (2026-08-19–20).** Synthetic Topic
  Generation, model-grounded prerequisite minting, and generated Support Steps now cross one deep
  admission module. Generated Support Steps also require exhaustive positive-claim admission and
  key-hidden Answer-Key Verification before atomic publication. Grounding verification may drop
  rejected passages, but a draft with no surviving Definition Passage fails closed without
  regeneration under [ADR-0030](../adr/0030-confidence-gated-synthesis.md). Detailed implementation
  record: commits bac34bf, 67247b3, ab17bd6, and 24fc8a0.

- **The native flows navigate exactly at 320 dp (2026-08-10–12).** Support Path scrolls to, fully
  verifies, and taps its exact term action, while Crystal Guardian now does the same for every
  shuffled answer, outcome, and Continue action. One-tap fixture sign-in keeps the scenarios focused
  while the dedicated flow retains manual refusal/success coverage. Support Path's isolated
  dialog-collapse mutant failed 3/3 inside the body/footer block, so its ADOPTED automatic authority
  is unchanged; Guardian remains visual evidence without automatic authority. The
  [rig contract](../../apps/learner-app/e2e-native/README.md) owns the claims and mechanics. Support
  Path detailed record: commit 3bc24e9.

- **Guardian shield-loss correction is calm (2026-08-10).** The dead shake is removed: the keyed
  correction owns the miss response, then Continue restores the static server-owned shield or Last
  Stand state under [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner web SPA hard loads deployed and verified (2026-08-09).** GitHub Pages deployed
  commit b0bd09e under the client-rendered single-shell policy in
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md). The deployed dynamic-route and
  OAuth-refusal gate passed; evidence:
  [Pages run 31327027343](https://github.com/sergkhl/lrnki/actions/runs/31327027343).

- **Self-hosted Better Auth and Google return legs (2026-08-08–09).** The shared API and learner app
  use Better Auth, and the user confirmed real Google round trips on Android and web. Local
  real-backend journeys cover persistence and refusal paths. Durable policy:
  [ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md); gate commits 03cdc32,
  d949177, and 3361bfc.

## VALIDATION

### Concept Canonicalization and ADR audit — 2026-08-23

- Local real-use: semantic artifact `bc33525e-77ce-455a-8e6f-72022192daaa` preserved the selected
  PDF → Markdown → HTML Extraction Run order and inspected 15 core Concepts across machine learning
  systems and molecular biology. Its two proposals were correctly `distinct`; no unsupported merge,
  cross-domain merge, quarantine, or unavailable result appeared.
- Replay and attribution: graph versions `227f8bab-7697-44f7-8321-5789335b5f28` and
  `9efc7a9e-89c2-40b9-9d73-294e534907d1` matched after excluding version identity/timestamps. The
  canonicalization operation joined four production-assignment SpendLogs and 2,663 tokens; each
  Graph-Version Build had a same-query positive control and zero model calls.
- Database and automation: a timestamp-hydration defect found by artifact inspection was fixed at the
  PostgreSQL boundary. `pnpm test:db` passed against reset-only `lrnki_test`; `pnpm db:check`, full
  workspace typechecks/tests, lint with zero errors, both production builds, link checks, and
  `git diff --check` passed. Root `pnpm check` was decomposed because its Playwright browser step was
  explicitly out of scope; no browser was launched.
- Protected diff: ADR-0006, Model Assignments, cross-family policy/enforcement, and one-pass Source-less
  Grounding Admission behavior are unchanged from `ab15107`. This is local automated, local database,
  local production-model, and documentation evidence—not deployed, production-data, browser, native,
  simulator/emulator, or physical-device evidence.
