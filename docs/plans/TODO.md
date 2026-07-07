# TODO

## TODO

1. **Calibrate the knowledge-boundary probe so the `boundary`/`uncertain` route actually fires.** The
   synthetic arm's real-use gate scored **0 `boundary` verdicts across 38 concepts** spanning
   textbook (Photosynthesis, Quantum error correction) to frontier (Mechanistic interpretability): the
   shipped default K / temperature / agreement threshold never routed a real concept to `boundary`, so
   the boundary disposition is exercised by unit tests only. Measure-first: probe deliberately fringe or
   contested concepts, inspect the K-draw semantic dispersion, and tune temperature/threshold (or
   confirm the concepts are genuinely core knowledge) before any `web_grounded` retrieval plan or
   source-less lesson gating depends on this seam. Decision:
   [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

2. **Use corrected bottleneck reports for the next latency/cost improvement.** The corrected
   metering pass made Study Item Bank stage cost trustworthy and showed bounded per-node concurrency
   can reduce wall-clock without changing cost ownership. The next optimization pass should start
   from the latest ranked report, target the measured largest contributor, and record wall-clock,
   calls, tokens, cost, and inspected real-use output before changing prompts, models, batching, or
   cache-token reporting. Current evidence points at enrichment/prerequisite-ordering as the next
   wall-clock candidate after Study Item Bank concurrency.
   Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md). Validation trail:
   `tmp/2026-06-30-generation-metering/`.

## COMPLETED

- **Admin run visibility and Learner App UX polish.** Operations page groups running/stalled
  operations in an always-first Active section with `N running · M stalled · K failed` header chips
  and auto-refreshes while any run is active (shared `AutoRefresh` replaces the learner-only
  component). The journey and bottleneck report routes are folded into the Operations page as inline
  per-card panels driven by `?report`/`?type`/`?journey` search params (both standalone routes
  deleted); the Run Inspector list is merged into Source Explorer as a per-source "Extraction runs"
  table (run *detail* retained under the Sources sidebar section, list route + sidebar entry
  deleted, `SourceInspection` gained a `runs` field, `listRunSummaries` port method removed).
  Learner fixes: `ActivitySheet` clears its in-sheet advance memory on close (extracted to a tested
  `advanceMemory` helper) so re-opening an earlier stop opens that stop; generating card reads
  "Planning progress" (dead `progress` vocabulary key deleted); the expedition H1 is the learner's
  topic with the derived summit demoted to a secondary line; crystal contrast raised via same-hue
  hairlines, higher silhouette opacity, and a dark vista rock-face panel (geometry untouched); the
  journal palette maps onto the shadcn semantic tokens inside the learner scope (portaled
  sheets/dialogs/popovers carry `learn-theme`), admin lab stays stock; and Crystal Vista crystals
  are tappable to reveal a floating concept-name chip (mastered/known-ghost only, view-only per
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)).

- **Generation queue reliability, probe routing, and queued-state UX.** Expedition generation now
  runs bounded-parallel (cap 2) behind the DB-claim seam with a visible Queued card, a single
  staleness predicate shared by claim and fail, operation-id fencing with a 30s heartbeat, a unified
  transient-vs-terminal error classification (network/5xx/429/timeout release the claim to the
  attempt budget; schema/no-concept failures fail immediately), a `failed`-only `resetGeneration`
  guard, and a shared transport retry helper/dispatcher. Header/body timeouts are terminal at the
  transport. The knowledge-boundary probe alias deny-lists Google (Vertex 400s on forced
  tool_choice) and gains a LiteLLM ordered fallback to a small cross-family model
  (`qwen/qwen3-30b-a3b-instruct-2507`) so a sustained Groq rate-limit no longer stalls generation.
  Decisions: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) and
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

- **Expedition planning durability and entry UX.** Topic-expedition generation now starts as a
  durable learner expedition row and is completed by the Admin Lab supervisor through claimed
  `generating` work, stale-operation relaunch, bounded failure, and manual retry. `/learn` uses a
  one-step Plan expedition dialog with example chips, one themed Scouting progress surface, immediate
  return after submit, and Begin/Resume labels that account for lesson reads as well as answered
  items. LiteLLM transport now uses an undici dispatcher with the production 300s header timeout, and
  synthetic generation infers Declared Domain during generation instead of requiring it at entry.
  Decisions: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md), and
  [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md).

- **Growing crystals and Crystal Vista.** Per-concept procedural growing crystals now replace the
  gem icon across the learner trail, with deterministic crystal geometry, facet-by-facet growth for
  mastered activity segments, skipped-known ghost crystals, section-divider and overview strips, and
  mastery reveal animation. The Crystal Vista gives a view-only bedrock-up formation for the
  expedition and opens from the header tally or section-completion celebration. Accepted framing:
  [2026-07-06 brainstorm](../brainstorms/2026-07-06-growing-crystals-and-vista-requirements.md).
  Decision: [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App UX polish pass.** The learner entry and expedition flow now use static `/learn` and
  `/learn/expedition/{enrichmentId}` URLs with an httpOnly learner-ref cookie set by
  `/learn/session`, plus a Switch explorer control. The expedition entry uses Begin/Resume labels,
  domain-eyebrow candidate cards, and a shadcn Dialog for one-step "Plan expedition" topic creation
  with server-side Declared Domain inference. Generation cards show fixed-denominator `k / N`
  Surveying progress. Known-skipped concepts can be unmarked, render as "Known ground" ghost
  crystals, stay complete for gating, and are excluded from collected-crystal tallies and Crystal
  Vista growth. Matching activities now keep 3/4 matched pairs locked and incomplete until the final
  pair, with completed pair styling distinct from ordinary primary buttons. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Dedicated Rescued-Node Canonical Labeling step.** The rescued-node concept re-label is now a
  dedicated measured step instead of an under-attended optional field on the rescue durability
  judge. A new `RescuedNodeLabelingPort` runs one whole-set forced-tool call per Declared Domain
  (on `kg-independent-judge`, `rescued-node-labeling` stage tag) over the domain's *durable*
  rescued nodes, unconditionally returning a concept-shaped label for each (which may equal the
  current one), number-cited and position-mapped fail-open. The durability judge's
  `canonicalLabelProposal` field is deleted end-to-end (type, validator, prompt, application
  surfacing, tests). Minting keeps the single adoption authority — the collision guard against the
  domain's taken labels, alias demotion, reservation, and `relabeledFrom` recording are unchanged.
  No migration and no `litellm` config change. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Adaptive sectioned expedition trail and game-honesty pass.** The Study Session projection is now
  layer-wide and sectioned: milestone-anchored sections over the whole floored Derived Graph Layer,
  ordered easiest-first, with the summit derived at read time (the last section's milestone). The
  persisted expedition target column and its ready CHECK are deleted; expeditions generate/ensure and
  offer one Begin candidate per enrichment, and every learner-facing count derives from the shared
  trail scope. A node masters only when its lesson is read and every activity segment is
  latest-correct (one rule for gating, gem, and per-stop visuals). The learner trail renders sections
  with a non-blocking on-demand overview (prerequisite-gated jumping), matching is two-column
  tap-pairs, key terms are deleted end-to-end (generation, schema, types, render), and rescued
  `source_mentioned` nodes adopt a concept-shaped canonical label from the durability judge (original
  demoted to an alias, fail-open on collision). Terminology folded into
  [CONTEXT.md](../../CONTEXT.md) (Study Session, Expedition Section). Decisions:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) and
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md) (target exemption removed).

- **Learner theory quality, sparse item blueprint, and game-flow polish.** Concept Lessons carry
  list-structured examples/applications (key-term highlighting was later deleted end-to-end); a
  cross-family redundancy judge retries then
  drops redundant non-substantive sections; the lesson minimum is one substantive section; Study
  Item Blueprint generation has a structural sparse pre-gate; itemless lesson nodes master through
  lesson reads; and the Learner App remembers the learner name, uses a mobile-first matching layout,
  and routes through the capstone reward before advancing. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Comparative banded intrinsic difficulty and trail floor.** Intrinsic difficulty is now a
  K-sampled comparative in-set banded prior: one forced-tool call per Declared Domain bands every
  concept 1–5 relative to that domain's set, dispersion marks contested bands, and a bounded
  pairwise bracket against uncontested anchors calibrates them. The pointwise absolute judge, the
  neural+structural fusion, and `dagDepthDifficulty` were deleted; the persisted score is
  `(band − 1)/4`, the exact inverse of the diamond mapping, so the learner UI is unchanged. The
  Study Session projection now floors confident band-1 non-target nodes out of the trail via edge
  contraction (gating preserved), exposing `flooredNodeIds` for inspection. Decision:
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md) (amended).

- **Learner trail polish.** The learner trail now uses opaque portal surfaces, one-tap option-select
  grading with generated explanations, persisted lesson-read completion, a linear next-pointer,
  type-stable stop icons, gem-only capstone state, expedition domain/progress rows, and no Journal
  route. Study-item generation and validation require option-select explanations, Study Session
  projections expose lesson-read and explanation state, and learner expedition rows compute live
  item progress from the study bank and latest responses. Requirements:
  [brainstorm](../brainstorms/2026-07-04-learner-trail-polish-requirements.md). Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## VALIDATION

- **Admin run visibility and Learner App UX polish, 2026-07-06.** Deterministic envelope: workspace
  `typecheck` exit 0 (stale `.next/types` cleared for the deleted routes); recursive `test` exit 0
  with `.env` loaded (admin-lab 122, incl. new `advanceMemory` stale-stop regression + vista
  `labelChipFor`/`isNameableCrystal` tests); `lint` 0 errors (6 pre-existing warnings); production
  build exit 0 with `/admin/lab/runs`, `/operations/bottleneck`, `/operations/journey` gone from the
  route list. **Real-use gate (rule 14): PASS.** 390px + desktop browser pass: Operations page shows
  Active (5) first with "5 running · 3 stalled · 137 failed" chips and a `stalled?` badge, re-polls
  live without reload, and renders bottleneck/journey reports inline on their card; deleted routes
  404; Sources shows a per-source Extraction runs table opening the retained run detail; re-clicking
  an advanced-from stop reopens that stop; a live generating card reads "Planning progress 8 / 11";
  the header H1 is "Bayesian statistics" with "Summit: Markov chain Monte Carlo" demoted; crystals
  render on a dark vista rock face with hairline-outlined shards; learner buttons are trail-green
  (themed tokens); tapping the known-ghost "Ownership" crystal shows its name chip and toggles off.
  Evidence: `tmp/2026-07-06-admin-learner-polish-gate/` (screenshots + `evidence.md`). Caveat: the
  vista chip check used a DB-seeded `known` verdict because the automated skip-known click did not
  persist for that node; the skip-known flow itself is unchanged by this pass.

- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output. Older validation trails live in git history and generated artifacts
  under `tmp/`.
