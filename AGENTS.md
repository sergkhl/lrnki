## Documentation authority

Keep one canonical definition for every fact:

- `AGENTS.md` owns engineering workflow and enforcement rules.
- `README.md` owns setup, commands, deployment, and shared-host runbooks.
- `CONTEXT.md` owns project language and ambiguity resolution.
- `docs/adr/` owns current durable architectural decisions and rationale.
- Source types own implemented interfaces; the internal Drizzle schema in
  `packages/infrastructure-postgres/src/schema/` owns persisted data shapes. The generated `0000`
  migration, snapshot, and journal are mechanical artifacts and are never edited or applied by hand
  ([ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)).
- A linked file in `docs/brainstorms/` owns accepted problem framing, requirements, and scope until
  that work is completed or abandoned.
- A linked ready/in-progress file in `docs/plans/` owns active implementation design and, in its
  `## Validation Log`, the validation record for its own implementation units.
- `docs/plans/TODO.md` owns current work, grouped completed outcomes, and the latest validation for
  work no plan owns.
- `docs/plans/BLOCKERS.md` owns unresolved manual actions required from the user.

Do not restate another document's content. Link to its canonical definition. Delete superseded
definitions and repair their references in the same change.

## Documentation workflow

- `CONTEXT.md` is a glossary only. Keep each project-specific term to one or two sentences; put
  behavior, data shape, implementation, and validation elsewhere.
- Keep an ADR only for a decision that is hard to reverse, surprising without its context, and the
  result of a real trade-off. Keep one decision per ADR, state current policy and rationale, and omit
  implementation walkthroughs, rollout history, validation transcripts, and exact interfaces or
  persisted shapes. Delete a fully superseded ADR and repair inbound links; never reuse its number.
- Accepted ADRs bind shipped behavior, and ADR numbers do not define precedence. An agent must not
  silently ignore a conflicting ADR: report the contradiction, run an authorized non-production
  experiment, or propose an amendment or replacement. A replacement states the changed invariant
  and repairs every affected reference in the same change. Reversible algorithms, limits, exact
  interfaces, and exact persisted shapes belong to source or an active plan unless they satisfy the
  ADR retention test above.
- A brainstorm may own accepted framing, requirements, and unresolved product decisions. Turn it
  into a plan only after those decisions are resolved enough to implement.
- Keep only ready or in-progress implementation plans. When a plan finishes, first move durable
  decisions to ADRs, terminology to `CONTEXT.md`, workflow to this file, operational mechanics to the
  owning README or skill, and current status to `TODO.md`; then delete the plan.
- A plan's Validation Log keeps one consolidated entry per closed implementation unit and one `Open
  findings` section. Record current evidence and invariants, not metric or suite-count trajectories.
  Keep a Validation Log under about 200 lines and a plan under about 600 lines.
- `TODO.md` has exactly `TODO`, `COMPLETED`, and `VALIDATION` sections. Keep at most seven current
  tasks, at most eight grouped completed outcomes, and exactly one latest plan-less validation; keep
  the whole file under about 150 lines. Conditional future ideas do not belong in `TODO.md`.
- Never link retained documentation to gitignored `tmp/`. Git history archives deleted detail, but
  any knowledge that must remain discoverable needs a live canonical owner before deletion. Preserve
  an uncommitted plan or validation record in history before deleting it, and commit consolidation
  separately from the detailed record it replaces.

## Validation authority

- Intercepted web, real-backend web, native emulator or simulator, deployed, and physical-device
  evidence each prove only the layer they actually exercise; none substitutes for another.
- A native scenario earns automatic authority for one regression class only after a behavior-only
  negative control fails at the intended assertion and a user-recorded physical pass correlates it.
  Current Android scenario claims and rig mechanics live in
  `apps/learner-app/e2e-native/README.md`.
- Agents may initiate emulator or simulator runs on a tooling-capable host. Physical-device runs
  remain user-initiated; record a concrete unresolved user action in `docs/plans/BLOCKERS.md`
  rather than claiming evidence that was not produced.
- Before running or qualifying lrnki evidence, apply
  `.agents/skills/validate-lrnki/SKILL.md`; it routes to the smallest relevant environment reference
  and owns execution, failure-triage, and claim-qualification workflow. Owning test READMEs and
  source retain current scenario claims and rig mechanics.

## Rules

1. This is greenfield development. Breaking changes are allowed; do not preserve compatibility
   unless explicitly requested.

2. Enforce [ADR-0001](docs/adr/0001-adopt-greenfield-deep-module-architecture.md).

3. Use the project language in [CONTEXT.md](CONTEXT.md) and enforce
   [ADR-0002](docs/adr/0002-define-learner-neutral-core-concept-graph.md).

4. Prioritize real curated source fixtures across mixed domains and formats.

5. Route LLM calls through LiteLLM aliases and the owning ports. Production extraction uses
   Xiaomi MiMo v2.5 with reasoning disabled unless an experiment states otherwise; the
   alias → deployment mapping in `litellm/config.yaml` (`router_settings.model_group_alias`)
   is the source of truth.

6. Enforce [ADR-0006](docs/adr/0006-use-forced-named-tool-schemas.md).

7. Enforce [ADR-0003](docs/adr/0003-use-postgres-json-table-artifact-store.md).

8. Enforce [ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).

9. Database resets and re-initialization are allowed without approval during development.

10. Stable curated sources belong in `fixtures/`; generated artifacts, reports, and scratch outputs
    belong in gitignored `tmp/`.

11. Enforce [ADR-0013](docs/adr/0013-verify-quality-by-real-source-inspection.md).

12. Enforce [ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md).

13. Prioritize real-use quality evaluation and run real extraction with production LLM calls.

14. After every important behavior-changing milestone, follow the
    [real-use quality route](.agents/skills/validate-lrnki/references/real-use-quality.md) in the
    validation skill. A green suite is not quality evidence.
    A model reassignment invalidates prior quality evidence for every affected consumer; re-run the
    relevant gates or record them as unqualified. A Provider Route change alone preserves that
    evidence only when every reachable route mechanically resolves to the same Model Assignment;
    qualify provider contract and reachability operationally. Undeclared or ambiguous quantization
    fails closed as route-sensitive Model Assignment identity. Every zero-row inspection assertion
    must carry a positive control over the same rows in the same query.
    `DATABASE_URL` lives in the repo-root `.env`; the shell and test runner do not auto-load it, so
    `process.env.DATABASE_URL` reads empty until you do. Load it before DB-touching commands
    (`node --env-file=.env …`, `tsx --env-file=.env …`, or `set -a; . ./.env; set +a`). Never defer
    a real-use gate by claiming `DATABASE_URL` is unavailable. DB-backed automated tests are the
    exception: run `pnpm test:db`, which resets and targets only `lrnki_test`; test files must opt
    in through `TEST_DATABASE_URL` and must never use the development `DATABASE_URL`.

15. Admin Lab web UI uses shadcn base-ui components; graph visualization uses Cytoscape. For the
    learner surface, enforce
    [ADR-0035](docs/adr/0035-separate-learner-app-static-spa-typed-api.md).

16. A deterministic gate over neural output may hard-veto only a provable guarantee. Heuristic
    lexical or surface-pattern gates require an explicit measured module and must be removed when
    they cause false negatives. Schema fail-closed behavior does not imply semantic rejection of
    well-formed output.

17. Extraction and judge prompts, including forced-tool `description` fields, remain domain-neutral.
    Never tune with fixture concepts or expected fixture outcomes.

18. Delete a superseded code path, schema, prompt, port, type, dependency, export, script, config
    field, or documentation definition in the same change that replaces it. Keep one source of truth
    per fact; any second representation must be mechanically generated.

19. Enforce
    [ADR-0028](docs/adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

20. Enforce [ADR-0012](docs/adr/0012-embeddings-permitted-except-prerequisite-derivation.md).

21. Before fixing a real-use defect, name its established problem class and research recognized best
    practices. Prefer a conventional root-cause solution. Record why a bespoke approach is necessary
    if established methods conflict with this architecture or the learner-neutral contract.

22. Prioritize the Learner App's game UX and enforce
    [ADR-0032](docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
    Before implementing a new mechanic, record its learner-visible goal, mastery relationship,
    challenge curve, likely distractions, and the focused real-use evidence that will judge it. If
    the mechanic proposes graded evidence as acquisition-mastery evidence, stop for the review that
    ADR-0032 requires; the planning checklist does not authorize that change.

23. Run `docker compose` for the shared environment only from the deploy checkout on its host, and
    always detached (`-d`). Never from inside an agent container that binds the workspace at a
    different path than the host does — compose sends the daemon *its* paths, so every relative bind
    source resolves somewhere the daemon cannot see
    ([ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md)). The file binds
    fail closed on that; `watch` and `down` are not protected, and an attached `up` takes the whole
    stack down with its terminal.
