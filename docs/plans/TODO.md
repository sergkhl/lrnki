<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

- **The Crystal Guardian native flow fails at a 320 dp viewport.** It does not scroll lower answer
  options into view, so it only runs at the AVD's physical density. The claim boundary and the
  narrow-viewport procedure are owned by the
  [rig contract](../../apps/learner-app/e2e-native/README.md); this is scenario navigation work, and
  it does not affect the Support Path dialog authority requalified beside it.

## COMPLETED

- **The native Support Path dialog gate is requalified and sign-in is one tap (2026-08-10).** The
  flow now scrolls to, fully verifies, and taps the exact term action instead of trusting ancestor
  visibility, and an e2e-build-only gate action replaced the duplicated login block while a dedicated
  flow keeps manual refusal/success coverage. An isolated dialog-collapse mutant failed 3/3 inside the
  dialog body/footer block, so ADOPTED automatic authority is retained; the
  [rig contract](../../apps/learner-app/e2e-native/README.md) owns the claims and mechanics. Detailed
  record: commit 3bc24e9.

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

### Real-use quality evaluation — 2026-08-10

- Milestone: the native Support Path dialog gate keeps automatic authority over its measured
  dialog-geometry regression while every flow reaches its own claim through one-tap fixture sign-in.
- Fixture and source type: the standalone e2e-profile APK against deterministic loopback Better Auth
  and learner-api response shapes; `emulator-5554`, AVD `Medium_Phone_API_36.1`, Android API 36,
  1080×2400 px, density override 540 dpi (320 dp) and physical 420 dpi (~411 dp); Maestro 2.6.1.
- Real model calls used: not applicable; no generated content is evaluated.
- Result: PASS.
- Useful output observed: the whole term action sits unobscured above the fixed footer, its
  activation opens the complete dialog, and dismissal returns to the same Theory activity. An
  isolated mutant carrying only the historic `Dialog` geometry failed 3/3 at `Add support path`,
  always after activating that action, and the restored current build passed again at 43s.
- Defects observed: the dialog *title* still resolves under the collapse, so the body and footer
  assertions are the ones that bite. The Guardian visual flow leaves lower answer options offscreen
  at 320 dp and is not repaired here.
- Changes made after inspection: dismissed the keyboard after 320 dp email entry, gave the manual
  sign-in flow a condition-based cold-start wait, and recorded both the title-insensitivity and the
  Guardian narrow-width limit in the rig contract.
- Remaining caveats: this is native-emulator fixture evidence — not real-backend, deployed,
  production, or new physical-device evidence. The touch-responder class stays physically owned.
- Safe to continue downstream: yes.
