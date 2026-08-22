<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

## COMPLETED

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

- **The shared judge deployment is live and exercised (2026-08-08).** Recreating LiteLLM made the
  configured independent judge effective, and the production real-use gate exercised it over the
  full study-item fixture. The reload and deployment-verification procedure lives in the root
  [README](../../README.md#deployment).

- **Study Item grounding, key verification, and matching assignment quality shipped
  (2026-08-07–08).** Citation resolution and cross-family answer-key verification share one grounding
  contract; matching adds a provable containment veto, shared learner vocabulary, and cross-family
  assignment verification. Production real-use inspection confirmed the repaired bank; one
  borderline matching residual remains an accepted neural-quality tail rather than a lexical gate.
  Durable policy: [ADR-0026](../adr/0026-typed-study-item-bank.md). Detailed records: commits 7fb9a2d
  and 4ea7e64.

## VALIDATION

### DeepInfra-primary Provider Route repair — 2026-08-23

- Diagnosis: the earlier Baidu preflight omitted production `seed: 7`. The real client sent it with
  `temperature: 0`; Baidu rejected seed, so `require_parameters: true` excluded Baidu before
  inference and LiteLLM served DeepInfra. That successful fallback response had not proved primary
  use. Candidate `eadf16d4e05841ed00a5b080c87a1f8235860c26` leaves the sampling body unchanged and
  replaces the superseded route definitions with one shared primary and explicit same-assignment
  backup. Seed's independent benefit remains unisolated and it is not a reproducibility guarantee.
- Provider contract and router evidence: immediately before cutover, the endpoint registry still
  advertised the full FP8/seed/reasoning/forced-tool/structured-output contract for both routes. All
  six direct provider × Answer-Key Verification, Claim Verification Answering, and Claim Factuality
  Judgment probes returned the requested provider/model, one schema-valid forced call, and HTTP 200.
  In the exact-image fault harness, tag `deepseek-provider-fallback-1787428988213` produced exactly
  three Parasail-attributed backup rows, all successful with zero retries and one client request.
- Automated evidence: the deployable candidate passed the LiteLLM typecheck and 176/176 package
  tests. Root `pnpm check` passed schema parity, every workspace check, lint with zero errors, both
  production builds, and 70/70 intercepted-web cases; `git diff --check` passed. Intercepted web is
  qualified only at that layer.
- Deployed evidence: VPS checkout `eadf16d4` recreated only LiteLLM as healthy container
  `5b819236816539ba4fe3dec53f919b2af76741d433dace3377ddeb0b1980c56f` on image digest
  `sha256:c98c9395c56a35b7abacff8269d43ff99aabacb62bbf42a04cc1514fcb9bde4a`; `/model/info`
  exposed exactly the two pinned FP8, reasoning-disabled groups and the public learner API stayed
  healthy. Tag `deepseek-provider-deepinfra-primary-1787429578731` had a four-row positive control:
  all three alias rows shared primary deployment id `b33145a5…`, provider `DeepInfra`, and one direct
  backup row used deployment id `ac3f244a…`, provider `Parasail`. Every row used the exact base model,
  succeeded with zero retries, and its schema-valid client call made one HTTP request.
- Rollback identity remains prior revision `d069cba1dcd393b8377857e4f8c71aff17e96c74` and container
  `1c14e5ab8e0a0ee40629d9b416021836c735d7b60aeef3be9a4c13838ef9da30`. No rollback was required.
  Prior semantic quality evidence remains qualified because revision, FP8 quantization, reasoning
  behavior, temperature, and seed did not change. This result proves provider contract, explicit
  fallback mechanics, deployed reachability, attribution, and service health only—not new
  broad-source usefulness, learner-flow, native, simulator/emulator, or physical-device quality.
