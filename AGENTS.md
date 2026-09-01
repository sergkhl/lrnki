## Documentation authority

Keep one canonical definition for every fact:

- `AGENTS.md` owns engineering workflow and enforcement rules.
- `README.md` owns setup, commands, deployment, and shared-host runbooks.
- `CONTEXT.md` owns project language and ambiguity resolution.
- `docs/adr/` owns current durable architectural decisions and rationale.
- Source types own implemented interfaces. The Drizzle schema in
  `packages/infrastructure-postgres/src/schema/` owns persisted shapes; generated migration,
  snapshot, and journal files are mechanical artifacts and are never edited or applied by hand
  ([ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)).
- `content/catalog.json` owns catalog membership and order. Each tracked
  `content/expeditions/<key>/expedition.json` owns one complete authored Expedition, including its
  keyed online source credits and exact teaching references.
- A linked brainstorm owns accepted framing only until its decisions are implemented, abandoned, or
  re-homed. A linked ready/in-progress plan owns active implementation design and its Validation Log.
- `docs/plans/TODO.md` owns current work and rolling completed outcomes;
  `docs/plans/BLOCKERS.md` owns unresolved user-only actions.

Do not restate another document's content. Link to its authority. Delete superseded definitions and
repair their references in the same change.

## Documentation workflow

- Apply the `plan-lifecycle` skill when reading or writing `docs/plans/`. It comes from the
  `agent-workflow-core` plugin, installed globally rather than vendored here. lrnki does not adopt
  `docs/plans/RELEASE.md`; never create it.
- Keep `CONTEXT.md` a glossary: one or two sentences per project term, with behavior and exact shapes
  elsewhere.
- Retain an ADR only for a hard-to-reverse, surprising decision with a real trade-off. Keep one
  decision per ADR, state current policy and rationale, and omit implementation walkthroughs and
  validation transcripts. Delete a fully superseded ADR and repair inbound links; never reuse its
  number.
- Accepted ADRs bind shipped behavior. Report a conflict rather than silently choosing one side.
- Keep a plan under about 800 lines and its Validation Log under about 200 lines.
- `TODO.md` has exactly `TODO`, `COMPLETED`, and `VALIDATION` sections, zero to seven current tasks,
  at most eight grouped completed outcomes, and exactly one latest plan-less validation. Keep it
  under about 150 lines.
- Never link retained documentation to gitignored `tmp/`. Preserve an uncommitted plan or validation
  record in Git history before deleting it, then commit consolidation separately from the record it
  replaces.

## Validation authority

- Intercepted web, real-backend web, native emulator/simulator, deployed, distributable, and
  physical-device evidence each prove only the layer they exercise; none substitutes for another.
- A native scenario gains automatic authority for one regression class only when its owning README
  records an intended behavior-only negative-control failure and a correlated user-recorded physical
  pass. Current Android claims live in `apps/learner-app/e2e-native/README.md`.
- Agents may initiate emulator or simulator runs on a capable host. Physical-device runs remain
  user-initiated and belong in `docs/plans/BLOCKERS.md` only when a plan actually requires them.
- Before running or qualifying evidence, apply `.agents/skills/validate-lrnki/SKILL.md` and its
  smallest relevant environment reference.
- Structural qualification proves structure and exact source-credit resolution, not teaching
  quality or semantic support. Inspect every learner-visible lesson, answer, explanation, pair,
  impostor reveal, Support target, and Guardian pool against its cited online evidence. Record
  `FIX_FIRST` for unsupported material claims, incorrect or non-unique keys, prerequisite leakage,
  unhelpful Support, or an incoherent route; repair every `FIX_FIRST` before acceptance.
- Every zero-row or absence assertion needs a positive control over the same inspection seam.

## Rules

1. This is greenfield development. Breaking changes and guarded local development/test database
   resets are allowed; do not preserve compatibility unless explicitly requested.

2. Enforce [ADR-0001](docs/adr/0001-adopt-greenfield-deep-module-architecture.md). Prefer one deep
   learner-runtime interface to transport-shaped helpers or duplicated policy.

3. Use the project language in [CONTEXT.md](CONTEXT.md).

4. Enforce [ADR-0042](docs/adr/0042-author-expeditions-directly-without-runtime-models.md). Codex CLI
   is an offline author only: the repository contains no model client, model port, prompt, compiler,
   package, installer, or model call in build/runtime. Authors write the exact runtime document.

5. Follow [content/AUTHORING.md](content/AUTHORING.md). Run `pnpm content:check`; never weaken a
   catalog refusal or check in a second content representation. Content must qualify all-or-nothing
   in CI and learner-api startup.

6. Human-readable authored keys are the only content identifiers. Array order is instructional
   order; prerequisites, Support destinations, difficulty, and Guardian pools are explicit. Runtime
   code must not derive a competing route.

7. Keep answer keys server-private. The Expo app imports only learner-api DTOs and never imports
   learner-runtime, content documents, Postgres types, or grading state.

8. Enforce [ADR-0003](docs/adr/0003-use-postgres-json-table-artifact-store.md),
   [ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md), and
   [ADR-0041](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md). Better Auth owns
   identity; one validated learner aggregate owns application state.

9. `DATABASE_URL` lives in the repo-root `.env` and is not auto-loaded by the shell or test runner.
   Use `node --env-file=.env …`, `tsx --env-file=.env …`, or explicitly export it before DB commands.
   Run `pnpm test:db` for DB-backed automated tests; it resets and targets only `lrnki_test` through
   `TEST_DATABASE_URL`, never the development database.

10. Tracked learner sources and documents belong under `content/`; reports, screenshots, generated
    build artifacts, and scratch output belong in gitignored `tmp/`.

11. Enforce [ADR-0013](docs/adr/0013-verify-quality-by-real-source-inspection.md) and
    [ADR-0028](docs/adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).
    A green deterministic suite does not establish authored teaching quality.

12. A deterministic qualifier may hard-veto only a provable structural guarantee. Semantic source
    support remains direct judgment; do not encode heuristic lexical proxies as truth.

13. Delete a superseded path, schema, dependency, export, script, config field, or documentation
    definition in the same cutover that replaces it. Keep one source of truth; any second
    representation must be mechanically generated.

14. Before fixing a real-use defect, name its established problem class and research recognized best
    practices. Prefer a conventional root-cause solution; record why a bespoke solution is necessary.

15. Prioritize the Learner App game experience and enforce
    [ADR-0032](docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md). Before adding
    a mechanic, record its learner-visible goal, mastery relationship, challenge curve, distractions,
    and focused real-use evidence. Graded Guardian evidence must never become acquisition mastery.

16. Enforce [ADR-0035](docs/adr/0035-separate-learner-app-static-spa-typed-api.md). Hono authenticates
    and maps transport; learner-runtime owns reads/transitions; Expo owns presentation.

17. Run shared-host Compose only from the deploy checkout on its host and always detached. Never run
    it inside an agent container whose workspace path differs from the Docker daemon's host path
    ([ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md)). File binds fail
    closed on `up`; `watch` and `down` are not protected, and attached `up` stops with its terminal.
