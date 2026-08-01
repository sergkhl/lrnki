## Documentation authority

Keep one canonical definition for every fact:

- `AGENTS.md` owns engineering workflow and enforcement rules.
- `CONTEXT.md` owns project language and ambiguity resolution.
- `docs/adr/` owns current durable architectural decisions and rationale.
- Source types and `packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`
  own implemented interfaces and persisted data shapes.
- A linked file in `docs/brainstorms/` owns accepted problem framing, requirements, and scope until
  that work is completed or abandoned.
- A linked ready/in-progress file in `docs/plans/` owns active implementation design.
- `docs/plans/TODO.md` owns current work, grouped completed outcomes, and latest validation, under
  the retention limits in [docs/plans/README.md](docs/plans/README.md).
- `docs/plans/BLOCKERS.md` owns unresolved manual actions required from the user.

Do not restate another document's content. Link to its canonical definition. Delete superseded
definitions and repair their references in the same change.

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

8. Keep only the single initial migration; compatibility migrations are not required.

9. Database resets and re-initialization are allowed without approval during development.

10. Stable curated sources belong in `fixtures/`; generated artifacts, reports, and scratch outputs
    belong in gitignored `tmp/`.

11. Enforce [ADR-0013](docs/adr/0013-verify-quality-by-real-source-inspection.md).

12. Enforce [ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md).

13. Prioritize real-use quality evaluation and run real extraction with production LLM calls.

14. After every important behavior-changing milestone, apply
    `.agents/skills/real-use-quality-evaluation/SKILL.md`. A green suite is not quality evidence.
    `DATABASE_URL` lives in the repo-root `.env`; the shell and test runner do not auto-load it, so
    `process.env.DATABASE_URL` reads empty until you do. Load it before DB-touching commands
    (`node --env-file=.env …`, `tsx --env-file=.env …`, or `set -a; . ./.env; set +a`). Never defer
    a real-use gate by claiming `DATABASE_URL` is unavailable. DB-backed automated tests are the
    exception: run `pnpm test:db`, which resets and targets only `lrnki_test`; test files must opt
    in through `TEST_DATABASE_URL` and must never use the development `DATABASE_URL`.

15. Admin Lab web UI uses shadcn base-ui components and `.agents/skills/shadcn/SKILL.md`; graph
    visualization uses Cytoscape. For the learner surface, enforce
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
