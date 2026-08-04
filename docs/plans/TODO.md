# TODO

## TODO

- **IN PROGRESS — Integrate Drizzle migrations.**
  [U1-U2 are complete](./2026-08-04-001-refactor-integrate-drizzle-migrations-plan.md): the internal
  lifecycle schema is now the only hand-edited persisted-shape definition, and its generated SQL,
  snapshot, and journal replaced the handwritten lineage together after exact catalog and all-view
  parity on `lrnki_test`. `pnpm db:check` is green and runs near the start of `pnpm check`.
  **Next:** execute U3 as one coherent slice: implement the internal migration module and typed state
  classifier, advisory lock, CLI, targeted reset path, and state-matrix tests; delete the temporary
  direct-`psql` applicator only after host and DB-test commands cross the new interface. Then run the
  plan's real-use persistence gate on a freshly migrated development database before U4.

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

- **The two reserved learners are now deletable.** `realuse-obelisk-u4` (PIN `4417`) and
  `realuse-probe-summit0731` (PIN `7731`) each own the only `ready` `learner_expeditions` row for
  their expedition. The native pass turned out to need neither — it runs against the loopback
  fixture — so nothing is stranded by deleting them. Only `realuse-probe-summit0731` matches
  `RESERVED_REF_RE` in `@lrnki/infrastructure-postgres/test-support`; the other needs the shared
  `deleteLearner` helper.

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
- **A long-lived host `pnpm dev:api` races the container and can poison the attempts it steals.**
  `topicGenerationSupervisor` polls every 15 s and allows only `MAX_GENERATION_ATTEMPTS = 3`, so a
  host process splits the attempt budget with the container's. Worse, `tsx watch --env-file` reads
  `.env` once at process start, so a session started before a key repair keeps serving the dead key.
  Diagnose by source IP, not by message — in `docker logs lrnki-litellm` the container is `172.18.0.5`
  and anything on the host is the gateway `172.18.0.1`. Use the container, or stop it first.
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

- **Treasure-map trail restyle (2026-07-19).** The trail screen became one parchment field-chart with
  procedural, deterministic, nonsemantic decoration.

- **Topic Expedition speed, generated-grounding reliability, and claim reliability (2026-07-18→19).**
  Provider lock and alias work on generation speed, plus topic-claim fencing and DB-test isolation
  against `lrnki_test`.

## VALIDATION

- **Drizzle migration U2 — 2026-08-04. PASS at the generated-lineage boundary.** The committed
  generated baseline has exactly 56 tables, nine views, one `0000` SQL, one snapshot, and one journal
  entry. Its 1,346-record normalized PostgreSQL catalog report is byte-equal to the handwritten
  oracle across relations, columns/types/defaults/nullability, named constraints and FK actions,
  indexes/order/operator classes/predicates, and view definitions. Deterministic payload probes
  returned byte-equal rows and PostgreSQL types through all nine inspection views. `pnpm db:check`,
  the infrastructure package typecheck, `pnpm test:db` from a full `lrnki_test` reset, Compose config,
  `git diff --check`, and `env -u NODE_ENV pnpm check` passed; the browser envelope was 64/64 and lint
  retained four unrelated warnings with zero errors. Only `lrnki_test` was reset; the development
  database, shared deployment, Compose migration path, and application stores were untouched. The
  U3 real-use persistence gate remains intentionally pending until the programmatic migrator and
  reset state machine are foundationally green.
