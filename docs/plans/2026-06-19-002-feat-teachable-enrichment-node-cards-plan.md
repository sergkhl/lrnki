---
title: "feat: Teachable enrichment-node cards — Card Bank over the Derived Graph Layer"
date: 2026-06-19
type: feat
status: planned
origin: docs/brainstorms/2026-06-19-learner-recall-adaptive-path-requirements.md
todo: docs/plans/TODO.md (#4 "Make enrichment-only frontier targets teachable", unblocks #5)
depth: deep
---

# feat: Teachable enrichment-node cards — Card Bank over the Derived Graph Layer

## Summary

Adaptive paths can advance a learner to a Derived-Graph **Enrichment Node** (a `source_mentioned` rescued prerequisite or an `llm_grounded` minted one), but the Card Bank only generates cards for published anchor Concepts. So a frontier target can be structurally impossible to recall-test, which quietly undercuts the adaptive loop that just shipped at `EXPERIMENT_ONLY` (`TODO.md` #4).

This plan re-keys the Card Bank and Response Log off `concept_id` and onto the unified Derived Graph Layer node identity (`derived_node_id`), so card generation covers **every** node in a Derived Graph Layer — anchors from their CEP, `source_mentioned` nodes from their rescued verbatim mentions, and `llm_grounded` nodes from their Generated Grounding Bundle. Each card carries an explicit **grounding provenance** (`source_cep` | `source_mentioned` | `generated`); generated cards are verified against the generated bundle and labelled non-verbatim, never claiming a source quote. Admin Lab gains a per-path **card-coverage** surface that badges each frontier node's provenance and, for any node that still yields no verifiable card, shows an honest "not directly recall-tested yet" treatment instead of a phantom card.

This realigns the implementation with the origin doc's stated design — *"cards live alongside the Derived Graph Layer"* (Key Decisions) and R3's *"keyed to a graph version / enrichment"* — which the shipped code drifted from by keying cards to `concepts`.

---

## Problem Frame

**Current state.** `generateCardBank` (`packages/application/src/generateCardBank.ts:36`) iterates `snapshot.concepts` only. `cards` and `response_log` both declare `concept_id uuid NOT NULL REFERENCES concepts(concept_id)` (`packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`). Enrichment nodes live in `derived_graph_nodes` with `concept_id NULL`, so they can have neither a card nor a response row. The learner loop bridges the two id spaces with a `conceptId → derivedNodeId` resolver built only for anchors (`apps/admin-lab/src/lib/learnerLoop.ts:240`, `packages/application/src/responseLogLearnerState.ts` via `conceptToNodeResolver`).

**Consequence.** `selectFrontierTarget` (`packages/application/src/adaptivePathProjection.ts`) can legitimately return an enrichment `derived_node_id`; the path then contains a node with no card. The loop has no card for it and no way to say why — the only learner-facing surface (`getLearnerLoopDetail`) lists already-answered response rows, not the path's untested frontier.

**Desired outcome.** For any published graph version + Derived Graph Layer, an operator (and, later, a learner) can see that **every** path node is either backed by a verifiable, provenance-labelled card or is explicitly marked not-yet-recall-testable — with no silent gaps and no card that misrepresents generated grounding as a source quote.

**Trust level.** The learner loop stays `EXPERIMENT_ONLY` (ADR-0014 / ADR-0024); this plan does not introduce learner-calibrated modelling. It makes the existing experimental loop *complete and inspectable* over the whole Derived Graph Layer.

---

## Requirements Traceability

Carried from the origin requirements doc (`docs/brainstorms/2026-06-19-learner-recall-adaptive-path-requirements.md`) and `TODO.md` #4/#5:

- **R1/R2 (extended).** Generate one anki-style card per **Derived Graph Layer node** (not only anchors), conditioned on that node's grounding, via the forced named tool schema (AGENTS rules 5, 6). The answer key cites the grounding it derives from for traceability.
- **R3 (realigned).** The Card Bank is a learner-neutral derived asset **keyed to the enrichment / Derived Graph Layer**, regenerable, never written into the asserted graph or the Derived Graph Layer's authoritative edges.
- **R4–R6 (re-keyed).** The Response Log remains append-only and keeps per-item (`card_id`) and per-skill identity, with the skill now the `derived_node_id`; the anchor's stable `concept_id` remains recoverable by join for later BKT fitting.
- **TODO #4.** Generate cards for both enrichment-node kinds with a clearly-labelled provenance distinction, **and** add a UI treatment for any node that still yields no verifiable card.
- **TODO #5 (unblocked).** With enrichment-node card coverage, the broadened learner-loop target coverage rerun becomes meaningful.
- **AGENTS rule 16/11.** The verbatim gate keeps its hard veto only where it enforces a provable guarantee (source-verbatim citation); the generated-card path records a `not_applicable_by_grounding`-style provenance instead of faking a source quote. No test asserts model card quality.

Out of scope (preserved non-goals): learner-calibrated difficulty/IRT/BKT (ADR-0014/0024), CEP definition-passage precision (`TODO.md` #1), forced-tool transport hardening (`TODO.md` #2), and any stable cross-enrichment node identity (see Open Questions).

---

## High-Level Technical Design

### Identity model: before vs. after

```
BEFORE (anchors only)                       AFTER (whole Derived Graph Layer)
─────────────────────                       ─────────────────────────────────
concepts ──< cards (concept_id)             derived_graph_nodes ──< cards (derived_node_id)
concepts ──< response_log (concept_id)        │  anchor      → concept_id, CEP grounding
                                               │  source_mentioned → rescued verbatim mentions
learner loop bridges:                          │  llm_grounded → generated grounding bundle
  derived_node_id ──(resolver)──> concept_id  derived_graph_nodes ──< response_log (derived_node_id)
  ↑ only works for anchors                    resolver DELETED — loop is one id space (rule 18)
```

### Card generation fan-out by grounding origin

```
for each node in DerivedGraphLayer.derivedNodes:
  grounding, provenance =
    anchor            → published CEP passages (definitions+mentions)   → source_cep
    source_mentioned  → node.groundingPassages (verbatim source quotes) → source_mentioned
    llm_grounded      → node.groundingBundle (generated, quoteless)     → generated

  draft = cardGeneration.generate({ ...grounding, provenance })

  verify(draft.citations) against grounding:
    source_cep | source_mentioned → citation MUST be verbatim substring of a
                                     source passage (fail-closed, AGENTS rule 6/16)
    generated                     → citation MUST match a generated bundle passage;
                                     recorded as `generated`, NEVER source-verbatim

  any unverifiable citation OR no usable grounding → REJECT (RejectedCard)
                                                     → feeds the UI fallback
```

*Directional guidance, not implementation specification.*

### Path card-coverage projection (UI)

```
path.steps (derived_node_id[])  ⨝  cards (by derived_node_id)
  → per step: { label, groundingOrigin, card? , provenance? }
  → step with card     → render question/badge(provenance)
  → step without card  → render "not directly recall-tested yet" + reason
```

---

## Key Technical Decisions

### KTD1 — Re-key cards and response_log onto `derived_node_id`; delete the resolver (recommended)

The Derived Graph Layer is already the loop's single id space (`learner_paths`, `learner_path_steps`, `derived_prerequisite_edges`, `node_difficulties` all key on `derived_node_id`; `derived_graph_nodes` unifies anchors and enrichment nodes). `cards` and `response_log` are the only laggards on `concept_id`. Re-keying them onto `derived_node_id` (a) lets enrichment nodes carry cards/responses, (b) matches the origin doc's "cards alongside the Derived Graph Layer" intent, and (c) is rule-18 clean: the `conceptId → derivedNodeId` resolver and the dual id space are *deleted in the same change*, not retained. The anchor's stable `concept_id` is still reachable via `derived_graph_nodes.concept_id` for later BKT fitting (R6), so nothing is lost that isn't mechanically recoverable.

**Alternative considered — polymorphic subject (`concept_id` XOR `derived_node_id`).** Add a nullable `derived_node_id` beside the existing `concept_id` on both tables with a CHECK that exactly one is set. Lower code churn (anchor paths untouched), but it keeps the `concept_id` deviation *and* adds a parallel id — two representations of "card subject," the exact second-source-of-truth that AGENTS rule 18 forbids, and it leaves the resolver alive. Rejected: the greenfield rules (1, 8, 18) and the documented intent both favor the unification.

### KTD2 — Card carries an explicit grounding provenance; generated cards are verified against the generated bundle, never the source

`Card` gains `groundingProvenance: "source_cep" | "source_mentioned" | "generated"`. For `source_cep`/`source_mentioned`, citation verification is unchanged: the quote must be a verbatim substring of a real source passage, fail-closed (AGENTS rule 6/16 — a provable guarantee). For `generated`, there is no source quote (the bundle is `not_applicable_by_grounding`); the card cites the **generated bundle passages** and is recorded as `generated` so the UI can label it "generated grounding, not a source quote." This keeps the hard veto exactly where it enforces a guarantee and refuses to manufacture a fake source citation for a generated node — the honest provenance the loop needs.

### KTD3 — `CardAnswerKeyCitation` becomes a provenance-tagged union

A source citation carries `{ provenance: "source"; sourceResourceId; sourceBlockId; evidenceQuote }`; a generated citation carries `{ provenance: "generated"; derivedNodeId; passageText }` (no source ids — there is no source). The persisted `card_answer_key_citations` table gains nullable source columns + a `provenance` discriminator + CHECK, so a generated card's citation cannot smuggle null source ids past the schema. This is the fail-closed envelope around the two grounding contracts.

### KTD4 — Card Bank generation is enrichment-scoped and takes an `enrichmentId`

Because enrichment nodes exist only within a Derived Graph Layer, `generateCardBank` now loads a `DerivedGraphLayer` (via `EnrichmentRunStorePort.getLayer`) plus the published snapshot (for anchor CEPs), and the worker `generate-card-bank` command takes `<enrichmentId>`. Card regeneration replaces a layer's cards (delete-then-insert by `derived_node_id`), matching the existing per-version replace semantics. Config hash bumps `card-bank-v1 → card-bank-v2`.

### KTD5 — The UI fallback is driven by real card-coverage, not a guess

Admin Lab computes, per learner path, which steps have a verifiable card (joining `cards` on `derived_node_id`) and renders the provenance badge or the "not directly recall-tested yet" treatment. The fallback reason is derived from the node's grounding origin and the `RejectedCard` reason when present (e.g., "generated prerequisite, no card generated" / "no usable grounding"). No node is silently dropped from the view.

---

## Output Structure

No new directories. Touch surface is per-unit `**Files:**` below; the change is concentrated in `domain-core` types, `application` generation, `ports`, the single SQL migration, the worker command, and the Admin Lab learner-loop surface.

---

## Implementation Units

### U1. Re-key the Card Bank and Response Log onto the Derived Graph Layer node identity

**Goal.** Make `derived_node_id` the single subject identity for cards and responses; remove the `concept_id` dependency that excludes enrichment nodes.

**Requirements.** R3, R4–R6 (re-keyed), TODO #4 (foundation).

**Dependencies.** None (foundation).

**Files.**
- `packages/domain-core/src/index.ts` — `Card` (`conceptId` → `derivedNodeId`, add `groundingProvenance`); `ResponseLogRow` / `NewResponseLogRow` (`conceptId` → `derivedNodeId`); `CardAnswerKeyCitation` → provenance-tagged union (KTD3).
- `packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql` — re-key `cards`, `response_log`, `card_answer_key_citations` onto `derived_node_id REFERENCES derived_graph_nodes(derived_node_id)`; add `cards.grounding_provenance` + CHECK; add citation `provenance` discriminator + nullable source columns + CHECK; update the `cards` JSON_TABLE projection view (line ~404) to emit `derived_node_id` + `grounding_provenance`. Edit the single migration in place (AGENTS rule 8); no second migration.
- `packages/infrastructure-postgres/src/PostgresStores.ts` — `cards`/`response_log` read/write keyed by `derived_node_id`; citation persistence handles both provenance variants.

**Approach.** Edit the canonical hand-written SQL migration directly (one source of truth, AGENTS rule 8/18). Drop `concept_id` from `cards` and `response_log`; the anchor's `concept_id` is recovered by joining `derived_graph_nodes` when needed. `cards` gains `UNIQUE (derived_node_id)`; `response_log.derived_node_id REFERENCES derived_graph_nodes`. The citation table keeps source columns nullable, gated by a `provenance` CHECK so a `generated` row cannot carry source ids and a `source` row cannot omit them.

**Patterns to follow.** Mirror `learner_paths` / `learner_path_steps` FK shape onto `derived_graph_nodes`; mirror the existing artifact-plus-relational transactional persist in `PostgresStores.ts`.

**Test scenarios.**
- Round-trip: persist a card for an anchor node and for each enrichment-node kind; `getCard(derivedNodeId)` and `listCardsForEnrichment` return them with correct `groundingProvenance`.
- Citation persistence: a `source` citation round-trips with source ids; a `generated` citation round-trips with `passageText` and null source ids; a `generated` citation with non-null source ids is rejected by the CHECK.
- `response_log` append keyed by `derived_node_id` round-trips; appending with an unknown `derived_node_id` fails (FK).
- JSON_TABLE `cards` projection returns `derived_node_id` + `grounding_provenance`.
- Edge: `response_log` row for an enrichment-node card (no `concept_id` anywhere) persists and reads back.

**Verification.** `scripts/reset-db.sh` applies the single migration cleanly via `psql`; Postgres store tests green; no `concept_id` column remains on `cards`/`response_log`.

---

### U2. Generate cards across all grounding origins with provenance-aware verification

**Goal.** `generateCardBank` produces a card for every Derived Graph Layer node, conditioned on the right grounding, verified under the right contract.

**Requirements.** R1, R2, TODO #4 (both kinds + provenance), AGENTS rules 5, 6, 16.

**Dependencies.** U1.

**Files.**
- `packages/application/src/generateCardBank.ts` — iterate `layer.derivedNodes`; build grounding + provenance per node kind; branch verification (source-verbatim for `source_cep`/`source_mentioned`; generated-bundle match for `generated`); reject fail-closed; carry `RejectedCard.reason` for the UI fallback.
- `packages/ports/src/index.ts` — `CardGenerationPort.generate` input becomes a discriminated union over grounding source (CEP passages | source-mention passages | generated bundle passages) carrying `groundingProvenance`.
- `packages/infrastructure-litellm/src/extractionAdapters.ts` (card generation adapter) — pass the grounding passages + provenance into the tool call.
- `packages/infrastructure-litellm/src/toolSchemas.ts` — extend/parameterize `cardGenerationSchema` so the citation field is described domain-neutrally for both "verbatim source quote" and "generated grounding passage" (AGENTS rule 17 — no fixture-specific language).

**Approach.** A pure helper `selectNodeGrounding(node, snapshot)` returns `{ provenance, passages }`: anchors resolve their published CEP via `snapshot` (by `concept_id`), `source_mentioned` use `node.groundingPassages`, `llm_grounded` use `node.groundingBundle.definitions/mentions`. Verification reuses `evidenceQuoteMatches` against source passages for the verbatim contract; for `generated`, the citation must match a bundle passage's text (exact/normalized), recorded as `generated`. A node with zero usable grounding passages is rejected before any LLM call.

**Patterns to follow.** Keep the fail-closed structure already in `generateCardBank.ts:65-82`; keep the verbatim helper `evidenceQuoteMatches`; mirror the per-provenance recorded-disposition pattern from `GroundingVerbatimDisposition`.

**Test scenarios** (canned model responses as *input fixtures* exercising the deterministic verification envelope only — AGENTS rule 11; no assertion of card content quality).
- Anchor card whose citation is a verbatim substring of a provided CEP passage → accepted, `groundingProvenance = source_cep`.
- `source_mentioned` card whose citation is a verbatim substring of a rescued mention quote → accepted, `source_mentioned`.
- `llm_grounded` card whose citation matches a generated bundle passage → accepted, `generated`, citation carries `passageText` and no source ids.
- Citation NOT matching any provided passage (each provenance) → rejected fail-closed.
- `llm_grounded` card citing a fabricated "source" quote not in the bundle → rejected (cannot fake verbatim).
- Node with no usable grounding passages → rejected before generation, `RejectedCard.reason` set.
- Determinism: same layer + same canned responses → same accepted/rejected partition.

**Verification.** Application tests green; a dry run over a real enrichment shows cards for anchor, `source_mentioned`, and `llm_grounded` nodes with correct provenance (inspected in U6).

---

### U3. Wire the loop onto `derived_node_id` and delete the conceptId resolver

**Goal.** Synthetic prefill, calibration, measurement, mastery folding, and resubmit all operate on `derived_node_id`; the dual-id resolver is gone.

**Requirements.** R4–R6, R11, R14–R16; AGENTS rule 18 (delete superseded path).

**Dependencies.** U1, U2.

**Files.**
- `packages/application/src/responseLogLearnerState.ts` — fold the Response Log into `mastery(derivedNodeId)` directly; remove `conceptToNodeResolver`.
- `packages/application/src/syntheticResponses.ts`, `calibration.ts`, `measurement.ts` — read the card and write response rows by `derived_node_id`.
- `apps/admin-lab/src/lib/learnerLoop.ts` — `getLearnerLoopDetail` JOINs `derived_graph_nodes` (not `concepts`) for labels; `detectConflicts` keys on `derived_node_id`; `resubmitAndRecompute` drops the `nodeByConcept` bridge.
- `apps/kg-worker/src/knowledgeGraphWorker.ts` — `generate-card-bank` takes `<enrichmentId>`; bump `CARD_BANK_CONFIG_HASH` to `card-bank-v2`.

**Approach.** Because U1 removed `concept_id` from the loop tables, the resolver has nothing to resolve — deletion is mandatory, not optional cleanup (AGENTS rule 18). The mastery estimator and projection already think in node ids (`adaptivePathProjection.ts`, `computeLearnerPath.ts`), so this unit mostly removes the translation layer and updates the two SQL JOINs.

**Patterns to follow.** Keep `responseLogLearnerState` pure; keep the append-only response store surface (`ResponseLogStorePort`) unchanged in shape.

**Test scenarios.**
- `gradeAndAppend` for an enrichment-node card writes a `graded` row keyed by `derived_node_id` and reads back.
- Mastery folds graded-over-self-report by `derived_node_id` (existing recency/conflict rules, now node-keyed). Covers R11.
- `detectConflicts` flags a `claimed_known_but_failed` conflict on an enrichment node. Covers R16.
- `resubmitAndRecompute` over a path whose target is an enrichment node recomputes without the resolver. Covers AE5.
- Regression: anchor-node calibration/measurement still append and fold correctly.

**Verification.** Application tests green; `grep` confirms no remaining `conceptToNodeResolver` / `nodeByConcept` references.

---

### U4. Admin Lab card-coverage surface with provenance badges and the no-card fallback

**Goal.** For each learner path, show every frontier step's recall-testability: a provenance-badged card, or an explicit "not directly recall-tested yet" treatment.

**Requirements.** R15, TODO #4 (UI fallback), AGENTS rules 12, 15.

**Dependencies.** U1–U3.

**Files.**
- `apps/admin-lab/src/lib/learnerLoop.ts` — extend `getLearnerLoopDetail` (or add `getPathCardCoverage`) to return, per path step: `{ derivedNodeId, label, groundingOrigin, card?: {question, provenance}, fallbackReason? }`, joining `cards` on `derived_node_id`. Drop the `notFound()` on zero responses so a path with untested frontier still renders.
- `apps/admin-lab/src/components/LearnerLoopReview.tsx` — render a path-coverage section: provenance `Badge` per step (`CEP` / `source-mention` / `generated`) and the fallback row for nodes without a card.
- `apps/admin-lab/src/app/admin/lab/learner-loop/[learnerStateRef]/page.tsx` — pass coverage through; guard empty state.

**Approach.** Reuse shadcn `Badge`/`Table`/`Empty` already imported. The coverage computation is a pure join of path steps to cards; the component is presentational. Generated cards are visibly labelled so an operator never mistakes generated grounding for a source quote (echoes the citation-exactness labelling concern in `TODO.md` #3). Read-only — no graph or derived-layer mutation (AGENTS rule 12).

**Patterns to follow.** `apps/admin-lab/src/lib/learnerLoop.ts` `withClient` read loaders; existing `LearnerLoopReview` table/badge usage; `.agents/skills/shadcn/SKILL.md`.

**Test scenarios.**
- Coverage mapping: a path with one anchor (card), one `source_mentioned` (card), one `llm_grounded` (card), one `llm_grounded` with no card → returns three badged steps + one fallback step with a reason. (Pure function over fixture rows.)
- A learner with a path but zero responses renders the coverage view (no `notFound`).
- Badge text matches provenance for each kind.
- `Test expectation: presentational component` — assert the loader/coverage function; the JSX is exercised by the loader test fixtures, not snapshot-asserted.

**Verification.** `pnpm --filter @lrnki/admin-lab build` (or typecheck); manual Admin Lab screenshot in U6 shows badges + fallback.

---

### U5. Docs, ADR, and roadmap

**Goal.** Record the durable decision and update living docs.

**Requirements.** Plan-process rules (`docs/plans/README.md`); AGENTS rule 18 (no stale parallel docs).

**Dependencies.** U1–U4.

**Files.**
- `docs/adr/0025-card-bank-over-derived-graph-layer.md` (new) — decision: the Card Bank is keyed to the Derived Graph Layer node identity; per-provenance grounding (`source_cep` / `source_mentioned` / `generated`); generated cards verified against the generated bundle, never source-verbatim. Policy-level only.
- `docs/adr/README.md` — link ADR-0025.
- `CONTEXT.md` — update the Card Bank / Learner Path language to "keyed to the Derived Graph Layer node," if a glossary entry exists; add `grounding provenance` if material.
- `docs/plans/TODO.md` — move #4 to COMPLETED after U6; note #5 unblocked; refresh VALIDATION.
- `docs/plans/README.md` — archive this plan after completion.

**Approach.** One durable decision per ADR; no implementation detail. Keep the TODO to its three sections.

**Test scenarios.** `Test expectation: none — docs only.`

**Verification.** ADR linked; TODO reflects the new state; no doc claims cards are concept-keyed.

---

### U6. Rule-14 real-use quality evaluation

**Goal.** Establish that the end-to-end loop now teaches enrichment-only frontier nodes, with honest provenance.

**Requirements.** AGENTS rules 13, 14; `.agents/skills/real-use-quality-evaluation/SKILL.md`.

**Dependencies.** U1–U5.

**Files.**
- `tmp/2026-06-19-teachable-enrichment-cards/` (gitignored) — evaluation notes + artifacts (AGENTS rule 10).

**Approach (evaluation loop).** Reset the dev DB; reuse or rebuild a mixed-domain graph version + enrichment with real LiteLLM calls (the loop needs a Derived Graph Layer with both `source_mentioned` and `llm_grounded` nodes — confirm presence first). Run `generate-card-bank <enrichmentId>` with real calls. Seed synthetic learners whose adaptive paths reach an enrichment-only frontier node. Inspect:
- a `source_mentioned` card and an `llm_grounded` card — is each grounded, answerable, and correctly provenance-labelled?
- the generated-card citations — do they trace to the generated bundle (not a faked source quote)?
- the Admin Lab coverage view — are badges correct and does the fallback fire only where no verifiable card exists?
- the response log — do enrichment-node rows append and fold into mastery?

Classify PASS / FIX_FIRST / EXPERIMENT_ONLY / BLOCKED and record evidence (representative good output + defects). Expected ceiling: `EXPERIMENT_ONLY` (uncalibrated learner model). Generated cards are scaffolding for retrieval-upgrade later (Generated Grounding Bundle contract) — state that caveat.

**Test scenarios.** `Test expectation: none — real-use inspection, not automated tests (AGENTS rule 11).`

**Verification.** Evaluation note written with the required SKILL fields; defects that are FIX_FIRST are fixed before claiming completion.

---

## Risks & Mitigations

- **Schema re-key is wide.** Dropping `concept_id` from `cards`/`response_log` touches stores, loop logic, and the JSON_TABLE view at once. *Mitigation:* it is one cohesive migration (greenfield, single migration, hard reset — AGENTS rules 1, 8, 9); U1 lands the schema+types first and is independently testable before generation/loop wiring.
- **Generated cards could masquerade as source-grounded.** *Mitigation:* KTD2/KTD3 make provenance a typed, schema-enforced discriminator; the generated path physically cannot carry source ids, and the UI labels it.
- **Thin grounding yields weak cards.** Some `llm_grounded` bundles or sparse mentions may produce low-value cards. *Mitigation:* do not patch per-fixture (AGENTS rule 17); record as a run-scoped quality caveat in U6; the fallback treatment covers nodes that yield no verifiable card at all.
- **Per-enrichment node identity is ephemeral.** Re-enrichment mints new `derived_node_id`s, so a learner's response history binds to one enrichment. *Mitigation:* acceptable at `EXPERIMENT_ONLY` (each eval is a fresh enrichment + fresh synthetic learners); a stable learnable-node identity is deferred (Open Questions, consistent with ADR-0014).

---

## Open Questions

- **Stable cross-enrichment node identity (deferred).** When real learners arrive, response history should survive re-enrichment. The anchor `concept_id` survives; an enrichment node has no stable cross-enrichment id. Resolve when learner modelling is de-deferred (ADR-0014) — out of scope here, recorded so it is not forgotten.
- **One card vs. several per node (origin Outstanding Question).** This plan keeps one card per node (current behavior). Multiple cards per node is a later enrichment, not required for teachability.

---

## Verification Strategy

- Per-unit deterministic tests as enumerated (envelope only — schema/CHECK constraints, provenance-aware verification, mastery folding, coverage mapping; AGENTS rule 11).
- `scripts/reset-db.sh` applies the single migration via `psql` cleanly.
- U6 rule-14 real-use run is the quality gate; a green suite is never reported as quality evidence (AGENTS rule 11/14).
