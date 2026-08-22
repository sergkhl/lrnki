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

### DeepSeek Provider Route cutover attempt and rollback — 2026-08-22

- Source identity: Model Assignment policy/refactor commit
  `600f5ac247f244d457bf4325dd7ed95c1d085325` is retained. Tested routing commit
  `5377ef2b0769c6f63f4ec172d006c65b9c01b0f9` reached `origin/main`, then normal revert
  `c05e2faeac63603f7d565bc0895014bb45aa3cb4` became the verified remote tip. The failed cutover
  replaced container `6bd6bb853e760948255cbe95531bbcda8b74546da21e315122cc402828f95a8b` with healthy
  `95be36021184a2716f1f229d29925ba7cf9604f6ae0a37205273c39051ef5233`; rollback replaced it with
  healthy `303fd6253ea249753278707dc1a84c5274a609c69b103d8f2aa73ff8818d6d32`.
- Local automated evidence: the LiteLLM package typecheck and all 176 tests passed, including
  assignment/route separation, fail-closed quantization, exact operation hashes, and the proposed
  real config. Root `pnpm check` passed schema drift, workspace typechecks/tests, lint with no errors,
  both production builds, and 70 intercepted-web Playwright cases. Focused restored-config tests and
  `git diff --check` passed before the revert push.
- Direct provider contract: the fresh OpenRouter registry reported exact `baidu/fp8` and
  `deepinfra/fp8` endpoints with FP8, tools, forced tool choice, structured outputs, and the planned
  limits/prices. All six exact-provider calls—Claim Verification Answering, Claim Factuality
  Judgment, and Answer-Key Verification on each provider—returned HTTP 200 from the requested
  provider and passed the production schema validator. Detailed artifacts remained gitignored.
- Cutover evidence: the new container loaded only
  `openrouter/deepseek/deepseek-v4-flash-0731` and
  `openrouter/deepseek/deepseek-v4-flash-0731-deepinfra-backup`; LiteLLM liveliness and the public
  learner API stayed healthy. The actual production client then passed Answer-Key Verification on
  `kg-independent-judge`, Claim Verification Answering on `kg-claim-verification-answerer`, and a
  direct backup Claim Factuality Judgment, but `kg-claim-factuality-judge` ended in a terminal
  120-second timeout. An earlier one-shot harness attempt was excluded because its duplicate-call
  and retry semantics did not match the production client.
- SpendLogs positive control: tag prefix `deepseek-provider-cutover-1787380371361` matched three of
  24,876 rows. Both successful production-alias rows recorded base model
  `openrouter/deepseek/deepseek-v4-flash-0731` and provider `Baidu`; the direct backup row recorded
  the same base model and `DeepInfra`; zero persisted tagged rows had an unexpected provider. The
  timed-out factuality request produced no persisted row, so the required four-row gate did not pass.
- Rollback evidence: the final container again loads the previous base, `-claim`, and
  `-claim-deepinfra-backup` groups, with the attempted shared backup absent. LiteLLM and learner API
  health are green. The parser confirms restored BaseTen/Parasail and Parasail→DeepInfra Provider
  Routes and that all three consumers still resolve to one Model Assignment: DeepSeek V4 Flash 0731,
  FP8, reasoning disabled, chat mode, and the same input limit.
- Quality policy: prior consumer quality evidence remains qualified because the Model Assignment did
  not change and the failed Provider Route was rolled back. Automatic Baidu→DeepInfra failover was
  structurally validated in source but not induced, and that topology is not live after rollback.
- Real-use quality evaluation: real model calls were contract smokes, not a curated-source semantic
  requalification. Result: `BLOCKED` for the requested cutover because one mandatory alias smoke
  timed out; no new usefulness claim was made. Safe to continue on the restored route: yes. Safe to
  retry or ship the requested Baidu route without a fresh successful cutover: no.
- Evidence boundary: deployed LiteLLM availability, provider contract, route attribution, and
  rollback evidence only; not a browser journey, full deployed application path, new semantic
  quality evaluation, native run, or physical-device result.
