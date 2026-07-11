# Keep the Learner App in flow through mastery-aligned game UX

Status: Accepted. Amended 2026-07-11 (plan 2026-07-10-003) with the app-owned interaction system,
overlay, motion, and haptic contract.

## Decision

The **Learner App** keeps the learner in a **Flow Channel**: clear goals,
not-too-easy and not-too-hard challenges, and nested tension/release pulses that make progress hard
to ignore once a challenge is visible. The app's visible goals, rewards, feedback, and challenge
selection must align with mastery progress through the current expedition trail; the learner should
not be able to win a game layer while bypassing the concept understanding the layer exists to build.

The Learner App orchestrator owns flow. Learner-neutral assets - the Derived Graph Layer, Concept
Lesson, and Study Item Bank - expose concepts, grounding, item types, difficulty signals, and graded
observations, but do not encode learner-specific pacing, points, stakes, or personalized game arcs.
Learner-facing routes consume those assets and Learner State only through the application package's
public use-case and projection surface
([ADR-0027](0027-serve-inspection-through-read-model-ports.md)); they import no operator components
and no persistence adapters, so extracting a standalone Learner App later is an import-discipline
move, not a rewrite.
Version 1 starts orchestrated-first: the learner chooses an **expedition** (one Derived Graph Layer),
and the app chooses the next mechanic or segment to preserve flow instead of asking the learner to
pick a mechanic cold. The expedition is layer-wide with a derived summit per the **Study Session**
and **Expedition Section** definitions in [CONTEXT.md](../../CONTEXT.md) ("graph as engine, line as
interface"). There is no persisted expedition target; readiness is enrichment + study bank present. Returning to the Learner App should resume the same
learner-owned path with minimum friction; the client may remember the learner's name-ref locally
because it is navigation state, not authentication or learner-neutral content.

Section entry is **prerequisite-gated, not line-gated**: per-node prerequisite gating already makes
any node with mastered prerequisites playable, so disjoint sections are simultaneously available and
the app never blocks the trail on section order. A **non-blocking section overview** is available on
demand (never required by the guided continue flow): it lists every section with its state and
progress, jumps to any unlocked section, and names the gating concepts of a locked one. Landing lands
the learner on the next stop.

The Learner App is **mobile-first**: design and build every learner-facing surface for a
phone-sized portrait viewport with standard mobile best practices (touch-first interaction, no
hover-dependent affordances, thumb-reachable primary actions, safe-area awareness) as the default,
then adapt upward. Desktop is a secondary adaptation of the mobile design, never the base layout
that gets squeezed down.

The first-class LeBlanc pleasures for the Learner App are **Challenge**, **Discovery**, and
**Sensation**. Other pleasures may appear later, but game delight is allowed only when it reinforces
the current goal: feedback, progress clarity, anticipation, reward, recovery, or discovery of the
concept map. Narrative, fantasy, collection, and social features must not become parallel objectives
that distract from mastery.

Learner-facing theme language follows
[ADR-0033](0033-plain-identifiers-single-themed-vocabulary-mapping.md): durable identifiers stay
plain, and themed copy is rendered through the Learner App vocabulary and stage-copy mappings.

Completion rewards are part of the mastery flow, not decoration. Mastery follows the Study Session
**completion rule** defined in [CONTEXT.md](../../CONTEXT.md), so finishing the *last* remaining
activity advances into the capstone reward (gem) state. The learner should see the mastery
beat and then continue to the next available stop, or return to the trail only when the expedition
has no next stop. Every learner-facing count (progress, gems) derives from the same trail scope the
projection walks, so counts never drift from the trail.

Achievement sharing is an accepted future need: a learner should eventually be able to export an
achievement — at minimum their Crystal Vista formation — as a picture fit for posting outside the app
(for example to Instagram). Achievement surfaces therefore keep their visual composition
self-contained: meaningful as a static image, not only through interaction. A share export carries
only the learner's own progress imagery and themed copy, and sharing celebrates mastery without
becoming a parallel objective.

Mechanics stay mobile-first in their interaction model. Matching uses **two-column tap-pairs** —
clue tiles on the left, match tiles on the right, each column independently shuffled — with wrapping
tiles so long generated text stays readable on phone viewports; the grading trace and server-side
keys remain unchanged.

When flow signals show boredom, overload, or stalled skill growth, the app uses a support ladder:
clarify the goal or feedback, vary the mechanic or stakes, offer hints/retries/review, change the
sequence, and only then generate a **Learner-Scoped Scaffold**. Such scaffolds are learner/session
support content, clearly labeled generated, and never mutate the Learner-Neutral Core Concept Graph,
the Derived Graph Layer, or the neutral Study Item Bank.

Each new Learner App mechanic must pass a Flow design gate before implementation: name the
player-visible goal, confirm it matches the intended learning goal, identify distractions, describe
the challenge curve and expected skill growth, state which pleasures it prioritizes, and define the
focused runtime signals needed to inspect flow. The minimum focused signals are segment
completion/abandonment, correctness, retries, hint use, response time, and calibration changes;
invasive affective or fine-grained behavioral telemetry is not part of the baseline.

## Interaction system, overlays, motion, and haptics

The Learner App renders through **one app-owned component boundary** over NativeWind: `Screen`,
`Text`, `PressableSurface`, `Button`, `IconButton`, `Card`, `Input`, `Progress`, `Dialog`,
`BottomSheet`, `SideSheet`, `FullScreenDialog`, and `OverlayHeader`. Semantic colors, spacing,
typography, radii, touch sizes, interaction states, haptic intents, and motion durations have a
single token source (no duplicate values). The boundary is lint-enforced: learner surfaces import
the app-owned `Text` and press surfaces, never raw React Native `Pressable`/`Text`.

Every overlay carries a **circular semantic icon header**; an activity header reuses the exact icon
and state language of the checkpoint that opened it, so the overlay reads as a continuation of the
trail stop. Surface kinds are fixed by role: full-screen dialogs for study and Crystal Vista, bottom
sheets for section overview / expedition planning / the journal menu, adaptive dialogs for the Board
and celebration splashes. One **dismissal contract** applies everywhere — dialogs support close,
system back or Escape, and backdrop; bottom sheets add pan-down; full-screen surfaces use explicit
and system back — and a pending mutation temporarily blocks dismissal.

Motion is **Reanimated and event-bound only**: presses, disclosures, overlay entrances,
indeterminate progress, next-stop attention, matching feedback, crystal growth, mastery assembly,
fusion, and unlock moments. Every enabled press gives a restrained physical response (slight scale,
reduced elevation, surface-color change) with no layout movement; disabled and busy states stay
still and prevent duplicate actions. Completed crystals and Vista formations stay still — no ambient
crystal motion, no audio. Crystal Vista is **never auto-opened**: mastery assembly plays in flow,
the Vista trigger is emphasized, and a newly fused cluster is preserved for one-time assembly when
the learner opens Vista.

One shared **reduced-motion policy** honors the OS or browser preference (there is no app-specific
motion setting): transform and assembly motion are replaced by immediate state and static emphasis,
and assistive-preference users receive equivalent state and progress information. Haptics are
**selective and semantic** — checkpoint and answer selection, grading outcomes, mastery, fusion, and
unlock — fired once at the transition; generic navigation never vibrates.

## Context

The project already keeps learner-specific state downstream of the learner-neutral graph
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md)) and composes learner-facing
projections behind application use-cases ([ADR-0027](0027-serve-inspection-through-read-model-ports.md)).
The Concept Lesson is game-ready but neutral ([ADR-0031](0031-concept-lesson-teaching-substrate.md)).
A durable Game UX policy is needed so future playable projections optimize for mastery and flow
without smuggling personalization into neutral graph assets or turning delight into distraction.
