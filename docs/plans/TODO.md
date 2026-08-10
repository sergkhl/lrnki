<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

- **Decide the Guardian shield-loss response.** The current shake is unreachable because the
  corrective reveal unmounts GuardianStage on the same state transition that reduces the shield.
  Decide whether a corrective Guardian should react at all; then delete the dead animation or move
  the effect to a surviving surface and cover the chosen behavior. The corrective, non-punitive
  constraint comes from
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Repair the 320 dp native Support Path flow.** Maestro can report the panel visible too early and
  tap Continue instead of the intended term control. The app remains manually reachable; this is a
  false-authority risk in the adopted scenario. Fix the flow and repeat its negative control as
  required by [the rig contract](../../apps/learner-app/e2e-native/README.md).

## COMPLETED

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

- **Code-first Drizzle migrations deployed (2026-08-05).** The shared database completed the guarded
  reset and cutover to the generated baseline and one programmatic migrator. Durable decision:
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).

## VALIDATION

### Real-use quality evaluation — 2026-08-09

- Milestone: learner web hard loads use one client-rendered SPA shell, the shell is deployed to
  Pages, and the menu handoff test is deterministic.
- Fixture and source type: production-format local Expo export plus the deployed Pages artifact at
  b0bd09e; dynamic Expedition and Guardian routes, the AE9 checkpoint journey, and the OAuth-refusal
  return.
- Real model calls used: not applicable; transport is intercepted and no generated content is
  evaluated.
- Result: PASS.
- Useful output observed: local and deployed dynamic routes reached their named unavailable surfaces
  without page or console errors; the checkpoint journey completed on phone and desktop.
- Defects observed: none in the required gate.
- Changes made after inspection: selected Expo single output, added artifact and dynamic-route gates,
  and made the menu handoff deterministic in Jest without changing shipped behavior.
- Remaining caveats: the existing Expo/Jest post-test logger and Watchman warnings are unrelated.
- Safe to continue downstream: yes; local and deployed completion are both verified.
