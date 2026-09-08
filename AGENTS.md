## Documentation authority

- `AGENTS.md` owns engineering workflow and enforcement rules.
- [README.md](README.md) owns setup, shared commands, deployment, and shared-host runbooks.
- [CONTEXT.md](CONTEXT.md) owns project language and ambiguity resolution.
- [ADRs](docs/adr/README.md) own durable architectural decisions and rationale.
- Source types own implemented interfaces; the [Drizzle schema](packages/infrastructure-postgres/src/schema/)
  owns persisted shapes under [ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).
- [The catalog](content/catalog.json) owns membership and order; each Expedition document owns its
  authored content. [The authoring guide](content/AUTHORING.md) owns authoring and semantic acceptance.
- [validate-lrnki](.agents/skills/validate-lrnki/SKILL.md) owns validation routing and triage;
  rig READMEs own their execution procedures and scenario claims.
- A linked brainstorm owns accepted framing until implemented, abandoned, or re-homed. A linked
  ready/in-progress plan owns active design and its Validation Log.
- [TODO](docs/plans/TODO.md) owns current work and rolling outcomes;
  [BLOCKERS](docs/plans/BLOCKERS.md) owns unresolved user-only actions.

Link to a fact's owner instead of restating it. Remove superseded definitions and repair references
in the same change.

## Documentation workflow

- `docs/plans/` follows the `plan-lifecycle` conventions from the globally installed
  `agent-workflow-core` plugin; run `/plan-lifecycle` when changing how plans are structured. lrnki
  does not adopt `docs/plans/RELEASE.md`; never create it.
- Keep `CONTEXT.md` a glossary: one or two sentences per term, with behavior and exact shapes elsewhere.
- Retain an ADR only for a hard-to-reverse, surprising decision with a real trade-off. Keep one
  decision per ADR, with current policy and rationale rather than walkthroughs or validation logs.
  Delete fully superseded ADRs and repair inbound links; never reuse their numbers.
- Accepted ADRs bind shipped behavior. Report conflicts rather than silently choosing one side.
- Keep plans under about 800 lines and their Validation Logs under about 200 lines.
- `TODO.md` has exactly `TODO`, `COMPLETED`, and `VALIDATION` sections, zero to seven current tasks,
  at most eight grouped completed outcomes, and exactly one latest plan-less validation. Keep it
  under about 150 lines.
- Never link retained documentation to gitignored `tmp/`. Preserve uncommitted plans and validation
  records in Git history before deleting or consolidating them; commit consolidation separately.

## Validation authority

- Intercepted web, real-backend web, native emulator/simulator, deployed, distributable, and
  physical-device evidence each prove only the layer exercised; none substitutes for another.
- A native scenario gains automatic authority for one regression class only when its owning README
  records an intended behavior-only negative-control failure and a correlated user-recorded physical
  pass. Current Android claims live in the [native rig README](apps/learner-app/e2e-native/README.md).
- Use a connected physical Android device for Android E2E tests. Agents may initiate these local
  fixture-backed runs when Android E2E is in scope. Resolve and pin one ready device serial for both
  installation and Maestro; if several physical devices are connected, require an explicit target.
  Do not start or substitute an Android emulator unless the user or active plan explicitly selects
  one. Preserve the device's existing display settings and follow the [native rig procedure](apps/learner-app/e2e-native/README.md#android-execution).
- Agents may initiate iOS simulator runs on a capable host. Physical acceptance and other physical
  device runs remain user-initiated; automated Android E2E does not establish user-recorded physical
  acceptance. Add a blocker only when an active plan requires one.
- Before running or qualifying evidence, apply [validate-lrnki](.agents/skills/validate-lrnki/SKILL.md)
  and its smallest relevant environment reference.
- Enforce the [authored-quality decision](docs/adr/0013-verify-quality-by-real-source-inspection.md)
  through the [authoring acceptance rubric](content/AUTHORING.md#semantic-quality-rubric).
- Every zero-row or absence assertion needs a positive control over the same inspection seam.

## Engineering rules

1. This is greenfield development. Breaking changes and guarded local development/test database
   resets are allowed; do not preserve compatibility unless explicitly requested.
2. Follow [the authoring guide](content/AUTHORING.md) and
   [offline-authoring policy](docs/adr/0042-author-expeditions-directly-without-runtime-models.md).
   Run `pnpm content:check`; never weaken a catalog refusal to admit content.
3. Enforce the [learner-runtime and client boundary](docs/adr/0035-separate-learner-app-static-spa-typed-api.md).
   Keep internal and test-only helpers private; ports belong at external or replaceable seams.
4. Enforce the [storage](docs/adr/0003-use-postgres-json-table-artifact-store.md),
   [schema](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md), and
   [identity](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md) decisions.
5. Use the [documented database wrappers and environment loading](README.md#database).
   Run DB-backed tests only through `pnpm test:db`, targeting `lrnki_test`.
6. Tracked learner sources and documents belong under `content/`; reports, screenshots, build
   artifacts, and scratch output belong in gitignored `tmp/`.
7. Delete superseded paths, schemas, dependencies, exports, scripts, and config in the same cutover
   that replaces them. Any second representation must be mechanically generated.
8. Before fixing a real-use defect, name its established problem class and research recognized best
   practices. Prefer a conventional root-cause solution; record why a bespoke solution is necessary.
9. Before adding a game mechanic, record its learner-visible goal, mastery relationship, challenge
   curve, distractions, and focused real-use evidence under
   [the game UX decision](docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## Execution authority

Ordinary repository work does not authorize deployment, shared/production resets or writes,
store/distributable builds, or physical-device acceptance.

### Shared-host Compose

Run shared-host Compose only from the deploy checkout on its host and always detached. Never run it
inside an agent container whose workspace path differs from the Docker daemon's host path. File
binds fail closed on `up`; `watch` and `down` are not protected, and attached `up` stops with its
terminal. The public-route policy is [ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md);
commands belong to the [deployment runbook](README.md#deployment).
