## Documentation authority

Keep one canonical definition for every fact:

- `AGENTS.md` owns engineering workflow and enforcement rules.
- `CONTEXT.md` owns project language and ambiguity resolution.
- `docs/adr/` owns current durable architectural decisions and rationale.
- Source types and `packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`
  own implemented interfaces and persisted data shapes.
- A linked ready/in-progress file in `docs/plans/` owns active implementation design.
- `docs/plans/TODO.md` owns current work, grouped completed outcomes, and latest validation.
- `docs/plans/BLOCKERS.md` owns unresolved manual actions required from the user.

Do not restate another document's content. Link to its canonical definition. Delete superseded
definitions and repair their references in the same change.

## Rules

1. This is greenfield development. Breaking changes are allowed; do not preserve compatibility
   unless explicitly requested.

2. Preserve deep-module architecture: domain logic stays isolated from infrastructure, UI, and
   orchestration; dependencies point inward through explicit ports
   ([ADR-0001](docs/adr/0001-adopt-greenfield-deep-module-architecture.md)).

3. Keep the Learner-Neutral Core Concept Graph intentionally small, learner-neutral, and
   domain-general; use the terms defined in [CONTEXT.md](CONTEXT.md).

4. Prioritize real curated source fixtures across mixed domains and formats.

5. Route LLM calls through LiteLLM aliases and the owning ports. Production extraction uses
   DeepSeek V4 Flash with thinking disabled unless an experiment states otherwise.

6. Structured LLM output uses forced named tool schemas. Validate tool arguments at the application
   boundary and fail closed ([ADR-0006](docs/adr/0006-use-forced-named-tool-schemas.md)).

7. PostgreSQL 18 is the required database. Authoritative state is relational; immutable artifacts
   use JSONB envelopes and JSON_TABLE query surfaces
   ([ADR-0003](docs/adr/0003-use-postgres-json-table-artifact-store.md)).

8. Keep only the single initial migration; compatibility migrations are not required.

9. Database resets and re-initialization are allowed without approval during development.

10. Stable curated sources belong in `fixtures/`; generated artifacts, reports, and scratch outputs
    belong in gitignored `tmp/`.

11. Automated tests validate only deterministic behavior and never stand in for neural-output
    quality. Canned model output may exercise a deterministic transform but must not be asserted as a
    correct model judgment. Measurement harnesses and model-authored oracles are disposable unless
    they continue to change a live decision
    ([ADR-0013](docs/adr/0013-verify-quality-by-real-source-inspection.md)).

12. Keep Admin Lab minimal. It may inspect state and trigger explicit versioned operations, but it
    must never silently mutate a published graph
    ([ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md)).

13. Prioritize real-use quality evaluation and run real extraction with production LLM calls.

14. After every important behavior-changing milestone, apply
    `.agents/skills/real-use-quality-evaluation/SKILL.md`. A green suite is not quality evidence.

15. Web UI uses shadcn base-ui components and `.agents/skills/shadcn/SKILL.md`; graph visualization
    uses Cytoscape.

16. A deterministic gate over neural output may hard-veto only a provable guarantee. Heuristic
    lexical or surface-pattern gates require an explicit measured module and must be removed when
    they cause false negatives. Schema fail-closed behavior does not imply semantic rejection of
    well-formed output.

17. Extraction and judge prompts, including forced-tool `description` fields, remain domain-neutral.
    Never tune with fixture concepts or expected fixture outcomes.

18. Delete a superseded code path, schema, prompt, port, type, dependency, export, script, config
    field, or documentation definition in the same change that replaces it. Keep one source of truth
    per fact; any second representation must be mechanically generated.

19. Measure judgment-based quality with non-deterministic methods. Do not use a deterministic proxy
    or chase model-output determinism. Deterministic checks remain for the deterministic envelope:
    schemas, verbatim evidence, graph algorithms, and policy transforms. Reproducibility comes from
    immutable persisted artifacts with provenance
    ([ADR-0028](docs/adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)).

20. Embeddings may propose candidates for identity/deduplication, similarity, or retrieval. A
    separate adjudicator decides identity; raw cosine never merges. Embeddings never derive, gate, or
    order prerequisites
    ([ADR-0012](docs/adr/0012-embeddings-permitted-except-prerequisite-derivation.md)).

21. Before fixing a real-use defect, name its established problem class and research recognized best
    practices. Prefer a conventional root-cause solution. Record why a bespoke approach is necessary
    if established methods conflict with this architecture or the learner-neutral contract.
