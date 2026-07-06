# Growing crystals and the Crystal Vista — accepted framing and scope

Owner of accepted problem framing, requirements, and scope for the growing-crystal pleasure reward
until this work completes (then fold durable outcomes into `TODO.md` and delete this file).
Game-UX policy authority: [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## Goal

A Sensation/Discovery "pleasure" reward: the learner's knowledge renders as a continuously growing
crystal structure. Growth must be a projection of the existing completion rule — never a parallel
objective, economy, or persisted cosmetic state.

## Accepted scope (two surfaces, one crystal identity)

1. **In-trail per-concept crystals.** Each concept's capstone gem becomes a unique procedural SVG
   crystal seeded by `derivedNodeId` (shard count scales with intrinsic difficulty) that grows
   facet-by-facet as the node's own stops complete. Mastery finishes the final shard and plays a
   one-shot facet-assembly + glint reveal. The lucide gem icon and `GemCapstone` are deleted; the
   same glyph renders the trail capstone, concept marker, header tally, section strips, and vista.
2. **Crystal Vista.** A strictly view-only bottom sheet showing the whole current expedition as one
   crystal formation, positioned by the sphere-grid topology layout with y inverted (prerequisite
   roots at the bedrock; the formation grows upward). Prerequisite veins run beneath the crystals;
   fogged concepts show as faint silhouettes (Discovery tease, not absence). Entry points: the
   header crystal tally is the trigger, and the vista auto-opens once as a celebration when a trail
   section becomes fully mastered (dismissible immediately). No navigation, no per-crystal
   interaction.

## Requirements and constraints

- **Derived at read time, zero persistence.** Crystal growth = the trail cluster's
  `growthFraction` (fraction of the node's own non-capstone stops complete; mastery forces 1, so a
  calibration `known` node shows a finished crystal). No cosmetic/reward state is ever stored.
- **One completion rule, one visible truth.** Every crystal surface reads the same trail view the
  gating and counts read; nothing can drift.
- **All-expeditions later, cheaply.** The vista renders a `CrystalFormation[]` list; extending from
  the current expedition to a learner-wide vista is a loader change (compose more formations), not a
  component change.
- **2.5D SVG/CSS only.** No new rendering dependency. The deterministic seed → crystal-geometry
  mapping (`crystalGeometry.ts`) is the durable core a future real-3D renderer would reuse.
- Ambient motion honors `prefers-reduced-motion`; extraction/judge pipelines are untouched
  (downstream projection visual only).

## Rejected (do not re-propose)

- **Interactive/browsable 3D crystal world.** A separate explorable collection surface is the
  parallel objective ADR-0032 forbids; the learner graph map and Journal collection route were
  previously deleted for exactly this. The vista stays view-only.
- **three.js / WebGL now.** A new rendering subsystem for one reward fails the durable,
  low-complexity constraint on a portrait mobile-first app. Real 3D remains possible later behind
  the same geometry core.
- **Persisted cosmetic/reward state.** Growth derives from Learner State + the Study Session
  projection at read time; retroactive and self-healing across DB resets.
