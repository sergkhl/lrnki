<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

- **DeepSeek Baidu Provider Route cutover — rolled back; diagnose before retry.** The attempted
  Baidu-primary/shared-DeepInfra route was reverted after `kg-claim-factuality-judge` timed out in
  the production-client smoke. Keep the restored route live until a fresh bounded cutover again
  passes every alias smoke and exact SpendLogs attribution gate.

## COMPLETED

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

- **The shared judge deployment is live and exercised (2026-08-08).** Recreating LiteLLM made the
  configured independent judge effective, and the production real-use gate exercised it over the
  full study-item fixture. The reload and deployment-verification procedure lives in the root
  [README](../../README.md#deployment).

- **Matching item assignment quality shipped (2026-08-08).** The prompt contract, provable
  containment veto, shared learner-vocabulary rule, and cross-family assignment verification are
  deployed. One borderline residual remains an accepted neural-quality tail rather than a lexical
  gate under [ADR-0026](../adr/0026-typed-study-item-bank.md). Detailed record: commit 4ea7e64.

- **Study Item grounding and key verification shipped (2026-08-07).** Citation resolution and
  cross-family answer-key verification now share one grounding contract; production real-use
  inspection confirmed the repaired bank. Durable policy:
  [ADR-0026](../adr/0026-typed-study-item-bank.md). Detailed record: commit 7fb9a2d.

## VALIDATION

### Learner API fast development loop — 2026-08-22

- Source identity: the plan-less workflow change was validated from the working tree based on commit
  `dff3b2d9bd1f21b9764e7aabe98e06c87dac8cef`; its fresh learner API image is
  `sha256:9783fea6a8d0489cd71535a80ef8cf5cb33ab2e42d250d3a9e01a6fbdec2c6a7`.
- Static and build evidence: the merged base/development Compose configuration parsed quietly, both
  root command entries resolved, and `pnpm dev:api:rebuild` built the learner API and migrator before
  starting the healthy loopback API. The build context was 127.97 kB. The fresh image contains the
  tracked `.env.example` but no `/app/.env`; required runtime variable names were present through
  Compose injection without printing their values, and `http://127.0.0.1:8787/health` returned
  `{"ok":true}`.
- Fast-start evidence: after stopping only the foreground watcher, `pnpm dev:api` ran the detached
  `--no-build` startup and reached `Watch enabled` without a BuildKit phase. It retained the exact
  image above and the healthy existing learner API container.
- Live-reload evidence: a disposable source probe created while watch was off appeared in the
  container through `initial_sync`. Changing it while watch was active produced one sync and one
  learner API restart; removing it produced the same. The container start timestamp advanced for
  both saves, its image ID never changed, and `/health` recovered after each restart.
- Cleanup: the probe is absent from host and container, the validation watcher is stopped, and the
  detached learner API remains healthy. Existing historical images and builder cache were not
  pruned; this result proves only that the newly built image excludes the local environment file.
- Evidence boundary: local command/configuration, exact-image contents, loopback reachability,
  initial synchronization, and restart-on-edit only; not deployed behavior, a browser or native
  journey, real-use quality, production credential exposure analysis, or physical-device evidence.
