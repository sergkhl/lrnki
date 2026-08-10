<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

- **Repair the 320 dp native Support Path flow.** Maestro can report the panel visible too early and
  tap Continue instead of the intended term control. The app remains manually reachable; this is a
  false-authority risk in the adopted scenario. Fix the flow and repeat its negative control as
  required by [the rig contract](../../apps/learner-app/e2e-native/README.md).

## COMPLETED

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

- **Code-first Drizzle migrations deployed (2026-08-05).** The shared database completed the guarded
  reset and cutover to the generated baseline and one programmatic migrator. Durable decision:
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).

## VALIDATION

### Real-use quality evaluation — 2026-08-10

- Milestone: a shield-loss correction remains calm while Continue restores the authoritative static
  Guardian shield or Last Stand state.
- Fixture and source type: production-format local Expo export with intercepted Guardian answer
  transport; phone reveal, post-Continue 2/3 shield, and 0/3 Last Stand captures, plus the same
  answer-reveal and spent-shield scenarios on desktop.
- Real model calls used: not applicable; no generated content is evaluated.
- Result: PASS.
- Useful output observed: the correction clearly replaces the Guardian and keeps the keyed answer in
  place; Continue returns a compact static shield count, and Last Stand remains supportive and
  non-punitive without moving wards.
- Defects observed: none in the inspected milestone.
- Changes made after inspection: none; the first inspected output met the intended contract.
- Remaining caveats: this is intercepted-web presentation evidence only. The unchanged warning
  haptic was not requalified, and the full Jest command still exits after 314 passing tests because
  of the existing post-test Expo logger warning.
- Safe to continue downstream: yes.
