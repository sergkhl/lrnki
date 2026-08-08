<!-- Hygiene (rules: README.md → Retention). TODO 3–7 items (an item over ~15 lines needs a plan
     file); COMPLETED ≤8 entries of ~8 lines, rolling — adding one deletes the oldest; VALIDATION =
     exactly one entry, ~20 lines, and only for work no plan owns — a plan's own validation lives in
     its `## Validation Log`. Whole file ≤ ~150 lines. Consolidate outward before deleting: move
     anything that outlives this directory to its owner (ADR, AGENTS.md, CONTEXT.md, a rig README, a
     skill) in the same change. Never delete an uncommitted plan or an uncommitted validation
     record: commit first, delete in a later commit. -->

# TODO

## TODO

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

- **Matching item quality — all four units gated; one acceptance clause is not met, and the call is
  yours.** Plan: [2026-08-07-001](./2026-08-07-001-fix-matching-item-quality-plan.md), which owns the
  full record and the open findings. U4 ran both 5-draw probes (pass) and two real-use runs on the
  VPS deployed container after `pnpm db:reset` — `Thermohaline circulation` and `Monetary policy
  transmission` — and hand-inspected all 26 admitted matching items. The stage works: 4 ambiguous
  items removed, both veto branches fired, zero unavailability admissions, ~$0.019 a topic. But
  **1 of 26 admitted items still carries an ambiguous pair set** against a bar of none. Next action
  is a decision, not code: accept the tail and close the plan, or spend a unit on judgment stability
  (the shipped rule vetoes that board on a re-judgment, so it is sensitivity, not a missing
  mechanism).

- **Better Auth integration — planned, queued after matching.** Plan:
  [2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md), interview-locked 2026-08-08.
  Self-hosted Better Auth inside `learner-api` replaces the PIN placeholder: Google sign-in primary,
  email/password as the e2e/fallback path, cookie sessions on web and native, `learnerRef` =
  `user.id`, shared-DB hard reset at cutover. Next action: after `fix/matching-item-quality` merges,
  branch `feat/better-auth` and open U1. The Google OAuth client + `BETTER_AUTH_SECRET` are
  user-owned manual actions tracked in [BLOCKERS](./BLOCKERS.md) and can happen in parallel.

- **`main` is at `f1224c3` and unpushed; the shared VPS now runs `fix/matching-item-quality` at
  `d8d3bf2`.** U4's gate deployed the branch to the VPS after a `pnpm db:reset` (D11), so the shared
  environment carries the matching work and its two gate expeditions but **not** `main`. The branch
  is pushed to `origin`; `origin/main` is still behind local `main`. When the branch merges, redeploy
  so the VPS leaves a feature branch, and check the checkout back onto `main`.

- **Model assignment, and a DeepSeek target gated on evidence.** `litellm/config.yaml` owns the
  mapping and every per-model measurement (AGENTS rule 5); live state only here. The judge is
  `deepseek-v4-flash-0731`, single, no fallback, **smoke-tested not measured** — U4's probes qualify it
  as well as the new stage, gpt-oss-120b evidence does not carry over, and an ADR amendment is owed
  (ADR-0007/0005, ADR-0013). `kg-prerequisite-ordering` keeps gpt-oss-120b and its Groq exposure.
  **Intended direction: generation moves to DeepSeek if the evidence confirms.** The 2026-08-08
  blueprint bake-off puts it ahead on yield, latency and price while buying part of that by never
  declining a node; `mimo-v2.5-pro` is measured and rejected. **U4 removed the gate that decision was
  waiting on:** Matching Assignment Verification checks fit, not claim truth, so it does not catch
  the off-node drift and false match DeepSeek's extra items carried — the call needs a direct A/B
  instead. Moving the *default* alias has two hard preconditions: relocate the judge in the same change
  ([ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md)), and
  re-run the ADR-0013 gates — all of them were measured with MiMo generating.

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

Verified 2026-08-01. Load `.env` before anything touching the database:
`set -a; . ./.env; set +a`.

- **The stack runs on plain `docker compose`:** `lrnki-postgres` on 5433, `lrnki-litellm` on 4000,
  `lrnki-docling` on 5001, `lrnki-caddy` on 80/443, and `lrnki-learner-api` with supervisors and no
  published port — reach it with
  `docker exec lrnki-learner-api node -e '…fetch("http://127.0.0.1:8787"…)'`.
- **Rebuilding `lrnki-learner-api` fails silently in two different ways.** `docker compose up -d
  --build --no-deps learner-api | tail` reports **tail's** exit code, so a build that died on
  `no space left on device` (the Docker VM had 26 GB of build cache) still looks like exit 0 — never
  pipe it. And the container's `.Created` is not the image's: prove the recreate by comparing
  `docker inspect lrnki-learner-api --format '{{.Image}}'` against
  `docker image inspect lrnki-learner-api:latest --format '{{.Id}}'`. Reclaim with
  `docker builder prune -f`. Driving a stale container serves old behavior and looks green.
- **The real-use gates drive a locally composed API, not the container.** They spawn
  `apps/learner-api/src/realuseServer.ts` on port 8792 and serve `apps/learner-app/dist-realuse`, so
  that export must be rebuilt after any learner-app change or the gate silently judges the previous
  bundle: `EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8792 pnpm exec expo export --clear --platform
  web --output-dir dist-realuse` from `apps/learner-app`. Each run registers a disposable
  `realuse-probe-<id>` learner and does **not** delete it — clean up with `cleanupReservedLearners`.
  **Restart any host-run API after a `.prompt` edit:** `readPromptFile`/`readPartial` cache by path in
  module state, so a long-lived process keeps serving the prompts it read first — the stale-container
  trap, reproduced inside the working-tree escape from it.
- **A re-initialised `lrnki_postgres_data` volume silently breaks the LiteLLM app key.** LiteLLM's
  virtual keys live in its own database, so an empty volume leaves the `sk-…` in `.env` pointing at a
  key that no longer exists: generation dies `401` while `LITELLM_MASTER_KEY` still works, because
  the master key is validated from config rather than the key table. That asymmetry is how you tell a
  dead virtual key from an upstream provider problem, which instead shows up as **429 "No deployments
  available"**. Repair by minting a key via `POST /key/generate` with the master key, writing it to
  `.env`, and recreating the container — a plain `docker restart` will not do, since container env is
  fixed at creation. Keep any `.env` backup outside the repo: `.gitignore` covers `.env` but not
  `.env.bak-*`.
- **Tell host-run tools apart from the container in LiteLLM's logs by source IP, not by message.**
  In `docker logs lrnki-litellm` the container is `172.18.0.5` and anything on the host — admin-lab,
  kg-worker — is the gateway `172.18.0.1`. This matters because a host process reads `.env` once at
  start, so a session started before a virtual-key repair keeps presenting the dead key while the
  container has already picked up the new one; the two look identical in the message text.
- **Upstream Groq can throttle the topic pipeline to death while single calls look fine.**
  `openai/gpt-oss-120b` is the forced-tool provider lock (`provider.only: ["groq"]`,
  `allow_fallbacks: false` — ADR-0006's guarantee paid for in availability) and the limit is Groq's
  **requests-per-minute on OpenRouter's shared account**, tripped by the pipeline's concurrent
  brackets, not by one request. **Account credit cannot relieve it** — credits buy tokens, not request
  rate, so a funded balance and a sustained 429 coexist normally; `/v1/models` answering `200` is what
  rules out a dead virtual key. It takes out *every* judge stage at once. `kg-independent-judge` now
  has a LiteLLM deployment fallback (see `litellm/config.yaml`); no other judge alias does, so
  `kg-prerequisite-ordering` still stalls outright, and waiting and retrying remain the only remedies
  there. Do not lower production concurrency to make a gate pass. A saturated bracket can also return a
  degraded response with no tool call at all (`{"kind":"no_tool_call"}` in
  `operation_run_stages.error_detail`) — that is upstream load, not a schema defect.
  **Saturation is also visible as missing content rather than a
  failed run:** a judge exhausted by 429s makes Study Item Key Verification unavailable, which drops
  impostor items with a `… key verification unavailable: … 429` reason in `rejected_study_items`
  while option-select is untouched. A topic short only on impostors is a throttling signature, not a
  quality regression. The topic supervisor retries a failed attempt up to 3 times with a 2-minute
  stale window, so a run that dies mid-pipeline usually self-heals — check
  `learner_expeditions.generation_attempts` before re-triggering by hand.
- **Native gate host setup** — emulator autofill, the starved-boot ANR, and the device selector are
  owned by `apps/learner-app/e2e-native/README.md`.
- **Three real-backend app behaviours worth not rediscovering the hard way:** the Guardian arrival
  dialog owns the pointer when a Leg falls (take the dialog, not the node); `activate` needs the
  calling learner's own `learner_expeditions` row; and a theory read is only recorded for the
  learner's active expedition.

## COMPLETED

- **Study Item grounding and key verification (2026-08-07).** One contract was failing in both
  directions: it verified quote mechanics and never claim truth, so it destroyed half the bank over
  quotes the model failed to reproduce while admitting an item whose "true" statement was false.
  Fixed as one plan. Deterministic half: one grounding-shape owner, unique passage ids, bullet
  grounding, and a resolution ladder that repairs a mis-addressed citation — measured alone at
  **24 of 48 items → 48 of 48, zero rejections**. Semantic half: **Study Item Key Verification**
  replaces the lie-only judge, classifying *every* candidate answer and enforcing answer-key
  uniqueness, with the forgiving third rung admissible only where that judge checks the claim. The
  captured `Deep ocean return flow` defect is now rejected 5 of 5 draws, through the uniqueness
  branch the old judge lacked. Two real-use runs (Oceanography, Cryptography) held coverage at 48
  and 46 of 48 and **all 30 impostor items were free of a second falsehood**. The 2 missing items
  were the harm-based unavailability rule firing on a real 429, not vetoes — option-select lost
  nothing under the same throttling. Durable policy in
  [ADR-0026](../adr/0026-typed-study-item-bank.md); the plan is deleted, its detail in git at
  `7fb9a2d`.

- **The public API serves from the deployed container only (2026-08-05).** Caddy's dev-first
  fallback and the host runtime it preferred are gone: one upstream, and the API dev loop moved
  inside the container as `docker compose watch learner-api`. The deploy refuses while a watch
  session is attached and probes the container before the public hostname, so *the artifact started*
  and *the hostname reaches it* are asserted separately. Deployed the same day, which is what closed
  the hole; file binds now set `create_host_path: false` and `AGENTS.md` rule 23 states where compose
  may run. Durable decision in
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md); plan deleted, detail
  in git.

- **Drizzle migrations integrated and the shared deployment cut over (2026-08-05).** Closed with the
  VPS cutover only an operator could run. The shared database classified as **`stale-baseline`, not
  the `legacy-schema` the blocker predicted** — it carried a migration row frozen at 2026-06-19 while
  a later shell/SQL init path advanced the schema to 56 tables without updating it, so the guard was
  right that the row no longer described the schema. The runbook then ran exactly as written. Durable
  decision in [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md); plan
  deleted, detail in git.

- **Crystal Guardian Ward Obelisk closed by its ADR-0038 native pass (2026-08-01).** The last open
  item shipped: the native gate now reaches the Guardian at all, through a second Maestro flow over a
  deterministic five-ward Leg challenge whose combat state is folded by the **production**
  `foldRecallChallenge` / `projectRecallChallengeView`, so no combat rule is represented twice. On a
  real APK rebuilt from this tree, all five plan states were observed, plus the seven-ward Expedition
  Guardian, 320 dp containment, and animations-off. **The pair the pass existed to judge —
  resolved-versus-queued — separates structurally on the native canvas**: resolved is flat stone,
  queued keeps its facet seam. `run.ts` also gained the `--device` / `NATIVE_DEVICE` selector it
  lacked. Durable scope in [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md)
  and `apps/learner-app/e2e-native/README.md`; the plan is deleted.

- **Expedition summit reachability and Leg cadence (2026-08-01).** Legs became a boundary partition
  over a fixed trail order — split at sub-terminal milestones past the Guardian's ward budget, merged
  when a Leg carries no Study Item — so no unwinnable Leg can exist and the summit gate ranges over
  winnable Legs. Photosynthesis derives 4 Legs (was 3, first reward beat at 4 concepts instead of 12),
  Plate tectonics 6 (was 7). Both expeditions were played to a won Expedition Guardian on a real
  backend. Durable rules folded into [CONTEXT](../../CONTEXT.md) and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Guardian scope identity is (kind, anchor) on the client (2026-08-01).** The first reachable summit
  exposed three defects with one cause — the summit's anchor IS the last Leg's milestone. The arrival
  memory, the trail node's test id, and the figure's accessible title now all derive from scope
  identity (`recallScopeKey`, `guardianScopeTitle`), so a Leg can no longer answer for the summit.

- **Learner API survives a Postgres outage and reports real errors (2026-08-01).** Generation
  bookkeeping no longer masks failures behind success-shaped records.

- **Crystal Formation, Guardian obelisk, and overlay safe-area ownership (2026-07-30→31).** The
  cavern of Leg panels on the eight-crystal library, the bright formation with its Examine memory
  sheet, the fixed Ward Obelisk replacing the unstable three-specimen body, and safe-area framing
  moved into the app-owned wrappers. Durable rules folded into
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## VALIDATION

No active plan-less validation records. There are no active plans; the latest validation is the
Study Item key-verification gate of 2026-08-07, recorded in the deleted `2026-08-05-001` plan and
reachable at `7fb9a2d`. The 2026-08-05 VPS deployment record was consolidated before deletion — its
path evidence lives in
[ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md), its run in git at
`7417fbd`.
