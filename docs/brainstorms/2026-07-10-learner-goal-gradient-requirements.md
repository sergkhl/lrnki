# Learner goal gradient and constructive Crystal Vista — accepted framing and scope

Owner of accepted problem framing, requirements, and scope until this work completes (then fold
durable outcomes into ADRs/`TODO.md` and delete this file). Game-UX policy authority:
[ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
Implementation design: [plan 2026-07-10-001](../plans/2026-07-10-001-learner-goal-gradient.md).

## Problem

The game has strong rewards but weak advance-visible goals: collecting a crystal is a payoff, not a
goal, because a goal must be visible *before* the action. The evaluation frame is Schell's five flow
questions (clear goals; player goals = intended goals; distractions; steady not-too-easy/not-too-hard
challenges; skills improving at the hoped rate).

Goal inventory (2026-07-10 audit of the shipped app):

- **Moment:** "Next stop" — clear and working (one completion rule).
- **Short (leg):** Expedition Sections exist structurally but are never announced as goals.
- **Mid (summit):** deliberately demoted to a whispered subtitle in a prior polish pass; the trail's
  strongest built-in goal is invisible as motivation.
- **Long:** divisions, weekly board, and duel crests exist; the Crystal Vista is passive
  accumulation — nothing is built *toward*.

## Accepted direction

One game world (expedition + crystals). A **mechanic-first goal hierarchy at four horizons** — stop →
leg → summit → formation/season — plus a **thin, non-branching narrative purpose layer**. Fun and
education stay aligned because every goal is a re-framing of mastery structure the projection already
derives. If the goal skeleton proves itself, a richer story layer remains a candidate at the
season/meta level, where branching does not fight the prerequisite DAG (user retention bet, recorded
under Deferred).

## Requirements

- **R1 — Layer purpose.** One forced-tool LLM call per enrichment (a Neural Stage Descriptor per
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)) generates a
  learner-neutral 1–2 sentence capability statement connecting the topic to the summit concept.
  Stored in plain register (no theme words); themed into expedition language only at render
  ([ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md)). Fail-open: an
  absent purpose renders a mechanical template.
- **R2 — Trail goal surfaces.** Journal-card purpose teaser; header summit line merged with the
  purpose; **leg banners** on section dividers stating the goal in advance (crystal count + the
  guarded milestone concept); a "Summit push" header state in the final leg; a summit terminus visual
  at the trail's end with the remaining-crystal count. No new routes.
- **R3 — Constructive vista.** The Crystal Vista groups crystals into **leg clusters**; completing a
  leg **fuses** its cluster (the leg-completion celebration); completing the final leg crowns the
  formation with the **summit keystone**. All states derive from the same Study Session projection
  every surface reads — zero new game persistence.
- **R4 — Memory door.** Tapping a nameable crystal opens a card: concept name + lesson gist +
  "Examine" navigating to that trail stop. Single-stage reveal. The vista becomes the index of what
  the learner knows and the door back to reviewing it.
- **R5 — Tiered fog naming rule.** A crystal is nameable while fogged **exactly when it is an
  announced goal**: the summit and leg milestones (name + "guarded by" line, no gist). Frontier
  crystals are nameable. Ordinary locked crystals stay unnamed mystery shapes (curiosity via curated
  information gaps; no jargon wall).
- **R6 — Duel arena re-port.** The Crystal Duel UI returns on RN primitives over the existing pure
  `duelMachine` and the live `/duel-setup`, `/duel/grade`, `/duel/win` API. Entry is a journal-screen
  card whose locked state shows the existing unlock-progress copy (itself an advance-visible goal).
- **R7 — Measure-first flow evaluation.** The real-use gate answers the five flow questions from
  existing signals only (`response_log` correctness/`attempt_seq`/timestamps, lesson reads,
  calibration verdicts) plus screenshot evidence that every goal tier is visible in advance. No new
  telemetry; no challenge-curve changes.

## Constraints

- The purpose keys to the **enrichment** (learner-neutral asset); generated copy keys only to the
  layer and to concepts, never to Expedition Sections (sections are read-time derivations).
- Mobile-first per ADR-0032: header changes merge lines rather than adding them (2-line clamps); no
  third control in the header's right block; goal-gradient numbers live in leg banners and the trail
  terminus, not a header chip.
- Zero new persistence except the single purpose row per enrichment; every game state (clusters,
  fusion, naming tiers) derives at read time and self-heals across DB resets.
- Achievement surfaces stay meaningful as a static image (shareable-achievement policy in
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)).

## Rejected (do not re-propose)

- **Full branched RPG story on the trail.** Structural mismatch: branched narrative is authored
  sequence; progression here is a derived partial order that learners traverse in any prerequisite-
  legal order. Fiction that must survive arbitrary topological orders can frame but cannot plot. Also
  the parallel-objective class ADR-0032 forbids, plus a per-expedition content/QA/cost treadmill.
- **Free-text study items** in this scope — a separate item-type decision with per-response LLM
  grading implications ([ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md));
  parked, not refused.
- **Two-stage recall reveal on the memory door.** A crystal's shape is a weak, never-encoded
  retrieval cue; the extra tap taxes the door's real job (review navigation) for near-zero recall
  benefit.
- **Summit chip in the header.** Fails mobile width; the right block is at capacity.
- **Learner placement of crystals.** Positions are semantic (prerequisite bedrock-up); free
  placement is fake agency that destroys the map's honesty.
- **Formation naming / share machinery now.** Persistence for a cosmetic; the durable share need is
  recorded as policy in ADR-0032 instead.
- **Resonance dimming (decay + re-test) now.** The strongest retention idea, but it forces the
  "can new evidence revoke mastery?" decision; that belongs to the Leg Trial (Deferred), one
  retention mechanic decided once.
- **Naming ordinary fogged crystals / always-visible labels.** A wall of unknown terms is anxiety,
  not curiosity; always-on labels are mobile clutter and spend the discovery reveal for nothing.

## Deferred, with named seams

- **Leg Trial ("boss fight").** A grade-only retrieval sprint over a completed leg's concepts at the
  leg-completion seam; the duel proved the exact contract (grade-only path that provably never
  touches mastery state). Owns the splash-worthy moment, the retention mechanic (incl. resonance
  dimming), and the mastery-revocation decision.
- **Board/duel-unlock splashes and the menu drawer re-ports** (remain on `TODO.md`).
- **Cross-expedition vista gallery.** Learner history is scoped to one Derived Graph Layer
  (ADR-0026); a lifetime vista is an identity-design problem. The vista's formation-list seam
  already accommodates it.
- **Response-time telemetry** (client timing + schema touch; add when we are ready to act on it).
- **Story/branching at the season/meta level** — revisit after the goal gradient is measured.
