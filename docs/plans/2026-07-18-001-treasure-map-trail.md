# Treasure-Map Trail Restyle

Status: Ready (2026-07-18). Interview-locked with the user; recommended answers applied to the
remaining branches by user instruction.

The Expedition trail screen becomes one **explorer's field-chart**: a parchment map artifact with a
hand-drawn, progressively inked route, ink-marker checkpoints, region cartouches, uncharted fog, and
sparse deterministic margin decoration. Pure presentation — zero API, projection, persistence, or
copy change.

Governing policy: [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
(game UX, motion, reduced motion, gold-is-earned-only, no-color-alone),
[ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md) (theme stays
downstream), [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) (universal Expo
app), [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md) (native gate
scope). Trail structure and state semantics come unchanged from the Study Session projection
(`buildTrailView`).

## Interview-locked decisions (do not re-ask)

- **KTD1 — Scope: trail screen only.** `CheckpointPath` and its in-trail pieces (route, checkpoints,
  section banners, guardian nodes, support-path nodes, terminus, fog) plus a `QuestHeader` trim so
  the screen reads as one artifact. Journal/catalog, Crystal Vista, Guardian fight, ActivitySheet,
  and the SectionOverview sheet content are OUT of scope.
- **KTD2 — Direction: explorer's field-chart (mid-weight).** One continuous map artifact; no full
  illustration, no per-topic art. Concept/Guardian/Support panels keep their structure and
  interactions and are restyled to sit on parchment.
- **KTD3 — Technique: procedural seeded SVG only.** A pure, jest-testable layout module generates
  all decoration deterministically, seeded by `enrichmentId` (a learner's map always looks the
  same). NO SVG filters (`feTurbulence` etc. — unsupported by react-native-svg on Android); fine
  grain uses one SVG `<Pattern>` tile. No raster/binary assets.
- **KTD4 — Typography: one bundled display font, map headings only.**
  `@expo-google-fonts/im-fell-english` loaded via `expo-font`, exposed through the app-owned `Text`
  boundary as a new variant, applied ONLY to map-surface headings (cartouche titles, terminus,
  QuestHeader expedition title). Body/interaction text keeps the current face.
- **KTD5 — Route: progressive inking, no route motion.** Segments through the last completed stop
  render as solid hand-drawn ink; segments ahead stay faint irregular dashes — a shape distinction,
  never color alone, never gold. No animated line-drawing; the mastery beat stays on the capstone.
- **KTD6 — Markers: checkpoints stay circles; X is reserved for the terminus.** The 72/64 px
  pressable circles, icon set, next-stop halo, testIDs, and capstone `CrystalSpecimen` all survive;
  only surface styling changes to ink-ring-on-parchment. "X marks the summit" appears exactly once,
  at the terminus cartouche.
- **KTD7 — Fog: uncharted parchment.** Fogged stops/legs read as not-yet-charted map (faded ink +
  hatched/blank treatment) instead of plain opacity dimming. Per-stop dimming semantics, lock
  behavior, and the existing text labels are unchanged (state = shape + text, WCAG F73).
- **KTD8 — Decoration is nonsemantic and bounded.** Sparse margin doodles (compass rose near the
  map top, contour lines, tiny peaks) placed only in the margins, density bounded per section,
  seeded, and never positioned so they could read as graph structure, edges, or progress
  (ADR-0032: the trail renders no invented structure).
- **KTD9 — No copy change.** `vocabulary.ts` is untouched; ADR-0033 makes this a purely visual
  change. Gold remains exclusively earned-reward ink.

## Requirements

- **R1** The trail screen reads as one parchment map artifact at phone and desktop widths: map
  ground with aged tone, subtle grain, and an edge/border treatment behind the whole trail column.
- **R2** The route is one continuous hand-drawn line through every measured checkpoint center
  (existing anchor machinery), solid ink behind the learner, faint dashes ahead (KTD5).
- **R3** Checkpoints, section banners, guardian nodes, support-path nodes, concept markers, and the
  terminus are restyled per KTD6–KTD7 with zero behavioral, layout-measurement, or testID change.
- **R4** All new colors are semantic tokens in `ui/tokens.js` with contrast assertions extended in
  `tokens.test.ts` (text ink on parchment ≥ 4.5:1; interactive boundaries ≥ 3:1 on their surface).
  Literal color values only — never Tailwind opacity modifiers that compile to `color-mix()` (the
  native styler drops them; the scrim token documents this precedent).
- **R5** Decoration cost is bounded: element count O(stops + sections), one `<Pattern>` tile for
  grain, one absolute SVG ground layer, `pointerEvents="none"`. A long real expedition (≥ 15 Legs)
  must scroll without jank at phone size.
- **R6** No new motion anywhere. Existing event-bound motions (halo swell, ready reveal, header
  pulse) and the reduced-motion policy are untouched.
- **R7** Web and Android render the same design: no SVG filters, no platform-forked styling beyond
  what already exists. The maestro flow's trail steps still pass on the e2e APK.
- **R8** Deterministic envelope stays green with tests updated in the same change (rule 18): the
  existing `CheckpointPath`/`CheckpointCircle`/`QuestHeader`/tokens suites assert the new
  presentation, and superseded styling constants are deleted, not shadowed.

## Design

### New tokens (`apps/learner-app/src/ui/tokens.js`)

`map-parchment` (ground wash, slightly deeper than `background`), `map-parchment-deep`
(edge/vignette + uncharted wash), `map-ink` (dark sepia line/text ink), `map-ink-soft` (faded
future-route/doodle ink). Exact values tuned during U1 against the contrast assertions. Existing
tokens keep their roles: `gold` earned-only, `gem` mastery, `frontier` guidance.

### Typography

- Dependency: `@expo-google-fonts/im-fell-english` (+ `expo-font` if not already present).
- `_layout.tsx` loads the font inside the existing bootstrap gate (font readiness joins the
  `hydrated` state; the visible `RouteStatus` bootstrap frame already covers the wait).
- `foundation.tsx` gains `TextVariant "map-title"` whose class/style applies the display family;
  jest mocks `expo-font` (`useFonts` → loaded) in the existing setup file.

### New pure module: `apps/learner-app/src/learn/treasureMap.ts`

Follows the `mineralSpecimen.ts`/`crystalFormationLayout.ts` idiom — pure, deterministic,
jest-tested, consumed by dumb SVG components. Given `(seed: enrichmentId, containerWidth,
sectionAnchors, stopAnchors)` it returns:

- route jitter: small perpendicular offsets for inserted midpoints between consecutive stop
  anchors, plus an irregular dash rhythm (bounded amplitude so the line always passes through the
  measured circle centers);
- grain-tile parameters and edge-weathering path for the ground layer;
- doodle placements: compass rose near the top, contour/peak glyphs in the side margins only
  (center column exclusion zone), count capped per section.

Tests: same seed → identical output; different seeds diverge; every doodle lands inside a margin
band; caps hold on the 17-Leg-scale fixture shape.

### Components (`apps/learner-app/src/components/`)

- **`MapGround` (new, rendered inside `CheckpointPath`'s measured container):** one absolute
  `pointerEvents="none"` SVG under the route — parchment wash, `<Pattern>` grain, edge border,
  doodles, compass rose.
- **`TrailWave` → `TrailRoute` (replaced in place, rule 18):** keeps the measured-anchor bezier
  skeleton and the container-resize re-measure exactly as shipped (incl. the `useIsFocused`
  arrival gating around it — untouched); splits the path at the first incomplete stop; draws the
  behind portion as a solid `map-ink` stroke with seeded jitter and the ahead portion as
  `map-ink-soft` irregular dashes. Old uniform-dash constants deleted.
- **`CheckpointCircle`:** box classes move to ink-on-parchment (ink ring, parchment fill;
  complete keeps the gem fill language; locked adopts the uncharted treatment). Sizes, halo,
  icons, `CrystalSpecimen` capstone, haptics, and `checkpoint-{kind}-{state}` testIDs unchanged.
- **`SectionDivider`:** restyled as a region cartouche — double-rule ink border, `map-title` Leg
  heading, existing `Progress` bar and copy unchanged.
- **`TrailTerminus`:** "X marks the summit" cartouche — a small drawn SVG X + peak glyph with the
  existing summit/remaining copy; reached vs not-reached stays a text + shape distinction.
- **`ConceptMarker`, `GuardianTrailNode`, `SupportPathNode`:** surface-class restyle only
  (parchment panel + ink border); structure, actions, and testIDs untouched.
- **`QuestHeader`:** `map-title` variant on the expedition title plus parchment surface tones.
  `SectionOverview` trigger/content untouched.
- **Fog (KTD7):** `CheckpointStopRow`'s flat `opacity-55` is replaced by the uncharted treatment
  (faded ink + `map-parchment-deep` wash / hatch), same per-stop granularity.

## Implementation units

- **U1 — Tokens + typography foundation.** New map tokens with extended contrast assertions; font
  dependency, bootstrap loading, `map-title` variant + jest mock; `QuestHeader` trim adopting
  both. Acceptance: tokens suite green with new pairs; header renders display title on both
  runtimes; no other surface changes appearance.
- **U2 — Map ground + progressive route.** `treasureMap.ts` + tests; `MapGround`; `TrailRoute`
  replacing `TrailWave` (superseded constants deleted). Acceptance: route passes through every
  measured center with jitter bounded; solid/dashed split lands at the first incomplete stop;
  decoration bounded and margin-only; `CheckpointPath` suite (incl. the focus regression) green.
- **U3 — Trail furniture restyle.** `CheckpointCircle`, `SectionDivider` cartouche,
  `TrailTerminus` X-cartouche, uncharted fog, panel restyles on `ConceptMarker` /
  `GuardianTrailNode` / `SupportPathNode`. Acceptance: all component suites updated + green; every
  state remains distinguishable by shape + text; no testID or interaction change.
- **U4 — Verification gate + fold.** Full deterministic envelope; then the rule-14 real-use gate
  (below). On PASS: amend ADR-0032 with a short "Trail map presentation" paragraph (field-chart
  language, procedural/deterministic/nonsemantic decoration, display-font restriction, progressive
  inking, gold untouched), then delete this plan and record the outcome in `TODO.md`.

## Validation contract

- **Deterministic envelope:** workspace typecheck, full `pnpm test` (learner-app suites updated in
  U1–U3), lint, `pnpm build`, intercepted `pnpm e2e:web` — all green.
- **Rule-14 real-use gate (U4):** production Expo web export against the real learner-api +
  Postgres (no interception), driven in Chromium on one long (≥ 15 Legs if available, else the
  largest real expedition) and one short real expedition, at phone 390×844, desktop 1280×800,
  reduced motion, and 200% page scale. Human screenshot judgment per
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md)/[ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md):
  the screen reads as one map artifact; the route passes through every marker; the inked/dashed
  split matches progress; uncharted legs read as uncharted; no horizontal overflow; no doodle
  collides with content or implies structure; gold appears only on earned rewards. Zero
  console/page errors.
- **Native regression:** `pnpm e2e:native:maestro` on a fresh e2e APK (the flow already traverses
  the trail and the ADOPTED Support Path dialog scenario); plus a screenshot of the trail from the
  emulator to confirm web/native visual parity of ground, route, and markers.
- Evidence directory: `tmp/2026-07-18-treasure-map-trail/`.

## Out of scope

Journal/catalog and entry surfaces, Crystal Vista and the Crystal Formation contract, Guardian
fight, ActivitySheet internals, SectionOverview sheet content, vocabulary/copy, iOS, dark mode,
any API/projection/persistence change, route/reward motion.
