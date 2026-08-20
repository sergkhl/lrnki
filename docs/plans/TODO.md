<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Source-less Grounding Admission — U4 in progress.** The
  [plan](./2026-08-19-001-deepen-source-less-grounding-admission.md) owns implementation design and
  validation. U1–U3 are closed `PASS`; resume from its `Open findings` by recovering the shared
  Docker runtime, then run the current-hash cross-consumer matrix, inspect the final artifacts, and
  consolidate the completed plan. Do not implement Candidate 2.

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

## COMPLETED

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

- **The public API now serves only from its deployed container (2026-08-05).** The dev-first fallback
  and host runtime are gone; deployment and development use the container path. Durable decision:
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md).

## VALIDATION

### Real-use quality evaluation — 2026-08-12

- Milestone: Crystal Guardian navigation reaches every visual-evidence state at 320 dp without
  changing the neighboring Support Path authority claim.
- Fixture and source type: the standalone e2e-profile APK against deterministic loopback Better Auth
  and learner-api response shapes; `emulator-5554`, AVD `Medium_Phone_API_36.1`, Android API 36,
  1080×2400 px, density override 540 dpi (320 dp) and physical 420 dpi (~411 dp); Maestro 2.6.1.
- Real model calls used: not applicable; no generated content is evaluated.
- Result: PASS.
- Useful output observed: the full directory passed at physical density and 320 dp. At 320 dp the
  Guardian reached entry, partial, miss, Last Stand, Final Ward, final reveal, and the seven-ward
  Expedition Guardian; inspection showed the intended shield and ward progression, a distinct
  destructive Last Stand ring, a lit Final Ward crown, and a distinct summit crown and palette. A
  later complete 320 dp rerun with the macOS display awake and `UserIsActive=1` passed again without
  a System UI ANR.
- Defects observed: answer-only scrolling first exposed an offscreen outcome banner after a lower
  option was centered. The initial boot also produced a System UI ANR and was excluded from evidence;
  its absence during the awake-host rerun is consistent with a host/AVD lifecycle issue but does not
  isolate display sleep as the cause.
- Changes made after inspection: every deterministic answer, outcome, and Continue action now uses
  exact-target full-visibility scrolling before assertion or activation. Native execution and
  failure triage now live in the
  [validation skill](../../.agents/skills/validate-lrnki/SKILL.md), while the rig
  contract retains scenario mechanics; density was restored to physical 420 dpi after the runs.
- Remaining caveats: this is native-emulator fixture evidence — not real-backend, deployed,
  production, or new physical-device evidence. Guardian remains human/agent-judged visual evidence
  without a measured negative control, and the Support Path touch-responder class stays physically
  owned.
- Safe to continue downstream: yes.
