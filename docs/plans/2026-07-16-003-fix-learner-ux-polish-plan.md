---
title: Learner UX Polish - Android Overlays, Reward Actions, Formation Badge, Specimen Strokes, Trail Wave - Plan
type: fix
date: 2026-07-16
execution: code
---

# Learner UX Polish - Plan

## Goal Capsule

- **Objective:** Fix five learner-facing UX defects reported 2026-07-16: (1) Android centered
  overlays render no backdrop scrim and the Board dialog opens blank from the menu, (2) the
  uncollected crystal outline is near-invisible next to the 2 px icon strokes, (3) the gold seal
  roundel is cropped at the top of the "Formation holds strong" reward card, (4) the reward
  dialog's `Explore formation` / `Continue expedition` buttons stay disabled forever after a
  rematch win, and (5) the trail's straight center line misses every winding checkpoint circle —
  replace it with a dashed sine wave that connects them. Pure downstream presentation + client
  behavior: zero API, projection, or persisted shape changes.
- **Authority:** Follow [CONTEXT.md](../../CONTEXT.md),
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md),
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md),
  [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md), and AGENTS
  rules 14, 15, 18, 21, and 22.
- **Execution profile:** Learner-app-only (`apps/learner-app`): `GuardianReward` + the guardian
  route controller, `learn/crystalFormationLayout.ts`, `CrystalSpecimen`, `CheckpointPath`,
  `ui/overlays.tsx` + `ui/tokens.js`, `app/index.tsx` menu→board handoff. U5 (Android) runs as a
  user-hosted **Android emulator + Metro dev-client loop** — this workspace has no KVM/adb, and
  the defect class is provably invisible to web gates and jest.
- **Stop conditions:** Stop and re-plan before touching the learner API, projections, Recall
  Challenge lifecycle, or persisted shapes; before adding any animation/styling dependency; and
  in U5, if the emulator loop disproves BOTH ranked hypotheses — re-diagnose on the device
  evidence rather than stacking speculative fixes.
- **Scheduling:** Next up. U1–U4 are code-first and fully verifiable here; U5 runs whenever the
  user's emulator loop is available; U6 closes.
- **Tail ownership:** Ship U1–U5, pass the rule-14 gate (U6), fold status into `TODO.md`, and
  delete this plan.

## Problem framing (owned here; root causes confirmed by code reading 2026-07-16)

1. **Reward buttons dead after a rematch (deterministic).** `GuardianRewardRoute` mounts its
   expedition query `enabled: false`, but the trail visit always leaves cached data — so the
   first render classifies `ready(rematch)` from the STALE session. `GuardianReward`'s one-shot
   effect marks `playedEventRef` and arms the settle timer; the controller's own explicit
   refetch then flips the preview to `loading`, the effect cleanup clears the timer, and when
   the refetch lands the replay guard blocks re-arming — `actionsReady` stays false forever.
   A first win escapes only because the stale cache has no `wonChallengeId` yet (it instead
   flashes a wrong `inconsistent`/Retry frame). The U6 production-web gate (46/46) missed this
   because its rematch scenario never pre-warmed the expedition cache.
2. **Gold seal cropped.** `crystalFormationLayout.ts` anchors the junction badge at `y: 6`
   while the seal roundel (radius 13 + stroke, drawn in `LegFormationScene`) spans y −7…19 —
   the layout emits geometry exceeding its own frame, and the standalone Leg scene's
   `0 0 w h` viewBox crops the overhang.
3. **Uncollected specimen contrast.** The growing outline is `strokeWidth 1.5` at 40 % opacity
   inside the 100-unit specimen viewBox: ~0.6 px at the 40 px trail capstone, scaled down again
   by mound-slot and variation transforms — beside lucide icons at a constant 2 px.
4. **Android overlays (two symptoms, two ranked hypotheses; both dialogs lack the scrim, the
   Board is blank ONLY via the menu path while the splash-mounted Board renders).**
   **H1 (scrim):** Tailwind 4.3 compiles `bg-black/40` to `color-mix(in oklab, …)`; web resolves
   it, NativeWind `5.0.0-preview.4`'s native styler drops it → transparent scrim on Android
   only. The two `bg-black/40` scrims in `ui/overlays.tsx` are the app's only
   color-with-opacity utilities. **H2 (blank board):** the menu handoff closes the `SideSheet`
   and opens the Board `Dialog` in the same tick; a Reanimated `entering` animation mounting
   during a concurrent portal teardown is a known Android failure mode that leaves content at
   its initial opacity 0 — exactly a white `bg-card` box with no text. The splash path has no
   concurrent teardown and renders.
5. **Trail line.** The straight `w-[3px]` center bar spans the trail while circles wind ±56 px
   via the discrete `WINDING_OFFSETS` table — the line visibly connects nothing.

## Locked design ledger (user decisions 2026-07-16 — do not re-ask)

- **D1 — Delete the reward action gating (chosen over fixing it).** `actionsReady`,
  `settledEventKey`, the settle timer, `rewardDuration`, and both `disabled` props are deleted;
  `Explore formation` / `Continue expedition` are always enabled. The reward choreography
  itself survives: `RewardSweep` stays keyed on `eventKey`, and `playedEventRef` remains solely
  as the one-shot guard for the first-win haptic.
- **D2 — Classify only after the route's explicit refresh.** The preview stays `loading` until
  `isFetchedAfterMount` (react-query's built-in flag) — honoring the controller's documented
  "refetch before classify" contract, killing the rematch `ready→loading→ready` flash and the
  first-win wrong-Retry flash.
- **D3 — Badge: keep the straddling-apex look; the frame must contain it.** The badge radius
  constant moves into `crystalFormationLayout.ts`, and the layout includes the ~8-unit overhang
  in the emitted island geometry (content shifted down / height grown), so every consumer —
  standalone Leg scene, reward card, full formation scene — renders the whole roundel with no
  per-component viewBox special-casing. Visual result identical except the star is whole.
- **D4 — One specimen-wide stroke policy in `CrystalSpecimen`, all three states.**
  `vectorEffect="non-scaling-stroke"` with a constant **2 px** stroke matching the icon weight
  on ghost, growing, and collected outlines, immune to size props, mound-slot scale, and
  cosmetic variation. Growing outline opacity rises 0.4 → ~0.7 (tint color kept so tiers stay
  distinguishable); ghost stays visually lighter than growing (never fills — honest known
  ground); applies everywhere the specimen renders (trail, formation scenes, Vista, Guardian
  shield) — it is one component.
- **D5 — Trail wave: measured-anchor sine path, dashed expedition feel.** One
  absolutely-positioned `Svg` behind the trail content (inside the same `relative max-w-sm`
  container) draws the true sine curve through each checkpoint circle's measured center —
  x from the winding offset, y from the existing `onLayout` registry lifted into state
  (registered as row centers, rounded to avoid render churn). Offsets become
  `AMPLITUDE(56) · sin(stopIndex · π/4)`, replacing the deleted `WINDING_OFFSETS` table, so
  circles sit exactly on the wave. Styling: `trail-muted`, ~60 % opacity, ~3 px stroke,
  dashed. The wave connects checkpoint circles only; full-width cards (banners, concept
  markers, guardian nodes, terminus) overlay it exactly as they overlay the current bar;
  Support Path branches keep their own elbow. The straight center bar is deleted.
- **D6 — Scrim: literal token, no color-mix on native.** Add `scrim: "rgba(0, 0, 0, 0.4)"` to
  the single token source (`ui/tokens.js` → generated `tokens.css`); `bg-scrim` replaces both
  `bg-black/40` scrims in `Dialog` and `SideSheet`.
- **D7 — Blank board: sequence the menu→board handoff.** The `LearnerMenuSheet` handoff yields
  a frame between closing the sheet and invoking the action (the codebase's existing
  `enterScope` pattern), so the Dialog's `entering` animation never mounts during a portal
  teardown. Fallback only if the emulator loop shows the race is broader: harden
  `OverlayEntrance` itself to fail-visible (explicit shared-value fade instead of `entering`).
  Diagnosis-first on the emulator; confirm build provenance (fresh Metro dev client) before
  trusting any symptom.
- **D8 — Tests: only what earns its keep (user directive).** (a) jest regression reproducing
  the rematch deadlock sequence (cached ready → loading → ready ⇒ buttons actionable, no
  premature classification); (b) a badge-containment assertion added to the EXISTING layout
  regression suite (badge extents ⊆ island frame across the 59-node fixture); (c) ONE new
  production-export Playwright scenario — rematch reward with a pre-warmed expedition cache
  (visit trail → enter Guardian → win → both actions actionable); (d) ONE maestro step appended
  to the checked-in native flow — open menu → `View the board` → assert board text visible.
  NO stroke-constant tests, NO sine-function unit tests, NO automated scrim assertion (a
  testID's presence cannot prove the dim paints — the scrim is judged by eye in U5/U6).

## Key Technical Decisions

- **KTD1 — Problem classes (rule 21).** T4: one-shot animation guard keyed on
  stale-while-revalidate derived state → conventional fix is classify-after-refresh
  (`isFetchedAfterMount`) plus removing the gate. T1a: CSS color function unsupported by the
  native styler → literal token value. T1b: entering-animation vs portal-teardown race →
  sequenced handoff (frame yield). T3: emitted geometry exceeding its declared frame → frames
  contain their extents. T2: stroke width scaling under viewBox/group transforms →
  `vectorEffect="non-scaling-stroke"`. T5: connector through variable-height content →
  measured-anchor SVG overlay over the existing `onLayout` registry.
- **KTD2 — Reward event identity survives.** Deleting the gating never weakens ADR-0032's
  no-replay invariants: the sweep stays event-keyed, the first-win haptic stays one-shot, and
  rerenders/reopened surfaces still cannot replay a reward.
- **KTD3 — Android evidence boundary (ADR-0038).** H1/H2 are native-runtime defects invisible
  to web gates (web resolves color-mix; web has no portal responder/animation race) and to jest
  (no real styler, no real animation driver). Verification authority is the user's emulator
  loop; the maestro board-content step joins the durable native gate as the automatable slice
  (visibility class — emulator-adoptable), while scrim dimness stays human-judged.
- **KTD4 — Deletions (rule 18, same change as replacements):** `actionsReady` /
  `settledEventKey` / settle timer / `rewardDuration` / both `disabled` props;
  `WINDING_OFFSETS` table and the straight center-bar `View`; both `bg-black/40` utilities.
  Tests asserting any of these are rewritten in the same units.
- **KTD5 — Wave stays static.** No motion is attached to the trail wave (nothing to
  reduce-motion-guard); it re-renders only when measured anchors change.

## Implementation Units

- **U1 — Guardian reward actions (D1 + D2).** Delete the gating in `GuardianReward`; keep the
  one-shot haptic + keyed sweep; add `isFetchedAfterMount` to the route controller's loading
  condition. Jest regression (D8a) simulating the exact cached-rematch sequence; new e2e
  scenario (D8c) with the pre-warmed cache path.
- **U2 — Badge containment (D3).** Move the badge radius into `crystalFormationLayout.ts`,
  grow the emitted island geometry by the overhang, and assert containment in the existing
  layout regression suite (D8b). Verify the full `CrystalFormationScene` composition (spine
  through badge anchors, header masks) still reads correctly in screenshots.
- **U3 — Specimen stroke policy (D4).** Apply the non-scaling 2 px policy and opacity raise in
  `CrystalSpecimen`; update any existing test snapshots/assertions touched. Judged visually in
  U6 (trail capstone beside icons; formation scenes; Vista).
- **U4 — Trail wave (D5).** Sine offsets + measured-anchor SVG path in `CheckpointPath`;
  delete the table and the center bar. Confirm the existing e2e overflow assertions still hold
  at 320 px (amplitude unchanged at ±56).
- **U5 — Android overlay reliability (D6 + D7; user-hosted emulator + Metro loop).** Confirm
  build provenance; reproduce both symptoms; apply the scrim token (D6) and the sequenced
  handoff (D7); verify on the emulator: dim visible behind the Board dialog AND the Support
  Path dialog, board content rendered via BOTH the menu path and the splash path, no
  regression to web (production export spot-check). Append the maestro board-content step
  (D8d). If both hypotheses fail on device, stop per the stop condition and re-diagnose.
- **U6 — Rule-14 real-use gate.** Real-backend browser inspection over an existing production
  expedition (phone + desktop + reduced motion + 200 % scale): trail wave passes through every
  checkpoint circle with no horizontal overflow, uncollected specimens legible beside icon
  strokes, the whole gold seal visible in the rematch reward card, reward actions immediately
  usable after first-win AND rematch, no reward replay on reload. Emulator screenshots from U5
  are the Android evidence. Evidence + evaluation note under
  `tmp/2026-07-16-learner-ux-polish/`. Then fold status into `TODO.md` and delete this plan.

## Acceptance

- Rematch and first-win rewards always present actionable `Explore formation` /
  `Continue expedition`; classification never renders from a stale cache; sweep/haptic still
  play exactly once per win edge.
- The gold seal renders whole in every Leg-scene consumer; layout regression asserts badge ⊆
  frame.
- One 2 px non-scaling outline weight across ghost/growing/collected specimens at every size;
  growing reads clearly at 40 px; ghost stays lighter and never fills.
- The trail renders one dashed sine wave passing through every checkpoint circle center on
  phone and desktop with zero horizontal overflow; `WINDING_OFFSETS` and the center bar are
  gone.
- On the Android emulator: both centered overlays dim the background, and the Board dialog
  shows content from both entry paths; the maestro flow locks the board-content path.
- KTD4 deletions complete; deterministic envelope green (typecheck, lint, suites); U6 evidence
  recorded; `TODO.md` updated; plan deleted.
