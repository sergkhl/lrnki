<!-- Hygiene (rules: README.md → Retention). TODO 3–7 items (an item over ~15 lines needs a plan
     file); COMPLETED ≤8 entries of ~8 lines, rolling — adding one deletes the oldest; VALIDATION =
     exactly one entry, ~20 lines, and only for work no plan owns — a plan's own validation lives in
     its `## Validation Log`. Whole file ≤ ~150 lines. Consolidate outward before deleting: move
     anything that outlives this directory to its owner (ADR, AGENTS.md, CONTEXT.md, a rig README, a
     skill) in the same change. Never delete an uncommitted plan or an uncommitted validation
     record: commit first, delete in a later commit. -->

# TODO

## TODO

- **Better Auth integration — next, ready to start.** Plan:
  [2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md), interview-locked 2026-08-08.
  Self-hosted Better Auth inside `learner-api` replaces the PIN placeholder: Google sign-in primary,
  email/password as the e2e/fallback path, cookie sessions on web and native, `learnerRef` =
  `user.id`, shared-DB hard reset at cutover. Its precondition is met — matching is closed. Next
  action: branch `feat/better-auth` off `main` and open U1. The Google OAuth client +
  `BETTER_AUTH_SECRET` are user-owned manual actions tracked in [BLOCKERS](./BLOCKERS.md) and can
  happen in parallel.

- **Generation model evaluation — shaping, needs a planning interview.** Brainstorm:
  [2026-08-08-002](../brainstorms/2026-08-08-002-generation-model-evaluation.md), which owns the
  framing, the measured evidence, the candidate options, and the two carried generation-side changes
  (remove the blueprint's over-firing matching-facet constraint; raise
  `MATCHING_GENERATION_ATTEMPTS`). Headline: DeepSeek v4 Flash beats MiMo v2.5 on yield/latency/price
  but is unmeasured on truth, the bake-off's pre-registered re-decision test turned out to be the
  wrong instrument, and `kg-claim-extraction` serves **11 prompts** including `grounding-generation`
  — which drags the judge along under [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md).
  **The judge has nowhere independent to go today, and that is what actually gates this.**

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

- **Not fixed — pre-existing e2e flake.** `reduced motion renders the final collected scene
  immediately with equivalent copy (AE9)` fails roughly 1 run in 20 on both projects: the click on
  `checkpoint-option_select-available` lands but the Activity Sheet never opens. The neighbouring test
  does identical clicks but screenshots first, which settles the page — so the suspect is the trail's
  post-load measure/auto-scroll racing the press, i.e. possibly a real "tap does nothing right after
  load" defect rather than a test bug. Worth a bounded look before it is papered over with a wait.

- **The shared host's judge model changed on 2026-08-08 and has never been exercised there.** The
  08-07 swap of `kg-independent-judge` to `deepseek-v4-flash-0731` never reached the VPS — the deploy
  rebuilds only `migrate`/`learner-api`/`caddy` and LiteLLM reads its config once at start, so the
  alias resolved while serving the model it replaced. `LiteLLM_SpendLogs`: **0 deepseek, 654
  gpt-oss-120b** across 08-07/08-08, so U4's VPS expeditions were judged by the old model (its
  discrimination probes ran against a workstation LiteLLM that did have the new one). The router was
  reloaded during the 08-08 redeploy, which makes the now-running judge the unexercised one — needs a
  rule-14 gate on the shared host before the next gate leans on it. Reload step and trap in
  [README](../../README.md) → Deployment.

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

- **Crystal Guardian Ward Obelisk closed by its ADR-0038 native pass (2026-08-01).** The native gate
  now reaches the Guardian at all, through a Maestro flow over a deterministic five-ward Leg
  challenge whose combat state is folded by the **production** `foldRecallChallenge` /
  `projectRecallChallengeView`, so no combat rule is represented twice. On a real APK, all five plan
  states were observed, plus the seven-ward Expedition Guardian, 320 dp containment, and
  animations-off. **The pair the pass existed to judge — resolved-versus-queued — separates
  structurally on the native canvas.** Durable scope in
  [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md) and
  `apps/learner-app/e2e-native/README.md`; plan deleted.

- **Expedition summit reachability and Leg cadence (2026-08-01).** Legs became a boundary partition
  over a fixed trail order — split at sub-terminal milestones past the Guardian's ward budget, merged
  when a Leg carries no Study Item — so no unwinnable Leg can exist and the summit gate ranges over
  winnable Legs. Both expeditions were played to a won Expedition Guardian on a real backend. Durable
  rules folded into [CONTEXT](../../CONTEXT.md) and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Guardian scope identity is (kind, anchor) on the client (2026-08-01).** The first reachable summit
  exposed three defects with one cause — the summit's anchor IS the last Leg's milestone. The arrival
  memory, the trail node's test id, and the figure's accessible title now all derive from scope
  identity (`recallScopeKey`, `guardianScopeTitle`), so a Leg can no longer answer for the summit.

- **Learner API survives a Postgres outage and reports real errors (2026-08-01).** Generation
  bookkeeping no longer masks failures behind success-shaped records.

## VALIDATION

No active plan-less validation records. The latest validation is the matching plan's U4 correctness
gate of 2026-08-08 — two topic expeditions on the shared VPS deployed container after `pnpm db:reset`,
all 26 admitted matching items hand-inspected, both 5-draw probes passing — recorded in the
now-deleted `2026-08-07-001` plan and reachable at `4ea7e64`. Consolidated before deletion: the
accepted ambiguity tail into [ADR-0026](../adr/0026-typed-study-item-bank.md), the
model-scoped-evidence rule into [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
and the single-judge/no-fallback attribution invariant into
[ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md).
