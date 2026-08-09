<!-- Hygiene (rules: README.md → Retention). TODO 3–7 items (an item over ~15 lines needs a plan
     file); COMPLETED ≤8 entries of ~8 lines, rolling — adding one deletes the oldest; VALIDATION =
     exactly one entry, ~20 lines, and only for work no plan owns — a plan's own validation lives in
     its `## Validation Log`. Whole file ≤ ~150 lines. Consolidate outward before deleting: move
     anything that outlives this directory to its owner (ADR, AGENTS.md, CONTEXT.md, a rig README, a
     skill) in the same change. Never delete an uncommitted plan or an uncommitted validation
     record: commit first, delete in a later commit. -->

# TODO

## TODO

- **Generation model evaluation — shaping, needs a planning interview.** Brainstorm:
  [2026-08-08-002](../brainstorms/2026-08-08-002-generation-model-evaluation.md), which owns the
  framing, the measured evidence, the candidate options, and the two carried generation-side changes
  (remove the blueprint's over-firing matching-facet constraint; raise
  `MATCHING_GENERATION_ATTEMPTS`). Headline: DeepSeek v4 Flash beats MiMo v2.5 on yield/latency/price
  but is unmeasured on truth, the bake-off's pre-registered re-decision test turned out to be the
  wrong instrument, and `kg-claim-extraction` serves **11 prompts** including `grounding-generation`
  — which drags the judge along under [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md).
  **The judge has nowhere independent to go today, and that is what actually gates this.** No
  implementation plan is ready after the auth-plan consolidation; the next code-agent session
  should resume with the planning interview, one decision at a time, starting with that ownership.

- **The Guardian's shield-loss shake is unreachable in production.** `GuardianFight` renders either
  the corrective reveal or the `GuardianStage`, never both, and a selection answer sets the reveal in
  the same commit that decrements the shield — so the stage unmounts on the exact edge it watches and
  remounts with its `prevShieldRef` already equal to the new value. No test covers it, which is why
  nothing caught it. Found during the native pass; **not fixed**, because whether a corrective
  Guardian should flinch at all is a design call under
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (which says
  "may shake"), not a mechanical repair. Decide, then either delete the dead animation or move the
  edge somewhere that survives the reveal — and cover it either way.

- **The native Support Path flow can tap the wrong control at 320 dp.** It is the ADOPTED
  automatic-authority scenario, so a flow that can tap the wrong control is a flow that could pass for
  the wrong reason. The app is NOT at fault — the panel is fully reachable by hand at that width.
  Mechanism and the constraint on fixing it (changing an adopted flow means re-running its negative
  control) are in `apps/learner-app/e2e-native/README.md`.

### Evidence-triggered follow-up

- **Progressive readiness / keep the learner busy under ~1 minute.** If full-ready generation still
  feels slow in real use, design one of: earliest-section readiness (learner enters while later
  sections still generate; owns the readiness-rule and Study Session composition change),
  enrichment/study-items phase overlap (the shipped sequential operation boundary has no in-memory
  handoff seam), or an engaging waiting surface. Real-use judgment triggers this, not a timer.

- **Support Path Study Items in Guardian selection.** After real use justifies the breadth, define a
  richer learner-scoped typed Study Item set and passed-item semantics for Support Steps, then extend
  fixed-budget Guardian coverage to completed visible Support Paths as anticipated by ADR-0037. Do
  not treat the current single inline generated option as equivalent to the neutral Study Item Bank.

### Environment

Load `.env` before anything touching the database: `set -a; . ./.env; set +a`. Everything else that
lived here now has an owner: container roster, rebuild verification, the LiteLLM dead-key-vs-429
separation and log source IPs → root README `## Deployment`; throttling signatures →
`.agents/skills/real-use-quality-evaluation/SKILL.md`; the prompt-file module cache →
`packages/infrastructure-litellm/README.md`; rig gotchas and real-backend app behaviours →
`apps/learner-app/e2e-realuse/README.md` and `apps/learner-app/e2e-native/README.md`.

## COMPLETED

- **Learner web SPA hard loads are deployed and verified (2026-08-09).** GitHub Pages successfully
  deployed `b0bd09e`, the client-rendered `single` export required by
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md). The post-deploy
  `pnpm e2e:web:deployed` gate passed all three scenarios: arbitrary Expedition and Guardian hard
  loads reached their named unavailable surfaces with no page or console errors, and the OAuth
  refusal return remained clean. Deployment evidence: [Pages run 31327027343](https://github.com/sergkhl/lrnki/actions/runs/31327027343).

- **Self-hosted Better Auth and Google return legs (2026-08-08–09).** The shared API, schema, app,
  and rigs use Better Auth; the user confirmed real Google round trips on Android and web. Deployed
  controls cover cookie security, revocation, learner isolation, persistence, and rate limiting.
  The reset/reseeded local database also passes the real-backend phone and desktop journeys, while
  the returned-refusal gate remains proven locally and against the Pages artifact without a sign-in
  or database touch. Durable policy: [ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md);
  auth gate commits: `03cdc32`, `d949177`, `3361bfc`.

- **The shared host's judge is exercised on its new model (2026-08-08).** The 08-07 swap of
  `kg-independent-judge` to `deepseek-v4-flash-0731` had never taken effect on the VPS — LiteLLM
  reads its config once at start and the deploy rebuilds only `migrate`/`learner-api`/`caddy`, so a
  repointed alias still resolved while serving the model it replaced (`LiteLLM_SpendLogs`: 0
  deepseek, 654 gpt-oss-120b across 08-07/08-08). The 08-08 redeploy recreated the router, and U4's
  rule-14 gate then drove **118 deepseek-v4-flash-0731 calls** through it with 48 of 48 study items
  admitted and none rejected — so the now-running judge is exercised, not merely configured. Reload
  step and the silent-stale-alias trap live in [README](../../README.md) → Deployment.

- **Matching item quality (2026-08-08).** Matching was defective since its first measurement in three
  classes needing three mechanisms. All shipped: a role-asymmetric facet-spanning pair contract
  written to both the prompt and the forced-tool descriptions, a contiguous-word containment veto, a
  graph-vocabulary prohibition in one shared partial, and **Matching Assignment Verification** — an
  N×N cross-family fit check with the answer key hidden by a deterministic sort, sharing the
  two-round verification envelope with the other verified types (denominator 15 → 16). Gated over two
  domains on the deployed container: 4 ambiguous items removed through both veto branches, zero
  unavailability admissions. Closed with one clause knowingly unmet — **1 admitted item of 26 still
  carries an ambiguous pair set** — accepted as a directional invariant in
  [ADR-0026](../adr/0026-typed-study-item-bank.md). Two generation-side changes were deferred so the
  branch merged exactly as gated; both are carried in the model-evaluation brainstorm. Plan deleted,
  detail in git at `4ea7e64`. Fast-forwarded into `main`, pushed, and redeployed — the shared host
  left the feature branch on 2026-08-08.

- **Study Item grounding and key verification (2026-08-07).** One contract was failing in both
  directions: it verified quote mechanics and never claim truth, so it destroyed half the bank over
  quotes the model failed to reproduce while admitting an item whose "true" statement was false.
  Deterministic half: one grounding-shape owner, unique passage ids, bullet grounding, and a
  resolution ladder that repairs a mis-addressed citation — measured alone at **24 of 48 items → 48
  of 48, zero rejections**. Semantic half: **Study Item Key Verification** replaces the lie-only
  judge, classifying *every* candidate answer and enforcing answer-key uniqueness, with the forgiving
  third rung admissible only where that judge checks the claim. Two real-use runs held coverage at 48
  and 46 of 48 and **all 30 impostor items were free of a second falsehood**. Durable policy in
  [ADR-0026](../adr/0026-typed-study-item-bank.md); plan deleted, detail in git at `7fb9a2d`.

- **The public API serves from the deployed container only (2026-08-05).** Caddy's dev-first
  fallback and the host runtime it preferred are gone: one upstream, and the API dev loop moved
  inside the container as `docker compose watch learner-api`. The deploy refuses while a watch
  session is attached and probes the container before the public hostname, so *the artifact started*
  and *the hostname reaches it* are asserted separately. File binds now set `create_host_path: false`
  and `AGENTS.md` rule 23 states where compose may run. Durable decision in
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md); plan deleted.

- **Drizzle migrations integrated and the shared deployment cut over (2026-08-05).** Closed with the
  VPS cutover only an operator could run. The shared database classified as **`stale-baseline`, not
  the `legacy-schema` the blocker predicted** — it carried a migration row frozen at 2026-06-19 while
  a later shell/SQL init path advanced the schema to 56 tables without updating it, so the guard was
  right that the row no longer described the schema. The runbook then ran exactly as written. Durable
  decision in [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md); plan
  deleted, detail in git.

## VALIDATION

### Real-use quality evaluation — 2026-08-09

- Milestone: learner web hard loads use one client-rendered SPA shell, that shell is deployed to Pages, and the menu handoff test is deterministic.
- Fixture and source type: production-format local Expo export plus the Pages artifact at `b0bd09e`; dynamic Expedition/Guardian 404s, the AE9 checkpoint journey on phone and desktop, and the deployed OAuth-refusal return.
- Real model calls used: not applicable; transport is intercepted and no generated content is evaluated.
- Result: PASS.
- Useful output observed: both local and deployed dynamic hard loads reached their named unavailable surfaces with zero page/console errors; after a local Expedition hard load, the first checkpoint press exposed the Activity Sheet option and the journey completed. Pages run 31327027343 deployed successfully and `pnpm e2e:web:deployed` passed 3/3.
- Defects observed: pre-fix stress reproduced React #418 in 2/100 hard loads and the artifacts carried `__EXPO_ROUTER_HYDRATE__`; no hydration defect remains in the local `single` export. One non-gating five-worker saturation run lost a press without a page error; the required one-worker-per-journey stress passed 100/100 and the full five-worker suite passed 70/70.
- Changes made after inspection: selected Expo `single` output, added a prerendered-artifact guard and dynamic-route gates, and controlled the menu's real zero-delay timer in Jest without changing shipped behavior.
- Remaining caveats: the existing Expo/Jest post-test logger and Watchman warnings remain unrelated.
- Safe to continue downstream: yes; local and deployed completion are both verified.
