---
title: Crystal Formation Minimal Redesign - Plan
type: feat
date: 2026-07-16
execution: code
---

# Crystal Formation Minimal Redesign - Plan

## Goal Capsule

- **Objective:** Rebuild the Crystal Formation's visual language into a minimal, calm composition —
  a curated difficulty-tiered mineral library at hero size inside compact single-outline geode
  islands on a quiet ascent — while preserving every reward-presentation invariant ADR-0032 fixed
  on 2026-07-15 (event-bound rewards, no replay, honest states/counts, reduced motion, never
  auto-open). This is a pure downstream presentation change: zero API, projection, or persisted
  shape changes.
- **Authority:** Follow [CONTEXT.md](../../CONTEXT.md),
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (amended by
  U4 of this plan), [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md),
  [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md),
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md), and AGENTS rules 14, 15,
  18, and 22.
- **Execution profile:** Learner-app-only rewrite of the three formation modules
  (`apps/learner-app/src/learn/mineralSpecimen.ts`, `learn/crystalFormationLayout.ts`, and the
  scene components `CrystalSpecimen` / `LegFormationScene` / `CrystalFormationScene` /
  `CrystalVista` plus the `ActivitySheet` / `GuardianReward` composition points). The formation
  keeps reading the same `StudySession` + `TrailView` every other surface reads.
- **Stop conditions:** Stop and re-plan before touching the learner API, projections, Recall
  Challenge grading/lifecycle, persisted shapes, or any learner-state addition beyond the existing
  `navMemory` seen-bindings; before encoding any *learner-specific* signal (retries, correctness)
  into specimen appearance — species reads ADR-0024 intrinsic difficulty only; and before
  reintroducing any deleted line language (veins, seam, branch, nested bands) "for polish".
- **Scheduling:** Executes AFTER plan
  [2026-07-16-001](./2026-07-16-001-feat-scaffold-content-quality-audit-plan.md) finishes its U5
  (user decision 2026-07-16).
- **Tail ownership:** Ship U1–U3, amend ADR-0032 + vocabulary (U4), pass the rule-14 gate (U5),
  fold status into `TODO.md`, and delete this plan.

## Problem framing (owned here)

The 2026-07-15 formation shipped functionally correct but visually scrambled and noisy (user
report 2026-07-16; confirmed against the U6 gate screenshots under
`tmp/2026-07-15-crystal-formation-reward-ux/`). Five structural causes:

1. **Six competing line languages in one scene** — triple nested matrix contour bands, dashed
   seam, zigzag spine, a second zigzag embedded branch, dotted prerequisite veins, and crystal
   facet strokes, each with its own dash/width/color.
2. **Sharp 3–4-point polylines** for the "winding" spine and branch read as scribbles and visibly
   strike through island borders.
3. **Sphere-Grid scatter** (reused from the navigable trail map) makes each Leg a large
   mostly-empty panel with tiny 48-px crystals — high ink, low content.
4. **Floating label cards overlap the artwork** and each other (the top Leg's progress line clips
   behind the contextualization banner).
5. **Five simultaneous accent hues** on the scene while the minerals themselves are procedurally
   generated near-identical teal blocks with no story to tell.

The fix is structural, not stylistic: replace runtime procedural generation with a curated
mineral library, replace scatter with compact packing, and cut the scene to one outline + one
badge + one curve.

## Locked design ledger (user decisions 2026-07-16 — do not re-ask)

- **D1 — Curated tiered mineral library:** three checked-in, hand-authored real-mineral
  silhouettes (flat stylization, 2–3 facet planes + gloss, static polygon data in TS — never
  image assets, never runtime PRNG geometry). Species = intrinsic difficulty tier via the
  existing exported `difficultyBand(score)` (`packages/application/src/weeklyLeaderboard.ts`):
  bands 1–2 → quartz, 3–4 → amethyst, 5 → diamond (ties already break low upstream, so diamonds
  stay scarce). Progression = one visual variable: ghost outline → fill rises with
  `growthFraction` → full color + gloss when collected. Tiny deterministic per-concept variation
  (mirror/scale from the existing `hashSeed`/`mulberry32`) so repeats don't look stamped.
- **D2 — Composition "quiet geode ascent":** keep ADR-0032's structure (per-Leg islands, one
  nonsemantic spine, distinct summit terminus) with ONE smooth organic outline per island;
  nested bands, contour jitter noise, seam, embedded branch, and prerequisite veins all deleted.
- **D3 — Center-out mound packing:** milestone specimen center-front at 1.25×, remaining
  concepts fill outward left/right in trail order, wrapping to a raised back row; row capacity
  derives from available canvas width, so an island can never exceed the viewport (the
  scale-floor + horizontal-overflow machinery dies).
- **D4 — State = rim + junction badge:** outline dashed muted (future, ghost slots) → solid
  neutral (collecting) → solid accent + guardian-glyph badge (guardian_ready) → solid gold +
  gold seal badge (bound). Honest guardian substate copy stays in the header. Badge gives a
  shape (not color-only) distinction.
- **D5 — Ascent/spine:** islands alternate a small (~24 px) lateral offset; the spine is ONE
  continuous smooth curve through every junction badge, thin (~2.5 px) and muted, drawn behind
  the islands; per-Leg segments render gold when bound.
- **D6 — Summit = peak + keystone:** a small distinct mountain-peak silhouette ends the ascent;
  its apex holds the keystone slot — dashed empty diamond until the Expedition Guardian falls,
  gold faceted keystone after. Vocabulary converges on **keystone** (CONTEXT.md already says
  keystone; ADR-0032's and `vocabulary.ts`'s "crown" wording is renamed).
- **D7 — Palette:** scene chrome goes fully neutral; tier tints are quartz = existing
  `--journal-gem` teal, amethyst = muted violet, diamond = pale ice-blue with the strongest
  gloss; **gold is reserved exclusively for earned rewards** (seals, lit spine, keystone). Tints
  join the single token source (AGENTS rule on one token source; no duplicate values).
- **D8 — Reward moments, whole island:** collection frames the whole compact island (crop-to-
  focus deleted) and ONLY the new specimen animates (fill rise + gloss pop, one mastery haptic);
  binding = seal badge scales in + rim sweeps gold once + spine segment lights (one fusion
  haptic); keystone seats with the same language at the peak (one unlock haptic). Rematch keeps
  the restrained sweep + endurance copy; reduced motion renders final states immediately. All
  existing event-identity guards (mount-local transition token, played-flag, seen-bindings)
  carry over unchanged.
- **Inline headers:** the layout allocates a header band above each island (Leg n · state copy;
  progress line) as part of the geometry, so labels can never overlap artwork or one another.

## Key Technical Decisions

- **KTD1 — Fill without SVG defs.** Partial growth renders by clipping the silhouette polygons
  against a horizontal cut line in pure code (Sutherland–Hodgman against one half-plane), not
  `<ClipPath>` defs — the existing scenes deliberately avoid defs ids (id collisions when many
  specimens share one canvas; the same reason `Highlight` is a plain polygon today). The clip
  helper lives in the pure module and is unit-tested.
- **KTD2 — Geometry stays pure and finished.** `crystalFormationLayout.ts` keeps its contract:
  no React, no store, no clock; renderers consume finished geometry (mound slot positions,
  header bands, badge anchors, one smooth spine path as sampled points, peak + keystone frame).
  Determinism tests (identical inputs ⇒ identical output regardless of input array order) carry
  over; new invariant tests: no slot overlap, island width ≤ available width, headers disjoint
  from island frames.
- **KTD3 — Structural-state derivations are untouched.** `legStructuralState`,
  `guardianSubstateFor`, `formationProgress`/`formationProgressLine`, `vistaRewardSnapshot`,
  `selectVistaFocus`, the memory door, and `navMemory` seen-bindings survive verbatim — the
  redesign changes how states LOOK, never how they are derived (`bound` still comes only from
  the durable first `wonChallengeId`).
- **KTD4 — One shared Leg scene, same three modes.** `LegFormationScene` remains the single
  visual boundary composed by capstone collection, Guardian reward, and Vista in explicit
  `overview`/`collection`/`binding` modes; only its drawing vocabulary changes (rim, badge,
  mound). `collection` now frames the whole island (D8) — `cropFor` is deleted.
- **KTD5 — Consumers inherit the library.** `CheckpointCircle` (trail capstone gem) and
  `CrystalGuardian` (fight shield) render `CrystalSpecimen` and pick up the new species
  automatically; `CrystalSpecimen`'s props change from section coordinates to `difficulty`
  (callers updated in the same change, rule 18). `MIN_SPECIMEN_PX = 40` compact-surface rule
  stays. `ConceptMarker.tsx`'s inline `round(difficulty*4)+1` is pointed at the shared
  `difficultyBand` so the difficulty→band mapping has one home.
- **KTD6 — Deletions (rule 18, same change as their replacements):** procedural facet
  generators (`quartzFacets`/`fluoriteFacets`/`calciteFacets`), facet-reveal growth
  (`visibleMineralFacets` reveal ordering), the cosmetic habit cycle (`mineralHabitFor`,
  `MINERAL_HABITS`), Sphere-Grid usage + vein routing in the formation
  (`layoutSphereGrid` import, `LegVein`, `veinsOmitted`, `crossings`), `matrixContour` jitter +
  `shrinkToward` nested bands, `seamPath`, `branchPoints`, the `BindingEvent` seam/branch
  overlay, `cropFor`, and `fitLegWidth`'s scale-floor/horizontal-overflow path. Their tests are
  deleted/rewritten in the same units.

## Implementation Units

- **U1 — Curated mineral library (pure).** Rework `learn/mineralSpecimen.ts`: three curated
  species specs (silhouette + 2–3 facet planes + gloss polygon, authored to read at 40–80 px),
  `mineralSpeciesFor(difficulty)` over the shared `difficultyBand`, the KTD1 fill-clip helper,
  deterministic micro-variation, tier tint tokens (D7) added to the single token source. Update
  `CrystalSpecimen` (ghost / filling / collected states) and its consumers (`CheckpointCircle`,
  `CrystalGuardian`, `ActivitySheet` capstone, `SectionOverview` if props shift). Unit tests:
  species mapping per band, clip correctness at 0/fractional/1, determinism.
- **U2 — Layout rewrite (pure).** Rework `learn/crystalFormationLayout.ts` per D2–D6 + KTD2:
  mound packing with width-derived row capacity, header bands, junction badge anchors,
  subtle-offset ascent, one smooth spine path, peak terminus with keystone slot; apply KTD6
  deletions. Rewrite the layout test suite (determinism, overlap-free, width-bounded, state
  derivations unchanged).
- **U3 — Scene rewrite.** `LegFormationScene` (rim + badge + mound; collection = whole-island
  fill-rise on ONLY the entering specimen; binding = badge scale-in + one gold rim sweep),
  `CrystalFormationScene` (spine curve behind islands, per-segment gold, header bands as laid
  out, focused/contextualizing emphasis on the new geometry), `TerminusScene` → peak + keystone,
  and the `ActivitySheet` / `GuardianReward` / `CrystalVista` composition points. All
  reduced-motion guards and event-identity guards preserved (Jest gotcha: learner-app roots
  render empty on a second `render()` — one render per test).
- **U4 — Docs + vocabulary.** Amend ADR-0032's "Crystal Formation reward presentation" section:
  mineral species now encodes the concept's ADR-0024 intrinsic difficulty band (a neutral fact;
  remaining variation stays cosmetic), prerequisite veins are removed from the formation (the
  formation renders NO graph edges at all; prerequisite structure stays on trail/inspection
  surfaces), seam language replaced by the junction seal, and "summit crown" → "summit
  keystone" everywhere (including `vocabulary.ts` strings and reward testids). Delete superseded
  wording in the same change; CONTEXT.md needs no change (already says keystone).
- **U5 — Rule-14 real-use gate.** Live browser (phone + desktop viewports) over a real synthetic
  expedition: all four structural states + guardian substates, collection moment, first binding,
  rematch sweep, keystone seating, one-time Vista contextualization, memory door taps on mound
  slots, reduced motion, and 200% zoom. Verify honest counts (known ghosts never counted),
  no overlapping labels at any width, specimens ≥ 40 px everywhere and hero-size (~64–80 px) in
  islands, gold appearing only on earned rewards. Evidence + evaluation note under
  `tmp/2026-07-16-crystal-formation-minimal-redesign/`. Then fold status into `TODO.md` and
  delete this plan. (Playwright notes: RNSVG hosts expose `vbWidth`/`vbHeight`, scene queries via
  `getByRole("img", { name })`; a Guardian-ready fixture needs the arrival-gate localStorage
  seed; Expo Router percent-encodes the Vista focus colon.)

## Acceptance

- One outline + at most one badge + one spine curve per scene; no seam, veins, branch, or nested
  bands anywhere; headers never overlap artwork; palette = neutrals + three tier tints + gold
  (gold only on earned rewards).
- Species tiers honestly track `difficultyBand`; ghosts (future/known) never fill and never
  count; every ADR-0032 reward invariant (event-bound, no replay on rerender/reload, rematch
  restrained, reduced-motion final states, Vista never auto-opens) demonstrably holds in U5.
- KTD6 deletions complete — no dead exports, tests, or vocabulary left behind (rule 18);
  deterministic envelope green (typecheck, lint, all suites incl. rewritten formation tests).
- U5 evidence recorded; `TODO.md` updated; plan deleted.
