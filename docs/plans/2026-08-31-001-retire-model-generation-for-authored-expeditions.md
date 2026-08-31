---
title: Simplify the Learner Runtime Around Directly Authored Expeditions - Plan
type: implementation
date: 2026-08-31
execution: code
---

# Simplify the Learner Runtime Around Directly Authored Expeditions

**Status:** Complete — U0–U5 and the exit test passed on 2026-08-31. The abandoned U6 generation
work remains recoverable in `4ae809e`; the atomic authored-runtime cutover, guarded local reset,
legacy deletion, five-Expedition qualification, real-backend journey, and native evidence are
consolidated below. This record is ready for its standalone lifecycle closure commit.

**NEXT:** Commit this consolidated evidence, then delete this completed plan in a separate closure
commit while repairing the plan index and TODO at their own altitudes.

**Decision state:** Accepted by the owner on 2026-08-31. This plan replaces the earlier retirement
design rather than amending it. The earlier direction was correct about deleting model-generated
learner knowledge, but it preserved generation-era architecture: a compiler and package format,
installation and requalification, content tables, graph-derived routes, and pipeline-shaped learner
projections. None survives this plan.

## Goal capsule

- **Objective:** Make directly authored Expedition documents the only learner-content authority and
  replace the learner application internals with one deep runtime module over one versioned learner
  aggregate.
- **Offline author:** Codex CLI reads a tracked primer and writes the exact declarative structure the
  server consumes. The repository contains no Codex client or model port, and neither build nor
  runtime invokes Codex or another model.
- **Selected product:** Preserve Better Auth, private server grading, cross-device progress,
  calibration, exact-reference Support Paths, Leg and Expedition Guardians, rewards, weekly
  leaderboard, profile flow, Expo web/native presentation, accessibility, haptics, and reduced
  motion.
- **Deleted system:** Delete graph, extraction, enrichment, generation, Admin Lab, accepted-package
  installation, content-database, inspection, worker, LiteLLM, and Docling code and operations.
- **Topology:** Keep the repository and current Expo/Hono/Postgres deployment identity. Do not create
  a separate project.
- **Cutover:** Build content and runtime privately first. Make them canonical and delete the legacy
  path in the same cutover implementation unit.
- **Authority boundary:** Project-owned primers are accepted local playtest sources. This plan makes
  no external factual-verification or arbitrary-source-support claim.
- **Execution boundary:** Local development/test resets are authorized. Deployment, shared-host
  resets, production writes, distributable builds, and physical-device runs are not.
- **Workflow override:** lrnki does not adopt or create `docs/plans/RELEASE.md`.

## Structural resolution of earlier findings

- Support targets are explicit authored references handled by the command interface, so there is no
  missing Support creation route, exact-label search, fallback, retry, polling, or generated state.
- A canonical digest of the complete semantic Expedition document plus its source bytes owns content
  revision; no author-maintained asset config identity remains.
- Source disclosures live in the Expedition document; they do not depend on Postgres joins.
- Authored content is never installed in Postgres, so installation transactions, runtime
  requalification, package sealing, and content-schema trimming disappear.
- Replacement-before-deletion, atomic durable-decision timing, the populated local database,
  semantic inspection, native sensitivity, and plan-lifecycle evidence remain critical.

## Current repository facts

Re-resolved during U0 on 2026-08-31. Time-sensitive facts must be refreshed immediately before use.

- The branch started U0 at `main...origin/main [ahead 12]` with 30 modified non-document paths,
  three modified tracked plan documents, and this untracked replacement plan.
- The exact 30-path abandoned U6 snapshot passed the full baseline and is retained in `4ae809e`
  (`663` insertions, `211` deletions). No documentation path entered that commit.
- `pnpm check` passed schema parity, typechecking, package and app tests, lint with the existing
  warning set, both production-format web builds, and 70/70 intercepted-web scenarios.
- The first `pnpm test:db` run passed the migration matrix but had one failure among 124 Postgres
  tests. Two unchanged full reruns passed. This is qualified as a transient baseline failure, not a
  permanently green first run; no development-database state was changed.
- The current baseline has 59 public tables plus generated inspection views. The target has exactly
  five public relations.
- The planning snapshot of local `lrnki` found one user, one session, five catalog rows, two learner
  Expeditions, one lesson read, and one response. U3 must re-resolve endpoint, database name, and
  positive-control counts immediately before the authorized destructive local reset.
- The five source primers currently live under `fixtures/accepted-paths/sources/` in accepted order:
  Critical Thinking; Probability and Statistics; Personal Finance; Machine Learning; Neuroscience
  of Memory and Attention.
- Two brainstorms remain live during U0. Their surviving requirements are re-homed before either is
  deleted.

## Direct authored-content authority

### Tracked authorities

Only these tracked content forms survive:

```text
content/catalog.json
content/expeditions/<expeditionKey>/expedition.json
content/expeditions/<expeditionKey>/source.md
content/AUTHORING.md
```

- `catalog.json` owns exact membership and display order only.
- Each `expedition.json` owns presentation metadata, source disclosures, ordered Legs and Stops,
  prerequisite references, difficulty bands, lessons, activities, Support Paths, and Guardian
  pools.
- Each `source.md` is the project-owned authoring and semantic-inspection basis. The existing five
  primers move here without a database representation.
- `content/AUTHORING.md` instructs Codex CLI to inspect the source, author the complete runtime
  structure, run `pnpm content:check`, inspect structured diagnostics, and repair the document.

No second content representation is generated or checked in.

### Source contract

```ts
type AuthoredExpedition = {
  schemaVersion: 1;
  key: string;
  title: string;
  teaser: string;
  declaredDomain: string;
  audience: string;
  sourceCredits: SourceCredit[];
  legs: AuthoredLeg[];
  expeditionGuardianActivityKeys: string[];
};

type AuthoredLeg = {
  key: string;
  title: string;
  stops: AuthoredStop[];
  guardianActivityKeys: string[];
};

type AuthoredStop = {
  key: string;
  label: string;
  requires: string[];
  difficultyBand: 1 | 2 | 3 | 4 | 5;
  lesson: { sections: LessonSection[] };
  activities: AuthoredActivity[];
  supportPaths: AuthoredSupportPath[];
};

type AuthoredSupportPath = {
  key: string;
  term: string;
  sectionKey: string;
  steps: Array<{ stopKey: string; activityKey: string }>;
};

type AuthoredActivity =
  | AuthoredOptionSelect
  | AuthoredMatching
  | AuthoredImpostor;
```

The concrete Zod source schema owns the complete lesson-section, source-anchor, disclosure, option,
matching, impostor, and explanation shapes. Type aliases are derived from that schema rather than
maintained as a second definition.

### Authoring invariants

- Human-readable keys are the only content identifiers. Authors never write UUIDs, digests, asset
  identities, config hashes, route indexes, anchors, or database keys.
- Array order is instructional order. The author owns Leg boundaries, Stop order, prerequisites,
  difficulty, Support references, and Guardian pools. Runtime code derives no competing route.
- `requires` resolves within one Expedition, is acyclic, and references only Stops that can precede
  the dependent Stop in authored order.
- Every Leg contains three to five Stops. Every Stop has one lesson and at least one option-select
  activity. Matching and impostor are optional per Stop; every Expedition exercises all three
  families and each Leg offers a non-option family for Guardian play.
- Answer keys remain server-private and are absent from pre-answer learner projections.
- Every lesson section and answer-bearing explanation carries an exact source anchor into its local
  primer. Structural qualification proves source, heading, and quote existence; direct inspection
  decides semantic support.
- Every Explorable Term is an exact rendered substring and names an explicit non-parent Support
  destination containing a lesson and option-select activity.
- Guardian pools explicitly reference existing activities. Runtime selection, exposure balancing,
  shield/recovery, rematch, and first-win rules remain server-owned.

### Qualification seam

```ts
function qualifyCatalog(input: {
  catalog: unknown;
  expeditions: ReadonlyMap<string, unknown>;
  sources: ReadonlyMap<string, string>;
}): QualifiedCatalog;
```

`qualifyCatalog` is pure and either returns one opaque completely qualified catalog or structured
diagnostics for the whole catalog. It validates:

- schema versions and exact catalog membership;
- unique and resolvable keys and references;
- prerequisite closure, acyclicity, and authored-order legality;
- Leg size and activity-family requirements;
- option-select keys, non-unique answer keys, matching bijections, and impostor truth/lie/reveal;
- exact source anchors and disclosures;
- Explorable Terms, Support destinations, and Guardian pools.

It derives only in-memory lookup maps, learner-safe projections, and canonical revisions. A revision
covers canonical parsed learning content, ordering, keys, disclosures, and referenced source bytes.
JSON whitespace and property ordering are identity-neutral; semantic text, answer, ordering, key,
prerequisite, Support, Guardian, disclosure, or source-byte changes alter identity.

The same seam runs in `pnpm content:check` as part of `pnpm check` and at learner-api startup. The
API fails before listening when any Expedition is invalid. There is no compiler, sealed package,
installer, publication transaction, database seed, or runtime requalification.

## Deep learner-runtime module

Create `@lrnki/learner-runtime` with no import from the legacy application, domain, ports, graph,
generation, inspection, or content-store modules.

```ts
interface LearnerRuntime {
  read(
    learnerRef: string,
    query: LearnerQuery,
  ): Promise<LearnerReadResult>;

  dispatch(
    learnerRef: string,
    envelope: {
      requestId: string;
      expectedStateVersion: bigint;
      command: LearnerCommand;
    },
  ): Promise<LearnerTransitionResult>;
}
```

`LearnerQuery` is a closed union for Journal, ordered catalog and disclosures, one Expedition
trail/session, one Guardian challenge, and weekly leaderboard.

`LearnerCommand` is a closed union for:

- adopt and activate an Expedition;
- record lesson reading;
- set or clear `known` calibration for a Stop;
- answer option-select, matching, or impostor activities;
- open, restore, or hide an authored Support Path;
- create a Leg or Expedition Guardian challenge;
- answer a Guardian selection or matching pair;
- retreat, resume, or abandon a Guardian.

### Runtime invariants

- `learnerRef` comes only from the authenticated Better Auth session, never request JSON.
- Expo imports only typed learner-api DTOs, never runtime, persistence, graph, or content types.
- Pre-answer views contain no answer key or keyed correctness flag.
- Duplicate `requestId` values replay the committed result with no additional progress, points,
  Guardian event, or award.
- Stale `expectedStateVersion` changes nothing and returns the fresh view and version.
- Grading, progress, first-completion score, Support evidence, Guardian victory, and award effects
  commit atomically.
- Acquisition mastery is lesson read plus all current required activities correct, or an explicit
  `known` calibration.
- `known` satisfies authored prerequisite closure but creates no graded response, crystal, or weekly
  points. Clearing it restores evidence-derived state.
- A later wrong acquisition answer can expose restoration for a prerequisite skipped by calibration.
- Support answers reuse the referenced activity's ordinary acquisition identity. The Support branch
  cannot award parent progress, and replay cannot double-score.
- Guardian answers never change acquisition mastery or weekly acquisition points.
- A completed Leg may enable its Guardian without blocking the next prerequisite-valid Stop. The
  Expedition Guardian stays locked until each winnable Leg Guardian has a first win.
- Existing Guardian shield, recovery, lineup rotation, exposure, retreat/resume/abandon, first-win,
  rematch, formation, and reward semantics remain.
- Existing leaderboard week/rank, deterministic rivals, chase, division, lifetime crystal, podium,
  and award-deduplication semantics remain.
- Persisted content-revision mismatch returns `content_changed` and mutates nothing. Greenfield
  content changes use the guarded reset; no compatibility reader or migration is added.

### Hono and Expo seam

Hono remains a thin authenticated adapter:

- retain typed `GET` reads for Journal, catalog, Expedition, Guardian, and leaderboard;
- replace state-changing learner routes with one typed `POST /game/commands` command union;
- remove topic creation/retry, generated Support, generation progress, operation timeline,
  inspection, accepted-package, and publication routes;
- expose only `expeditionKey`, `legKey`, `stopKey`, `activityKey`, and `supportPathKey` content IDs.

Retarget the existing Expo/native configuration, session handling, UI foundation, trail/crystal
presentation, activity renderers, Guardian presentation, Support dialog, leaderboard, profile flow,
accessibility, haptics, and reduced-motion behavior. Port reusable pure Guardian, ranking,
calibration-closure, formation, and navigation-memory algorithms behind the new interface. Replace
`StudySession`, graph detail, enrichment identifiers, classifications, source-cue reads, generation
states, and projection maps with small authored-key DTOs. Delete legacy tests only after equivalent
behavior is covered through the new public seam.

## Minimal persisted state

Retain Better Auth's `user`, `session`, `account`, and `verification` tables. Replace every other
table with:

```text
learner_journey_state
  learner_ref    text primary key references "user"(id) on delete cascade
  state          jsonb not null
  state_version  bigint not null default 0
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()
```

The versioned state document owns active Expedition; adopted content revisions and timestamps;
lesson reads; idempotent acquisition attempts and outcomes; immutable first graded Stop completion;
calibration; Support visibility; Guardian identities, lineups, events, status, exposure and first
wins; and typed awards with dedupe keys.

The Zod schema in `@lrnki/learner-runtime` owns the JSON payload. Drizzle owns table, column,
constraint, and relation shape. Drizzle `$type<T>()` is not runtime validation; every loaded and
proposed next state is parsed fail-closed.

```ts
interface LearnerStateStore {
  read(learnerRef: string): Promise<StateRead>;

  transact<Result>(
    learnerRef: string,
    transition: (
      current: Readonly<LearnerStateV1>,
    ) => { next: LearnerStateV1; result: Result },
  ): Promise<StateCommit<Result>>;

  listBoardCohort(): Promise<BoardLearnerState[]>;
}
```

Provide in-memory and Postgres adapters. The Postgres adapter:

- lazily creates empty state only for an existing Better Auth user;
- locks the learner row with `SELECT ... FOR UPDATE`;
- invokes one synchronous side-effect-free transition;
- validates loaded and proposed state;
- increments `state_version` atomically;
- rolls back on transition, validation, or infrastructure failure;
- cascades state on Better Auth user deletion;
- includes authenticated users without state rows in the leaderboard cohort.

Normalization is deferred until measured aggregate size, Guardian write latency, or leaderboard
scan cost justifies it. The implementation must not preserve normalized legacy tables speculatively.

The final valid public relation manifest is exactly:

```text
user
session
account
verification
learner_journey_state
```

The migration classifier is rewritten without `source_resources` or `operation_runs` sentinels.

## Documentation and durable decisions

Create the direct-authored-content ADR only in U3's atomic cutover after the invariant is true. It is
ADR-0042 unless another ADR lands first.

### ADR disposition at cutover

- **Delete:** 0002, 0004, 0005, 0006, 0007, 0009, 0010, 0011, 0012, 0015, 0016, 0017, 0019,
  0023, 0029, 0030, and 0034.
- **Amend:** 0003 for minimal Postgres; 0013 for authored-source inspection; 0024 for authored
  difficulty; 0026 for authored Stop activities and response identity; 0027 for runtime projections
  without Admin Lab inspection; 0028 for judgment-based authored-content quality; 0031 for authored
  lessons teaching before activities; 0032 for authored prerequisites and the retained game; 0033
  for authored-key identifiers; 0035 for Expo/Hono/Postgres without Admin Lab or LiteLLM; 0037 for
  authored Support references and minimal learner visibility; 0039 for the final code-first schema
  and reset policy.
- **Keep unchanged:** 0001, 0040, and 0041.
- **Add:** direct authored content with no build/runtime model or second representation.

Rewrite `CONTEXT.md` as a glossary for Authored Expedition, Leg, Stop, Lesson, Activity, Support
Path, Guardian, and Learner State. Remove graph, extraction, model-operation, generation, enrichment,
Concept, and inspection terms after their code disappears.

Brainstorm disposition:

- U1 re-homed lesson-depth and teaching-quality requirements into `content/AUTHORING.md` and this
  plan's real-use rubric, then deleted the superseded lesson-depth brainstorm;
- retain `2026-08-19-001-architecture-deepening-review.md` until navigation, Support interaction,
  persisted loading, and reader-seam findings are implemented or explicitly re-homed.

Historical `COMPLETED` entries are outcomes, not current policy. Do not rewrite their meaning. When
deleted source paths break links, prune entries through the rolling window or replace live-source
links with the owning commit/history reference.

## Implementation units

Units execute sequentially. No two units may be in progress at once.

### U0 — Preserve history and repair coordination

**Status:** Complete on 2026-08-31.

- [x] Re-resolve dirty-tree ownership: 30 non-document U6 paths, three tracked planning documents,
  and one untracked replacement plan.
- [x] Run `pnpm check` and `pnpm test:db`; record the transient first DB-suite failure and two clean
  reruns.
- [x] Commit only the 30 abandoned non-document paths in `4ae809e`; never use `git add -A`.
- [x] Replace the target plan, retain the old plan's Abandoned state, and align index/TODO altitude.
- [x] Commit this plan/coordination batch, then delete the old plan in a later standalone commit with
  index and reference repairs.
- [x] Do not create ADR-0042 and do not delete either brainstorm.

Acceptance: code and planning history are recoverable; index, TODO, and plan agree; `BLOCKERS.md`
remains `_None._` unless an owner-only action appears.

### U1 — Establish direct authored content

**Status:** Complete on 2026-08-31.

- Add the source schema, loader, qualifier, canonical revision, `content/AUTHORING.md`, and
  `pnpm content:check` wired into `pnpm check`.
- Move/copy the Critical Thinking primer into its future canonical content location while the legacy
  path remains live, and have Codex CLI author the complete runtime Expedition document.
- Cover all qualifier refusals, catalog atomicity, property-order-neutral identity, semantic/source
  invalidation, learner-safe projection, and startup refusal.
- Keep the new path private and noncanonical; the legacy runtime remains the sole live authority.
- Re-home lesson-depth requirements before deleting that brainstorm.

Acceptance: Critical Thinking qualifies without model/build/database access; unchanged semantic
input produces the same revision; no server-private key appears in a learner projection.

### U2 — Build learner runtime and adapters privately

**Status:** Complete on 2026-08-31.

- Implement `read` and `dispatch` against an in-memory adapter.
- Port prerequisite/calibration closure, grading, mastery, restoration, Support reuse, Guardian
  combat/selection, formations, rewards, leaderboard, and navigation memory to authored keys.
- Add the aggregate Postgres adapter and `learner_journey_state` beside the legacy schema for
  test-only integration. Regenerate the intermediate baseline and reset only `lrnki_test`.
- Exercise a complete Critical Thinking slice through test-only API composition and intercepted
  fixtures. Do not expose a second live content path.

Acceptance: selected full-game behavior works through the two-method interface; concurrent
same-learner commands cannot lose state; legacy remains the only live authority.

### U3 — Cut over atomically and delete the legacy system

- Immediately before reset, re-resolve endpoint/database and positive-control counts. State that the
  guarded local reset destroys accounts, sessions, catalog rows, adoptions, progress, responses,
  challenges, awards, and all application state. Shared-host/production reset stays out of scope.
- Switch learner-api and Expo to direct content/runtime DTOs and remove generation, polling, and
  planning states.
- Regenerate final code-first baseline, rewrite migration classification/reset tests, reset local
  `lrnki`, and verify the exact five-relation manifest with positive controls.
- In the same cutover unit, delete legacy graph/extraction/enrichment/generation/application/ports/
  content-store code and tests; Admin Lab; kg-worker; LiteLLM; Docling; ingestion/storage packages;
  prompts/config/supervisors/CLIs/installers/requalification/inspection; content and operation
  relational tables/adapters; generated Support/topic routes/UI; accepted packages; obsolete
  fixtures; and superseded documentation definitions.
- Keep Compose only for Postgres, migration, learner-api, and optional Caddy. Include tracked
  `content/` in the API image and development watch inputs.
- Create/accept the new ADR and repair ADRs, AGENTS, CONTEXT, README, validation skill, rig owners,
  index, TODO, and stale references only after the invariant is live.

Acceptance: `pnpm check`, `pnpm test:db`, schema parity, Compose config, stale-reference searches with
positive controls, and a complete test-only Critical Thinking journey pass with legacy absent.

### U4 — Qualify Critical Thinking end to end

- Inspect every lesson section, answer, explanation, matching pair, impostor statement/reveal,
  Explorable Term, Support target, Guardian pool, and source anchor. Record `PASS` or `FIX_FIRST`;
  repair every `FIX_FIRST` before continuing.
- Exercise real auth/API/Postgres: profile, catalog, adoption/activation/resume, all lessons and
  activities, wrong-to-correct for all families, calibration/clear/restoration, Support lifecycle,
  every Guardian, shield/recovery/retreat/resume/win/rematch, formations/rewards, leaderboard,
  sign-out/in persistence, and second-learner isolation.
- Inspect HTTP/Expo payloads to prove no pre-answer key or private content object crosses the seam.

Acceptance: complete real-use `PASS`, not a sample of one lesson or early Guardian.

### U5 — Author remaining catalog and close

- Have Codex CLI author Probability and Statistics, Personal Finance, Machine Learning, and
  Neuroscience of Memory and Attention in accepted order.
- Run structural qualification and complete direct semantic/source inspection for every asset.
- For each additional Expedition, play one complete Leg through its Guardian, every activity family
  it uses, a Support Path, and representative calibration/reward behavior; inspect unreached content.
- Run the final evidence matrix; consolidate the Validation Log; resolve/re-home findings; repair
  stale definitions; verify blockers.
- After the exit test passes, commit evidence, then delete this plan in a standalone closure commit
  with plan-index/TODO cleanup.

## Test and evidence plan

### Local automated

- Catalog order/membership; malformed documents; duplicate/dangling keys; prerequisite cycles and
  order; Leg sizes; lesson/option requirements; activity shapes; matching bijection; impostor
  truth/lie/reveal; source anchors; Support targets; Guardian pools; catalog atomicity.
- Revision stability for formatting/property order and invalidation for every semantic/source class.
- Learner-safe projection and pre-answer answer-key stripping.
- Adoption, activation, lesson reads, three graders, unlocking, known/clear/restoration, Support,
  Guardian combat/idempotency/rematch/rewards, weekly board/rivals/podium, content mismatch, stale
  versions, duplicate requests, learner isolation, and corrupt-state refusal.
- Postgres missing/existing user, concurrent first writes, row lock, rollback, cascade, invalid JSON,
  version increments, and zero-state cohort inclusion.
- `pnpm content:check`, `pnpm db:check`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, app/API builds,
  `pnpm check`, `pnpm test:db`, `docker compose config`, `git diff --check`, and positive-controlled
  stale-name/import/script/config searches.

### Database

- Before reset, positive-control database identity and row counts.
- After reset, exact relation manifest, one migration-history row, removed-relation searches with
  positive controls, migration-classifier matrix, and reset refusal outside `lrnki`/`lrnki_test`.
- Fresh signup and stale-cookie recovery after the account-destroying reset.
- Exact cleanup of disposable learners. No content installation or catalog DB counts remain.

### Intercepted web

- Production-format Expo export at owned phone and desktop viewports.
- Journal/catalog, adoption, trail, activities, calibration, Support, Guardian, formation/reward,
  leaderboard, and error/loading states.
- Explicit absence of topic planning, generation progress, retries, polling, and deleted requests.
- No unmatched request may escape interception.

### Real-backend web and real-use quality

- Real Better Auth, Hono, Postgres, private grading, refresh/resume, idempotency, and isolation.
- Complete Critical Thinking journey through every required asset and Guardian.
- Per-Expedition `PASS`/`FIX_FIRST` semantic inspection against project-owned primers.
- No external factual-verification or arbitrary-source-support claim.

### Native

- Rebuild a fresh disposable Android e2e APK after app changes.
- Run the Support flow at 320 dp and re-run its body/footer-sensitive isolated dialog-collapse
  negative control; only intended failure plus current positive pass preserves automatic authority.
- Inspect Guardian, formation, activity, leaderboard, and full-path rendering separately. Guardian
  remains only the evidence class its rig grants.
- Run iOS as a separately named Debug simulator smoke unless a canonical automated rig is created.
- Emulator/simulator evidence does not imply distributable or physical-device evidence.

## Assumptions

- Same-repository clean-room replacement; no separate project and no in-place legacy refactor.
- Full server-backed services and selected learner game systems remain.
- Codex CLI authors the exact runtime structure offline; no build/runtime model integration.
- One versioned learner aggregate first; normalization requires measured evidence.
- Project primers are accepted local playtest sources; external verification is out of scope.
- Content revision changes require a guarded greenfield reset during this plan.
- Local development/test resets are authorized; external-state changes listed in the goal capsule are
  not.

## Exit test

This plan closes only when all are true:

1. No model client, prompt, model port, graph/extraction/enrichment/generation path, Admin Lab,
   worker, LiteLLM/Docling service, content installer/table, or runtime requalification remains.
2. The ordered direct documents are the only content authority and one qualifier accepts them
   all-or-nothing in CI and API startup.
3. Expo preserves the selected full game while importing only typed client DTOs and no legacy
   graph/application/persistence types.
4. Postgres contains only Better Auth's four tables and `learner_journey_state`, with schema parity,
   migration/reset/concurrency tests, and positive-controlled absence proof.
5. All five Expeditions qualify in accepted order and have explicit semantic/source inspection.
6. Critical Thinking passes the complete real-backend journey, retained Android Support authority
   check, and evidence-class-separated validation.
7. ADRs, glossary, rules, README, validation references, rig owners, index, TODO, and blockers
   describe only the implemented system.
8. The Validation Log is consolidated, `Open findings` is `_None._`, and every durable fact has a
   surviving tracked owner.

## Validation Log

### U0 — baseline and abandoned-work preservation (2026-08-31)

- **Scope:** Current dirty-tree ownership, legacy automated baseline, exact abandoned U6 archive,
  and plan coordination only. No learner behavior or database content was changed.
- **Commands:** `git status --short --branch`; `git diff --name-only`; `pnpm check`;
  `pnpm test:db` (three runs total); `git diff --cached --check`.
- **Result:** `pnpm check` passed, including 70/70 intercepted-web scenarios. The first DB run passed
  migration tests but failed one of 124 Postgres tests; two unchanged complete reruns passed. The
  30-path non-document snapshot was committed as `4ae809e` with clean cached whitespace. The
  replacement coordination state was committed in `212cf90`; the abandoned plan was then removed
  standalone after its brainstorm and index references were repaired.
- **Qualification:** Local automated, test-Postgres, local build, and intercepted-web baseline only.
  No real-backend, native, deployed, distributable, physical-device, production, or content-quality
  claim. The initial DB failure remains part of the record even though it did not reproduce.

### U1 — private direct-content authority and Critical Thinking (2026-08-31)

- **Scope:** Added the legacy-independent `@lrnki/learner-runtime` content seam, direct tracked
  catalog/Expedition/source authorities, authoring rubric, canonical revisions, structured refusal,
  startup loader, and Critical Thinking. The legacy API/app remains the sole live learner path.
- **Structural result:** `pnpm content:check` accepted one Expedition all-or-nothing at catalog
  revision `142f9ab13d0e0cb3c6dc57886df43d3ff8c3720d1cc33b3ee699c035443ecd0a` and content revision
  `e90178e53bfa7b55032e25827663acd9c8a13d21066c845b95ac00596d25f2f6`. The source copy is
  byte-identical to the retained legacy fixture. The focused suite passed 14/14 refusal, identity,
  projection, and startup tests; no legacy/model/database package is imported.
- **Semantic inspection:** `PASS` for six lesson sections, four option-select activities, one
  matching activity, one impostor activity, two Support Paths, and the Leg/Expedition Guardian
  pools against the local primer. One initial `FIX_FIRST`—`confounder` pointed to an unrelated
  sampling repair—was replaced with an earlier common-cause activity before PASS.
- **Repository gate:** `pnpm check` passed with content qualification first, schema parity, all
  typechecks/tests, the existing 10 lint warnings and no errors, both builds, and 70/70 intercepted
  scenarios.
- **Qualification:** Structural/direct-inspection and legacy intercepted-web evidence only. The
  browser run exercises the still-canonical legacy client, not the private new content path. No
  database content, real-backend, native, deployed, distributable, physical-device, production,
  external-fact, or arbitrary-source claim.

### U2 — private learner runtime and aggregate adapters (2026-08-31)

- **Scope:** Added the legacy-independent state schema, in-memory and Postgres stores, two-method
  runtime, authored-key projections, acquisition/calibration/Support/Guardian/reward/leaderboard
  transitions, and a test-only Hono composition. No production learner route was changed.
- **Runtime result:** The focused package suite passed 28/28 tests: 14 direct-content tests and 14
  runtime tests covering all three graders, mastery and restoration, Support evidence, Guardian
  lifecycle, rewards, leaderboard, content mismatch, stale versions, duplicate request replay,
  concurrency, isolation, and corrupt-state refusal. Pre-answer projections expose no answer key.
- **Persistence result:** The intermediate code-first baseline contains the legacy 59 relations plus
  private `learner_journey_state`. Six focused live-test-Postgres tests passed for user existence,
  lazy zero state, versions, concurrent first writes, cross-runtime optimistic concurrency,
  rollback, corrupt JSON, cascade, and zero-state leaderboard inclusion. The complete `pnpm
  test:db` gate passed after resetting only `lrnki_test`; local `lrnki` was not reset.
- **Vertical result:** One test-only authenticated Hono slice completed Critical Thinking lessons,
  all activity families, Support open/hide/restore/reuse, a Leg Guardian, the Expedition Guardian,
  leaderboard reads, hostile-body identity rejection, and second-learner isolation. It is not a
  second live route.
- **Repository gate:** `pnpm check` passed: content/schema checks, typechecks, all unit tests, the
  existing 10 lint warnings and no errors, Admin Lab and Expo builds, and 70/70 legacy
  intercepted-web scenarios.
- **Qualification:** Local automated, test-Postgres, test-only API-composition, build, and legacy
  intercepted-web evidence only. The 70 browser scenarios still exercise the legacy live contract;
  they do not prove cutover. No local-development reset, real-backend, native, deployed,
  distributable, physical-device, production, or new external-quality claim.

### U3 — atomic cutover, guarded reset, and legacy deletion (2026-08-31)

- **Cutover:** Learner API now loads the tracked catalog all-or-nothing before listening and exposes
  authenticated authored-key reads plus one command endpoint. Expo imports transport DTOs only and
  retains auth, trail, activity, Support, Guardian, reward/formation, leaderboard, accessibility,
  haptics, and reduced-motion presentation. ADR-0042 became true in the same unit.
- **Deletion:** Removed Admin Lab, the knowledge-graph worker, graph/extraction/enrichment/generation
  modules, model ports and prompts, LiteLLM, Docling, ingestion/local-storage packages, content
  packages/installers/requalification, generation routes/states, and every superseded application
  table and adapter. The workspace now contains learner-api, learner-app, learner-runtime, and the
  Postgres adapter only; tracked package/config searches found no removed workspace dependency.
- **Guarded reset:** Immediately before reset, the owned local endpoint/database and positive counts
  were re-resolved: one user, one session, five catalog rows, two learner Expeditions, one lesson
  read, and one response. The reset intentionally discarded those accounts, sessions, content rows,
  adoptions, progress, responses, and all other application state. It was not run against a shared
  host or production database.
- **Persisted result:** The regenerated code-first baseline has exactly `account`,
  `learner_journey_state`, `session`, `user`, and `verification`; `drizzle.__drizzle_migrations` has
  one row. A same-query positive control found `learner_journey_state=1` and the sampled removed
  relations `=0`. Final validation teardown left zero users and zero journey rows.
- **Topology/docs:** Both production and development Compose configurations parse with Postgres,
  migration, learner-api, and optional Caddy only; tracked `content/` is a learner-api build/watch
  input. AGENTS, CONTEXT, README, ADRs, validation routes, and rig ownership now describe the
  authored runtime rather than the deleted pipeline.
- **Qualification:** Local source, code-first schema, owned local-development Postgres, Compose
  parsing, automated tests, and intercepted browser evidence. No deployment, shared-host reset,
  production write, distributable build, or physical-device claim.

### U4 — Critical Thinking real use and native evidence (2026-08-31)

- **Direct inspection:** Critical Thinking is `PASS` for all six lesson sections, four option-select
  activities, one three-pair matching activity, one impostor set, two exact-reference Support Paths,
  and both Guardian pools. An initial U1 `FIX_FIRST` Support destination had already been repaired;
  this terminal inspection found no remaining unsupported claim, wrong key, or broken route.
- **Real backend:** One clean Better Auth/Hono/Postgres journey exercised adoption/activation,
  idempotent replay and stale refusal, every lesson and activity with wrong-to-correct paths,
  calibration/clear/restoration, Support open/hide/restore and evidence reuse, locked final Guardian,
  retreat/resume/abandon, shield loss/recovery, Leg first win/rematch, Expedition first win, rewards,
  leaderboard, sign-out/sign-in persistence, and learner isolation. Server/API payload assertions
  found no pre-answer key, truth/impostor marker, or private authored document.
- **Real-backend web:** Fresh production-format Expo export passed at phone and desktop viewports;
  stale-cookie recovery, profile creation, private grading, Support, refresh/resume, Journal/board,
  and three validation learners' exact teardown passed. A first rerun safely refused because Docker
  Desktop owned port 8091; the unchanged gate passed on free port 8092 and removed all three rows.
- **Android:** A fresh SDK-57 standalone e2e APK (`ef9a0cbd8b7d65badfe3abd0b9315520db661d3d6f70e42f9daf70f0231cb0aa`)
  passed sign-in, the retained 320-dp Support scenario, and Guardian presentation on API-35. The
  historical Support dialog-collapse mutant failed the exact body/footer assertion 3/3, while the
  restored production source and fresh APK passed; that narrow automatic authority is retained.
- **iOS:** A fresh SDK-57 Debug build on an iPhone 17 Pro iOS 26.5 simulator passed the canonical
  authored-runtime Maestro flow in 1m04s. It covered wrong-password recovery, Journal celebration,
  Support body/footer, both Guardian scopes, retreat/navigation, leaderboard, and authenticated
  restart. Screenshots were visually inspected; this remains Debug-simulator integration evidence.
- **Qualification:** Real local backend and browser, Android emulator authority only for the owned
  Support regression class, separate Android presentation smoke, and iOS Debug-simulator smoke. No
  deployed, distributable, physical-device, production, or external-factual-verification claim.

### U5 — five-Expedition catalog, Maestro unblock, and final matrix (2026-08-31)

- **Catalog:** The accepted order is Critical Thinking, Probability and Statistics, Personal
  Finance, Machine Learning, and Neuroscience of Memory and Attention. `pnpm content:check` accepted
  all five at catalog revision `80a6483fefded4030b69f6c699e44a5f19071aef0b0e559f70de3f72b009a87b`.
- **Semantic/source inspection:** `PASS` for all 18 lesson sections, 26 answer-bearing activities,
  10 exact-substring Support terms/destinations, five matching sets (16 pairs), five impostor sets,
  20 Leg-pool references, 25 Expedition-pool references, and all 44 section/explanation anchors
  against the five project-owned primers. Structural qualification was not treated as semantic
  approval. No `FIX_FIRST` remained.
- **Additional real use:** For each of the other four Expeditions, authenticated public HTTP set and
  cleared calibration, opened/hid/restored an authored Support Path, completed every Stop and every
  activity with wrong-to-correct grading, and won its Leg Guardian. The same run exercised all five
  Expeditions and persisted across sign-out/sign-in.
- **Maestro blocker fixed:** Diagnosis showed Maestro 2.6.1 enumerating its bundled Android DADB
  client for an explicit iOS run; Docker Desktop's non-ADB IPv4 listener on `localhost:5555` accepted
  the probe and blocked before XCUITest. The owned runner scopes IPv6 hostname preference to Maestro
  while XCUITest keeps explicit IPv4. It also owns one-process-per-flow execution, Debug-client deep
  linking after state clear, Keychain clear, keyboard submit, password-prompt dismissal, semantic
  Support scrolling, and dev-client overlay suppression. The flow then exposed and fixed the real
  trail-to-Journal back-stack defect, now covered at phone and desktop sizes.
- **Final automated matrix:** `pnpm check` passed direct qualification, five-table schema parity,
  all workspace typechecks/tests, lint, API and Expo builds, 25 learner-app suites/149 tests, and
  20/20 intercepted Playwright scenarios. `pnpm test:db` passed the fresh/current/legacy/partial/
  stale migration classifier and every live test-Postgres suite. Both Compose configurations,
  `git diff --check`, positive-controlled legacy searches, and the exact public-relation query
  passed. The iOS simulator was shut down and temporary root screenshots were removed.
- **Qualification:** The exit test is satisfied with evidence classes kept separate. `BLOCKERS.md`
  remains `_None._`; no owner-only action is required for this greenfield, non-release plan.

## Open findings

_None._
