---
title: Curate Five Ready-to-Play Source Expedition Mockups - Plan
type: implementation
date: 2026-08-27
execution: code
---

# Curate Five Ready-to-Play Source Expedition Mockups

**Status:** In progress — U0–U1 complete; U2 is next

**NEXT:** Implement U2 only. After its code-first catalog schema lands, perform the one additionally
authorized guarded development reset, regenerate and independently re-qualify Critical Thinking,
publish that fresh asset set, validate the learner projection, persist status, and commit.

**Decision state:** Accepted by the owner through the 2026-08-27 grilling. The initial catalog is
exactly Critical Thinking, Probability and Statistics, Personal Finance, Machine Learning, and
Neuroscience of Memory and Attention in that order. The first three target a curious general adult
with high-school reading ability; the last two target a technically experienced learner who prefers
density. The five initial Curated Sources are purpose-written from general model knowledge and are
accepted as project-owned playtest sources without strict external claim verification. They are
current-only: changing one rebuilds its accepted package, then the development database and every
learner path are hard-reset and reseeded. Source credits remain reachable from one catalog action,
not repeated through the play flow. Validation includes a fresh Debug iOS Simulator smoke and no
Android run.

The 2026-08-27 critical review added four owner decisions: generation runs before the catalog and
package units; all five paths share one live Concept registry; five or more playable stops is the
target with three accepted as the floor; and the accepted asset-set identity is pinned in the
catalog row. After U1 exposed the U2 baseline transition, the owner authorized one additional
guarded development reset after the catalog schema lands. Critical Thinking is regenerated and
re-qualified against that schema; its resulting registry is then preserved without another reset
through U7. U8 still owns the separate model-free reinstall reset.

## Goal capsule

- **Objective:** Give every learner a small, curated global catalog of five coherent, ready-to-play
  Source Expedition mockups, while making accepted neural artifacts deterministic to reinstall after
  a hard reset.
- **Learner-visible goal:** A new learner sees five intentional choices with stable titles, useful
  teasers, and playable multi-stop trails. Beginning a choice creates only that learner's
  expedition; it never removes or changes the shared choice for another learner.
- **Mastery relationship:** Acquisition mastery, grading, rewards, Recall Challenges, and Support
  Path evidence semantics are unchanged; only the existing qualified Concept Lesson plus
  option-select route is admitted, under
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
- **Content authority:** The committed project primer is the source being processed, under the
  accepted policy the next section owns.
- **Deep module boundary:** The existing [Source Expedition
  module](../../packages/application/src/sourceExpedition.ts) keeps owning qualification, adoption,
  activation, open, and learner-write authorization; a narrow catalog dependency adds publication
  and presentation without recreating those policies.
- **Persistence boundary:** Global accepted paths are packaged without users, sessions, Learner
  State, responses, progress, or secrets. One reset-and-install command validates and installs the
  current package set without a model call.
- **Validation route:** Apply the [lrnki validation
  skill](../../.agents/skills/validate-lrnki/SKILL.md); KTD9 owns the evidence set and its class
  boundaries.
- **Deployment boundary:** This plan authorizes only the development database named immediately
  before each reset. Installing the catalog on a shared or deployed host is a separate handoff.

## Source-authority resolution

The accepted source policy is an explicit product experiment, not a drift in provenance:

1. The five Markdown files are authored before runtime, committed, inspected as documents, and
   intentionally admitted through Source Registration as project-owned Curated Sources.
2. Their manifest discloses `lrnki_model_authored_project_source` and
   `general_model_knowledge_only`. Neither the learner UI nor validation may describe them as
   independently verified, externally authored, or representative of arbitrary-source ingestion.
3. Their passages may be cited verbatim as evidence that learner material matches the registered
   project document — never as evidence that an external authority confirmed its world knowledge.
4. Runtime model-authored prerequisites, Synthetic Topic Generation, and generated Support Steps
   stay paused by
   [`learnerKnowledgeAvailability.ts`](../../packages/application/src/learnerKnowledgeAvailability.ts).
   Nothing here relabels a Generated Grounding Bundle or routes source-less output around
   [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) or
   [ADR-0030](../adr/0030-confidence-gated-synthesis.md).
5. [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) still governs pipeline
   quality: inspect real operations over these exact documents. The waiver covers an external claim
   ledger for the documents, not source-fidelity, key, closure, or playability inspection.
6. An obvious material factual error found during ordinary inspection is still `FIX_FIRST`; the
   relaxed policy skips an exhaustive fact-check stage, not known bad content.

If implementation cannot hold this distinction without claiming the primers are external or
independently verified, stop and propose an ADR amendment before learner publication.

## Established problem classes and conventional design

- **Qualification accidentally acting as publication.** The catalog treats every succeeded
  enrichment that happens to satisfy qualification as public. This is allowlist/publication control:
  technical readiness and editorial selection are different decisions. The conventional
  low-complexity repair is one explicit global row whose presence publishes an already-qualified
  enrichment — not a CMS, workflow engine, or moderation queue.
- **Neural regeneration acting as database seeding.** The retained demo seed hard-resets and reruns
  non-deterministic paid stages: artifact materialization confused with fixture installation. The
  conventional repair is to generate and inspect once, export a content-addressed closed package,
  and reinstall it without model calls. A new generation is a new observation; replaying the
  accepted package reproduces the accepted state under
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).
- **Environment-scoped identity escaping into a portable artifact.** Concept IRIs are minted against
  one database's slug namespace and qualification hashes against the working tree's prompts and
  routing, so a "sealed" package silently depends on both. The conventional repair is the one every
  content-addressed format uses: mint under a single shared namespace, record the environmental
  identity inside the artifact, and verify it on install instead of trusting it.
- **Global catalog data mixed with learner ownership.** The five choices belong to the product;
  adoption and progress belong to one learner. The conventional boundary is a global catalog entry
  over immutable learner-neutral assets, with a separate learner-owned expedition created at Begin.
  No user identifier belongs in a package or catalog entry.
- **Purpose-built sources overstating pipeline generality.** Compact primers should onboard better
  than arbitrary long documents, but success on tailored sources proves only this curated
  experience, and reports must name that scope. Existing mixed-format fixtures keep owning broad
  ingestion regression evidence.

## Current repository facts

- [`fixtures/accepted-paths/manifest.json`](../../fixtures/accepted-paths/manifest.json) is
  currently usable by `register-from-manifest` because it preserves the existing `fixtures[]`
  fields. Its extra authorship, catalog, audience, order, teaser, and preferred-stop fields are not
  yet validated or consumed by source code.
- The five source files are independent, pure Markdown primers. Critical Thinking, Probability and
  Statistics, and Personal Finance have seven major sections. Machine Learning and Neuroscience of
  Memory and Attention have ten. They contain no external citations or source excerpts.
- `SourceExpedition.listCandidates` currently scans every succeeded source-derived enrichment,
  qualifies it, derives the title from the summit node, and sorts by run recency, stop count, and
  generated title. There is no explicit publication entry, stable catalog key, exact title, teaser,
  role, audience, or editorial order.
- The source-expedition qualification contract already requires a predecessor-closed ready sublayer,
  current qualified source-backed Concept Lessons, current qualified option-select items, and no
  learner-visible `llm_grounded` node. `qualify(enrichmentId)` must remain available before catalog
  publication so generation and evaluation can inspect a candidate.
- `/catalog` is a lazy authenticated learner read. Candidate cards currently show a Declared Domain,
  a generated summit title, and stop count; source title, URI, and license are stripped from the
  learner projection.
- `source_resources` stores title, source URI, and license, but there is no global catalog table.
  The code-first Drizzle schema and regenerated `0000` baseline own any new persisted shape under
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).
- Concept identity is one database-wide registry. `concepts` is unique on `iri` and on
  `(normalized_label, declared_domain)`; a fresh IRI is minted from a slug of the normalized label
  alone against every slug already in that database, and `concept_id` is UUIDv5 over that IRI. Two
  paths built in two separate empty databases therefore mint the same IRI and `concept_id` for any
  shared normalized label under different Declared Domains, and collide on install; one live
  registry mints distinct slugs instead. Adjudication pairs candidates only within one Declared
  Domain, so a shared registry cannot merge two paths, and a build fails closed when the registry
  changed after its own canonicalization.
- Learner-visible qualification is recomputed live. The composition binds the qualified asset config
  hash to the current prompt files and LiteLLM routing identity, and lessons and items qualify only
  on exact config-hash equality. A prompt or route change after export leaves every installed path
  unqualified and returns an empty candidate list with no error.
- Adoption persists the neural summit label on the learner-owned row, and the Journal prefers the
  live qualification title over it. Neither is the accepted catalog title.
- The only measured source-backed yield is the 2026-08-26 record in [`TODO.md`](TODO.md): one source
  produced six qualified lessons and exactly five predecessor-closed stops; another produced six
  qualified lessons and one closed stop. Predecessor closure, not lesson count, sets the playable
  stop count.
- Each adopted Source Expedition is already learner-owned and pinned to an exact asset-set identity.
  The same qualified enrichment remains available to other learners.
- [`scripts/seed-demo.sh`](../../scripts/seed-demo.sh) resets the database, combines every selected
  source into one graph, reruns model stages, and creates non-sign-in demo learners. It already
  fails: its build step omits the now-required `--canonicalization` argument, so the repository owns
  no working automated route to a seeded database. Repairing it would preserve the wrong workflow.
- The inspected development database had one disposable Better Auth user and no source, graph,
  learner-asset, or expedition data. A current hard reset drops `public` and therefore removes that
  user, sessions, every learner expedition, and progress. Re-resolve the exact database immediately
  before every destructive run.
- `pnpm dev:ios` can build and launch a fresh Debug development client on an iOS Simulator against
  the local learner API. The repository owns no automated iOS native scenario or distributable iOS
  gate; the existing Maestro rig is Android-only.

Environment, database contents, model route, account, simulator, and loaded revision are
time-sensitive. Every implementation unit re-verifies the facts it uses.

## Locked product and module design

### KTD1 — One current manifest owns the five-source catalog intent

Keep exactly one current manifest under `fixtures/accepted-paths/`. It owns, for each path:

- current catalog key, exact learner title, internal catalog role, audience, order, and teaser;
- preferred stop range, source path, content type, Declared Domain, source disclosure, and license;
- after acceptance, the current package path and digest.

The exact order is Critical Thinking, Probability and Statistics, Personal Finance, Machine
Learning, then Neuroscience of Memory and Attention. Roles and audiences are editorial metadata, not
badges. The manifest is parsed through one source-owned runtime schema; the current unchecked
TypeScript cast in the worker is replaced rather than duplicated.

There is no path revision number, revision table, coexistence rule, migration UX, or historical
package index. Editing a source replaces the current file; its hash changes, its package is rebuilt
and overwritten, and the next reset clears every development learner. Git history suffices.

### KTD2 — Build five independent source-derived graphs

Process each manifest entry independently:

```text
one registered source
  -> one Extraction Run
  -> one standalone Concept Canonicalization artifact
  -> one standalone published Graph Version
  -> one source-derived Graph Enrichment
  -> one qualified lesson/option asset set
  -> one Accepted Path Package
```

Do not extend one graph with another path, merge the five domains, or create cross-expedition
prerequisites. A missing prerequisite makes that path unavailable until the project primer supplies
it and the whole path is regenerated. It does not reopen LLM-grounded prerequisites.

Every accepted path generates into the same live registry. The historical U1 evidence followed the
initial guarded reset. After U2 changes the code-first baseline, one additionally authorized guarded
development reset discards those artifacts; Critical Thinking is regenerated and re-qualified
first, then that registry is preserved while U3–U7 run. The next reset is the model-free install in
U8. This is not convenience: Concept IRIs are minted against the whole registry, so paths built in
separate empty databases mint colliding identities for any shared normalized label. Within a path,
canonicalization and Graph-Version Build stay adjacent and serialized, because a build fails closed
when the registry gained Concepts after its own canonicalization. A regenerated path reuses its
existing registry identities for unchanged labels; its superseded enrichment stays inspectable and
unlisted.

Five or more playable stops is the target — five through seven for general paths, seven through ten
for advanced ones — and three is the accepted floor. A path below five gets at most two source-edit
regenerations; if the qualified trail still lands at three or four, accept the achievable count and
record the yield instead of editing further. Fewer than three is not publishable. These are targets
for source editing and real-use judgment, not a deterministic oracle over neural concept count, and
prerequisite closure and coherent completion outrank a preferred maximum.

### KTD3 — Add explicit accepted-catalog publication to Source Expedition

Add one global `source_expedition_catalog_entries` table with the smallest current-only shape:

```text
catalog_key primary key
enrichment_id unique foreign key
title
teaser
catalog_role
audience
sort_order unique
source_provenance jsonb
accepted_asset_set_identity
accepted_asset_config_hash
created_at
```

Row presence means that exact asset set was accepted and published. `source_provenance` is a
source-typed copy of the manifest's authorship, knowledge-basis, verification, and acceptance-scope
fields, not an opaque presentation string. There is no `status`, revision, history, draft, reviewer,
or moderation model. A narrow catalog read port returns finished entries and their source credits;
the Postgres adapter derives credits by joining the entry's graph membership to `source_resources`,
so the learner projection does not invent or duplicate source facts.

The two accepted identity columns close a silent-failure path. Qualification is recomputed live from
the current prompts and routing, so a prompt or route change after acceptance would otherwise leave
every installed path unqualified and every candidate list empty with no stated reason. A live
asset-set identity differing from the accepted one refuses by name as `accepted_asset_set_changed`.

Keep `SourceExpedition.qualify(enrichmentId)` independent of publication for evaluators and package
export. Require an accepted entry in `listCandidates`, `adopt`, `openOwned`, `openActive`, and
`authorizeActive`. Overlay exact title, teaser, and order from the entry on every learner-facing
result — candidate lists and opened expeditions alike — so an adopted path never carries a different
name from the choice that produced it. Never derive accepted presentation from the neural summit,
and stop treating the learner-owned row's stored title as authoritative for a Source Expedition; the
catalog entry is its one presentation owner. The existing module remains the one authority for
readiness, asset identity, ownership, adoption, activation, and learner writes.

All five entries publish together only after all five packages validate against the current
qualification identity. An unlisted or partially installed enrichment remains inspectable but cannot
enter Journal, Catalog, Begin, direct Study Session reads, grading, Recall Challenge, or Support
Path through a learner route.

### KTD4 — Preserve global sharing and per-user adoption

Catalog entries and accepted packages contain no learner key. Every authenticated learner sees the
same ordered accepted entries, except that a snapshot they already adopted leaves their candidate
list and appears under their owned expeditions; another learner's catalog is unchanged. Begin still
sends only `enrichmentId` and the server derives every presentation and asset fact. Adoption stays
idempotent, activates the learner-owned row, and pins the existing exact asset-set identity. No path
is silently pre-adopted and no reset script invents a user.

### KTD5 — Persist one sealed current Accepted Path Package per path

After a path passes real-use inspection, export a deterministic JSON package to
`fixtures/accepted-paths/packages/<catalog-key>.json`. The package carries a format identity and the
closed global-data projection needed to reproduce the accepted Source Expedition:

- manifest catalog metadata plus source content hash and exact registered source metadata;
- Structured Document, Extraction Run, Concept Canonicalization, published Concept registry rows,
  Graph Version, and immutable artifacts needed for inspection;
- Graph Enrichment nodes, trusted edges, grounding, difficulties, and layer purpose;
- current qualified Concept Lessons, option-select items/options, qualification/config identities,
  and exact asset-set identity;
- stable row identities and timestamps only where domain ordering or inspection requires them; and
- the accepted asset-set identity and qualified asset config hash observed at export.

It excludes Better Auth tables, Learner State, learner expeditions, responses, calibration, lesson
reads, Support Paths, awards, secrets, provider credentials, transient leases, and scratch reports.
Operational cost reports remain in `tmp/`; include only the attributable model/config identities
required to understand the accepted artifacts.

The exporter refuses an unpublished graph, failed enrichment, unqualified route, fewer than three
stops, a catalog-key mismatch, a source hash mismatch, non-unique source basename, learner-scoped
rows, or an incomplete foreign-key closure. It preserves every accepted UUID and never manufactures
replacement identities or rewrites a stale config hash. It writes canonical JSON and a digest that
the manifest records. The package file and digest are overwritten on the next accepted generation;
there is no compatibility promise for old packages during greenfield development.

Across the whole package set, `concept_id`, `iri`, and `(normalized_label, declared_domain)` must
agree one to one. A set that disagrees was generated against divergent registries and is refused
before anything is reset; installing it would violate a registry constraint midway or overwrite one
path's Concept with another's.

### KTD6 — Make reset/reseed model-free, complete, and fail closed

Add one package importer plus `pnpm seed:accepted-paths` backed by a clearly named reset-and-install
script. It:

1. loads `.env`, resolves and displays the exact database name and endpoint, and reuses the current
   `lrnki`/`lrnki_test` reset guard;
2. validates the manifest, exact five keys/order, package format, package digests, source hashes,
   cross-package Concept identity agreement, foreign-key closure, and absence of learner/secret data
   before reset, and refuses an incomplete package set rather than publishing part of the catalog;
3. calls the existing schema reset/migrator;
4. installs all five global packages without any LiteLLM or embedding call;
5. re-derives package and qualification identities, refuses loudly when a package's accepted asset
   config hash differs from the current runtime's, then inserts all catalog entries last in one
   transaction; and
6. proves through the learner candidate route — not through row presence — that exactly five
   accepted entries are listable in order, carrying a positive control over the same rows so an
   inert query cannot pass as a clean result, and that no learner, auth, or progress row exists.

An import failure leaves no visible catalog entry: preserve unpublished rows for diagnosis or reset
again next run, but never publish a partial five-path set. The command is destructive by design and
says so, naming users, sessions, learner paths, and progress. Two consecutive runs must reproduce
the same package-projected catalog and leave no historical row.

Delete `scripts/seed-demo.sh`, `seed:demo`, and their live documentation in the same replacement
change rather than repairing its mixed-domain graph, neural reseed, or fake learners. The Admin Lab
`demoSnapshot` fallback is a separate read-only empty-state concern and stays out of scope.

### KTD7 — Keep the learner catalog compact

Candidate cards show only the exact title, teaser, playable stop count, and Begin action. Do not
show catalog role, audience classification, model-authorship warnings, source chips, or repeated
credits on each card or lesson. The Journal's initial Explore section contains the five entries in
manifest order; after adoption, the remaining candidates retain that order. Browse All remains
searchable.

Add one `Sources & licenses` action in the Catalog header. It opens the existing dialog anatomy and
lists the five project primers with their disclosure and license, grouped by path, from the catalog
read; the client keeps no second source list. Non-HTTP source text renders as text, not a link.

This is information architecture, not a new game mechanic: it does not alter the trail, challenge
curve, graded evidence, or mastery semantics that would trigger the additional ADR-0032 review.

### KTD8 — Judge source fidelity, coherence, and playability directly

For each path, run the production source-backed pipeline from its exact fixture and inspect
persisted payloads beside the admitted source blocks. The required initial gate is:

- source parses into non-empty located blocks and the intended major sections remain visible;
- extraction retains a small non-redundant core without carrier titles or proposition-shaped labels;
- the standalone graph contains no cross-path concept or prerequisite;
- the accepted trail is predecessor-closed, completable, meets the KTD2 stop floor, and contains no
  `llm_grounded` learner-visible node;
- every stop has exactly one current qualified Concept Lesson and at least one qualified
  option-select item;
- every learner-visible material claim is supported by the exact project source, and every item has
  one defensible key with distractors wrong for the stated question;
- wording, reading density, ordering, and examples fit the assigned audience; and
- a reviewer can play from the first stop through completion without a dead end; and
- the yield is recorded as admitted core concepts, qualified lessons, qualified option-select items,
  and predecessor-closed stops, so a short trail is diagnosed rather than guessed at.

`FIX_FIRST` retains the definition in AGENTS rule 14. In addition, an obvious material error or
dangerous prescription found in the project source is fixed before acceptance even though no
external claim-by-claim verification ledger is required. Sparse optional coverage, a stop count
between the floor and the target, or non-material wording variation may be recorded without
weakening source support, key uniqueness, prerequisite closure, or completion.

Never tune a prompt, tool description, schema, or deterministic gate to these five topic labels or
expected outcomes. Edit the source when the source is the problem; when a domain-general pipeline
defect appears, name its problem class per AGENTS rule 21 and fix the owning module. Do not rerun an
unchanged failed arm for luck.

### KTD9 — Use the smallest honest surface validation set

Automated application/store/API tests prove accepted allowlisting, ordering, package validation,
reset/install, global sharing, per-user ownership, and source-credit projection. Intercepted web
proves loading/error/empty/populated states and the central source dialog. Real-backend web against
the reset development database proves exact package data, two-user separation, Begin, persistence,
and one complete route.

Finish with a fresh Debug iOS development build on a named iOS Simulator and OS against the real
local API/PostgreSQL state: exact titles and order, the source list, Begin, trail render, and at
least the first qualified lesson or activity for all five paths, plus one path end to end, with
screenshots inspected under the plan's gitignored `tmp/`. That is simulator-only manual evidence,
not an automated native, distributable, deployed, or physical-device claim, and no Android gate
runs.

## Implementation units

Units are exclusive and execute in order. Generation comes first so the catalog, package, and reset
units are designed and proved against a real path instead of invented rows. Parallel agents may
inspect or draft non-overlapping source content, but the single reset, real-model generation,
package export, shared plan edits, and surface validation are serialized.

### U0 — Accepted contract and five project source fixtures — complete

The grilling, the current-only manifest, the five purpose-written Markdown sources, their mechanical
contract test, and this plan and its indexes are in place. The Validation Log owns the evidence.

### U1 — Qualify Critical Thinking and measure the achievable trail — complete

The first source was generated, qualified, measured, and played through in the pre-U2 registry. The
Validation Log owns that historical evidence; U2 replaces its artifacts and evidence after the
authorized schema reset. No publication or package exists yet.

### U2 — Explicit accepted catalog and learner projection

1. Add the code-first catalog-entry table with its pinned accepted identity columns, regenerate the
   sole baseline, and add the narrow catalog read/write port and Postgres adapter. Parse the
   accepted manifest through one validated source-owned schema.
2. Deepen Source Expedition with the catalog dependency while preserving prepublication `qualify`.
   Require accepted entries for list/adopt/open/authorize, overlay exact presentation and order on
   every learner-facing result, and refuse a drifted accepted asset set by name.
3. Extend Catalog/Journal/API projections with teaser and centralized source credits. Update the
   candidate card, search, and one Catalog source dialog without changing trail or mastery UX.
4. Prove unlisted qualification, listed publication, exact ordering, missing-entry refusal, drifted
   identity refusal, one name across candidate and adopted views, ownership, no client presentation
   authority, source-list single ownership, and code-first reset. After the schema lands, perform
   the one additionally authorized guarded development reset; regenerate and independently
   re-qualify Critical Thinking, publish only that fresh asset set, exercise the smallest live
   learner route, and commit one coherent unit. Preserve its resulting Concept registry without
   another reset through U7.

### U3 — Accepted package export/import and reset replacement

1. Define the package runtime schema, closure projection, canonical serialization/digest, exporter,
   and importer behind narrow application/port boundaries. Reject learner-scoped, incomplete, or
   registry-inconsistent data.
2. Export the accepted Critical Thinking package from the live database and prove the round trip in
   `lrnki_test`, which leaves the generation database intact. Prove it preserves source blocks,
   graph/enrichment, Concept registry identity, qualified lessons/items, qualification identity, and
   catalog presentation byte-for-byte where exactness is promised, while creating zero users or
   learner rows and making zero model calls.
3. Add `seed:accepted-paths`; validate every package before reset and publish catalog rows last.
   Prove both arms with the one accepted package: the mechanics succeed, and an incomplete
   five-package set is refused before anything is destroyed. Delete `seed:demo`,
   `scripts/seed-demo.sh`, and superseded runbook references.
4. Run focused unit and `pnpm test:db` coverage, update the plan status, log, and findings, and
   commit once.

### U4 — Qualify Probability and Statistics

Run the U1 generation and inspection route for Probability and Statistics into the same live
database, then export and round-trip its package as U3 defines. Give focused attention to
population/sample distinctions, conditional probability direction, interval interpretation, test
errors, effect size, and association-versus-causation. Mathematical notation must render readably on
learner surfaces and no approximation may be presented as an identity.

### U5 — Qualify Personal Finance

Repeat the U4 shape for Personal Finance. Reject jurisdiction-specific assumptions, individualized
advice, guaranteed outcomes, fixed universal reserve/allocation rules, modal inflation, or a
comparison that hides total cost, liquidity, or risk. Central source disclosure must remain visible
without entering cards or lessons.

### U6 — Qualify Machine Learning

Repeat the U4 shape for Machine Learning. Keep the learner promise to applied supervised learning.
Inspect split and leakage boundaries, preprocessing fit scope, validation design, metric tradeoffs,
calibration, and distribution shift. Reject version-specific API claims, source-specific benchmark
scores, or an evaluation rule that assumes independent and identically distributed data when the
source states otherwise.

### U7 — Qualify Neuroscience of Memory and Attention

Repeat the U4 shape for Neuroscience of Memory and Attention. Distinguish observation from mechanism
and settled principle from active model; preserve limits around neural correlates, consolidation,
sleep, reconsolidation, and practical transfer. Reject deterministic brain-region stories or
universal study prescriptions not supported by the project source.

### U8 — Install and exercise the complete shared catalog

1. From a prevalidated five-package manifest, run the model-free hard reset and install over the
   live generation database. Prove the result contains exactly five accepted entries in order, one
   independent qualified enrichment per entry, a consistent Concept registry, no superseded global
   path, and no auth or learner row.
2. Use two fresh learners against the real local API. Both see the same five choices; one learner's
   adoption/progress changes only that learner's projection. Restart the API/app and prove persisted
   ownership and progress.
3. Run the intercepted web catalog states and real-backend web flow. Exercise exact titles, teasers,
   source dialog, search, Begin, every trail's first activity, and one complete path. Inspect the
   actual database projection with positive controls over the same rows.
4. Update the Validation Log and commit once. No deployed/shared-host reset occurs in this unit.

### U9 — iOS Simulator, repository gate, and closure

1. Reverify Xcode/runtime/simulator/API/database facts. Build and install a fresh Debug development
   client from the exact revision on a named iOS Simulator and OS.
2. Observe the five-path checklist in KTD9, inspect screenshots, and record exact simulator evidence
   plus its exclusions. Run no Android or physical-device scenario.
3. Run the smallest complete dependency-graph repository gate, including `pnpm test:db`, schema
   parity, affected package tests/typechecks/lint/builds, intercepted web, links/caps, and
   whitespace.
4. Move durable source/catalog/reset workflow to its canonical owners, add or amend an ADR only if
   implementation reveals a lasting trade-off, consolidate current status in TODO, and delete this
   completed plan under the documentation lifecycle.

## Acceptance contract

The plan is complete only when all of the following are true:

1. The repository owns exactly five current project primers and one validated manifest with the
   accepted titles, order, audience split, disclosure, and current package digests.
2. Each path is an independent source-derived graph and qualified predecessor-closed trail meeting
   the KTD2 stop rule — five or more wherever achievable, never fewer than three — with no
   learner-visible LLM-grounded node, one current qualified lesson per stop, and at least one
   current qualified option-select item per stop. Any path accepted below five records its measured
   yield.
3. Direct inspection finds no unsupported learner-visible material claim, false/non-unique key,
   trusted-prerequisite leak, incoherent route, known material source error, dangerous financial
   prescription, or misleading neuroscience certainty.
4. One sealed current package per path reproduces the accepted global source-to-assets closure with
   exact qualification/config identity and contains no learner, auth, progress, secret, or scratch
   data. The five packages agree on one Concept registry, and a package whose accepted asset config
   hash no longer matches the runtime is refused by name rather than installed into an empty
   catalog.
5. `pnpm seed:accepted-paths` validates before destruction, resets the intended development
   database, installs all five packages without model calls, publishes catalog entries last, and
   creates no user. The obsolete demo seed path is gone.
6. Every learner sees the same exact ordered global catalog under one accepted name per path in both
   candidate and adopted views; Begin creates a per-user pinned Source Expedition; adoption and
   progress by one learner do not alter another learner.
7. Candidate UI stays compact, while all source disclosures and licenses are reachable from one
   Catalog action and have no second client-owned list.
8. Intercepted web, real-backend web, and fresh Debug iOS Simulator checks pass for the interactions
   they actually exercise. Evidence is not upgraded to Android, automated native, deployed,
   distributable, physical-device, or release authority.
9. Reports state that these are model-authored project playtest sources accepted from general model
   knowledge without exhaustive external fact verification. They do not generalize success to
   arbitrary-source ingestion or independently verified factual authority.

## Out of scope and safety boundaries

- No external source research, citation pack, claim ledger, licensing crawl, or mandatory
  independent fact-check stage for these five initial primers.
- No runtime smart-model source authoring, web search, retrieval/ranking, upload CMS, admin
  mutation, moderation queue, or source approval UI.
- No reactivation or redesign of Synthetic Topic Generation, LLM-grounded prerequisites, generated
  Support Steps, matching items, or impostor items.
- No combined five-domain graph, cross-expedition prerequisite, broad field-completeness promise, or
  source-specific prompt/schema/gate tuning.
- No stable path revisions, historical package compatibility, coexistence, migration UX, additive
  update, or preservation of learners across a source/package update.
- No per-card or per-lesson source credit, role/audience badge, or duplicate client source list.
- No runtime model call during reset/install and no fake demo learner. Keep the unrelated Admin Lab
  empty-state snapshot unless separate work proves it redundant.
- No shared-host/production reset, deployment, Android run, automated iOS rig, distributable iOS
  build, physical-device run, or release action without separately explicit authority.
- No reset between the post-U2 generated paths: after the one additionally authorized guarded reset
  following the U2 baseline change, preserve the regenerated Critical Thinking Concept registry
  through U7. The next reset is the model-free install in U8. Re-resolve the exact database
  immediately before each reset, keep unrelated dirty work, and follow the root runbook's host-only
  detached Compose rule.

## Validation Log

### Reset-order resolution — 2026-08-27

- The owner explicitly authorized one guarded development reset after the U2 schema, fresh Critical
  Thinking qualification, and preservation of that resulting Concept registry through U7. This
  coordination batch changed no schema, database, model artifact, learner surface, or release state.

### U0 — Accepted contract and source fixtures — 2026-08-27

- Integrated review reconciled the five sources' catalog order, audiences, reset policy, interfaces,
  and authority. Their contract passed exact order/metadata, ingestion, links, JSON, and whitespace.
- Authority is source/documentation only; no model, database, learner, surface, or device ran.

### U1 — Critical Thinking qualification and achievable trail — 2026-08-27

- Guarded `lrnki` was reset once. The 116-block source yielded 61 candidates (27 core, 34 optional)
  and a standalone 27-Concept Graph Version.
- Two synchronized-`429` arms failed before separate ordinary/rate-limit budgets plus capped equal
  jitter repaired the shared transport seam; the next K=8 arm recovered under rate-limit pressure.
- The enrichment has 58 source-backed nodes, zero `llm_grounded`, 27 certain/23 uncertain edges, and
  58 difficulty rows. Generation retained 44 lessons and 43 options; qualification admitted 35.
- Inspection accepted 129/129 claims, 105/105 distractors, and 35/35 keys. Evaluation used 387 calls,
  546,575 tokens/about `$0.026176692`; the journey used 1,280/2,244,266/about `$0.197703456`.
- Ordering used 9 DigitalOcean calls and one Groq fallback; all 387 verifier calls used DeepInfra.
  This qualifies inspected topology, not quantization equivalence.
- A reserved learner mastered all 35 stops without scaffold; positive controls preceded exact
  teardown. Focused/full suites passed 49/49, 217/217, 875/875, and 8/8 with types and ESLint.
- Authority is local database, production-model, artifact, and learner-route evidence only.

### Open findings

- The five primers intentionally lack an external claim-verification ledger; that is their accepted
  playtest boundary, while a known material defect still blocks acceptance.
- Critical Thinking is qualified but unpublished under neural title `Robust Option`. U2 makes the
  manifest presentation authoritative; no package/export/import exists until U3.
- Achievable stop count remains unmeasured for Probability and Statistics, Personal Finance,
  Machine Learning, and Neuroscience. U4–U7 own those independent measurements.
- Pinning the accepted identity turns a drifted qualification into a named refusal but does not
  decouple it: a prompt or route change after acceptance still requires regeneration, and AGENTS
  rule 14 still invalidates the affected quality evidence.
