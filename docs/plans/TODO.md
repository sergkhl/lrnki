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

- **A generated impostor item can contain two false statements.** In the 2026-08-05 VPS real-use run,
  the `Deep ocean return flow` impostor asked which statement is FALSE and designated the
  wind-driven one (`lieSource: sibling`, `siblingLabel: Downwelling`) — a well-built lie with a
  correct reveal. But a second option, *"Deep ocean return flow is also known as the deep western
  boundary current"*, is also false: the DWBC is one western-intensified limb **of** the return flow,
  not a synonym for it, and it contradicts the item's own third statement describing a basin-spanning
  floor-hugging flow. A learner who knows the difference is marked wrong for the right answer.
  Distractor truth is currently only constrained for the designated lie; the truth of the remaining
  statements is not checked against the concept's own lesson. Establish the problem class and a
  conventional check before designing one (rule 21).

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
  `openai/gpt-oss-120b` is the forced-tool provider lock and its shared free-tier limit is tripped by
  the pipeline's concurrent brackets, not by one request. A saturated bracket can also return a
  degraded response with no tool call at all (`{"kind":"no_tool_call"}` in
  `operation_run_stages.error_detail`) — that is upstream load, not a schema defect. There is no
  fallback model group, so the only remedies are waiting and retrying; do not lower production
  concurrency to make a gate pass.
- **Native gate host setup** — emulator autofill, the starved-boot ANR, and the device selector are
  owned by `apps/learner-app/e2e-native/README.md`.
- **Three real-backend app behaviours worth not rediscovering the hard way:** the Guardian arrival
  dialog owns the pointer when a Leg falls (take the dialog, not the node); `activate` needs the
  calling learner's own `learner_expeditions` row; and a theory read is only recorded for the
  learner's active expedition.

## COMPLETED

- **The public API serves from the deployed container only (2026-08-05).** Caddy's dev-first
  fallback is gone: one upstream, no active health checks, and the host runtime it preferred
  (`dev:api`, the learner-api `dev`/`start` scripts) deleted with it. The API dev loop moved inside
  the container as `docker compose watch learner-api`, which works because the image runs `tsx` on
  source and pnpm's in-image workspace symlinks are relative into `/app/packages` — the exact sync
  target. The deploy now refuses while a watch session is attached and probes the container directly
  before the public hostname, so the two claims *the artifact I deployed started* and *the public
  hostname reaches it* are asserted separately. **Deployed to the VPS the same day**, which is what
  actually closed the hole: `COMPOSE_PROFILES=public` set on the shared host, the single-upstream
  Caddy built and running, and the `br-lrnki → 8787` ufw rule deleted (v4 and v6) now that nothing
  binds it. The residual — one checkout reachable at two paths through an agent container, not two
  checkouts — is closed too: every file bind now sets `create_host_path: false`, so a caller
  resolving a path the daemon cannot see is refused by name instead of having an empty directory
  created and mounted over a config file, and `AGENTS.md` rule 23 states where compose may run.
  Durable decision in
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md); the plan is deleted.

- **Drizzle migrations integrated and the shared deployment cut over (2026-08-05).** The whole plan
  shipped, closing with the VPS cutover that only an operator could run. The shared database
  classified as **`stale-baseline`, not the `legacy-schema` the blocker predicted**: it already had a
  `drizzle.__drizzle_migrations` row, hash `e9011ad9…` / `created_at 0`, which is the sha256 of
  `0000_initial_lrnki_schema.sql` **as of `e8ffa42` (2026-06-19)** — back when that file was
  hand-written and authoritative. The later shell/SQL init path re-applied newer DDL straight through
  `psql` and never wrote the metadata table, so the schema advanced to 56 tables while the recorded
  row stayed frozen in June; the guard was right that the row's claim no longer described the schema.
  The runbook then ran exactly as written and the reset guard exited 0, the migrator applied `0000`
  once, and a re-run reported `current` with no DDL. Durable decision stays in
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md); the plan is deleted.

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

- **Build unblocked and dependencies bumped (2026-07-31).** `pnpm build`'s root cause was an ambient
  `NODE_ENV`, not Next.js; Next was moved to 16.2.12 for a security fix.

## VALIDATION

- **Single public upstream deployed to the VPS — 2026-08-05, shared environment. PASS.**
  - *Milestone:* `api.lrnki.globesoul.com` now resolves only to the `learner-api` container
    (ADR-0040), with the host dev runtime and its firewall hole gone.
  - *Fixture and source type:* a cold synthetic topic expedition, *"How thermohaline circulation
    moves heat through the ocean"* — deliberately outside `fixtures/` so nothing was rehearsed.
  - *Real model calls:* yes, production, through the deployed container's own LiteLLM credentials.
  - *Useful output observed:* 14 stages, `ready` in **324 s**, `declaredDomain` inferred as
    *Oceanography* with all 16 concepts `llm_grounded` and zero anchor/source-mentioned. The
    prerequisite graph is scientifically sound and monotone in difficulty — temperature/salinity
    effects → seawater density → downwelling → deep water formation → NADW/AABW — over 13 certain
    and 2 uncertain edges, partitioned into 7 sections. Lessons are accurate (the timescales lesson
    gives the standard 500–1 000-year loop) and option-select distractors are domain-meaningful
    rather than filler (tidal forcing, Ekman transport, solar heating alone).
  - *Defects observed:* one content defect, recorded in TODO — a generated impostor item carries a
    second false statement beside its designated lie. Also **3 of 16 concepts have no study item**,
    including `Seawater density`, the highest-degree node in the graph (two prerequisites in, two
    dependents out), so the hub concept is unassessable. And 324 s to first playable content is
    direct evidence for the standing *progressive readiness* follow-up above.
  - *Changes made after inspection:* none to generation — every defect predates this milestone and
    none is caused by the traffic-path change.
  - *Remaining caveats:* the content defect is unfixed; the generation layer does not check the
    truth of non-designated statements.
  - *Safe to continue downstream:* yes.

  Path evidence, separate from quality: the deploy's container-direct probe and public poll both
  passed, and the **interception negative control now runs end-to-end over real TLS** rather than
  against a local Caddy — with a real impostor bound on the VPS's `0.0.0.0:8787` returning
  `{"impostor":"HOST-8787"}`, the loopback served the impostor while the public hostname served the
  container's `{"ok":true}`. `host.docker.internal` is additionally `NXDOMAIN` inside Caddy, since
  nothing grants it `host-gateway`. One authenticated round trip over TLS passed
  (`POST /session` → `/me` → `/catalog` → `DELETE /session` → 401), and the probe learner was removed
  through `cleanupReservedLearners`, leaving **0 rows in `learners`** — which also proves the two
  reserved learners a previous TODO entry expected to delete were already destroyed by the schema
  cutover.
