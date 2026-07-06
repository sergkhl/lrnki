# Keep the Learner App in flow through mastery-aligned game UX

Status: Accepted

## Decision

The **Learner App** keeps the learner in a **Flow Channel**: clear goals,
not-too-easy and not-too-hard challenges, and nested tension/release pulses that make progress hard
to ignore once a challenge is visible. The app's visible goals, rewards, feedback, and challenge
selection must align with mastery progress toward a chosen target; the learner should not be able to
win a game layer while bypassing the concept understanding the layer exists to build.

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
pick a mechanic cold. The expedition is **layer-wide with a derived summit**: the trail covers the
whole layer as one continuous **Expedition Trail** broken into milestone-anchored **Expedition
Sections** ("graph as engine, line as interface"), and the summit is derived at read time as the last
section's milestone rather than a learner-chosen target. There is no persisted expedition target;
readiness is enrichment + study bank present. Returning to the Learner App should resume the same
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

Completion rewards are part of the mastery flow, not decoration. A concept is mastered by a
**completion rule** — its lesson (if any) read AND every activity segment latest-correct — so
finishing the *last* remaining activity advances into the capstone reward (gem) state; a single
correct answer never collects the gem for a multi-segment concept. The learner should see the mastery
beat and then continue to the next available stop, or return to the trail only when the expedition
has no next stop. Every learner-facing count (progress, gems) derives from the same trail scope the
projection walks, so counts never drift from the trail.

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

## Context

The project already keeps learner-specific state downstream of the learner-neutral graph
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md)) and composes learner-facing
projections behind application use-cases ([ADR-0027](0027-serve-inspection-through-read-model-ports.md)).
The Concept Lesson is game-ready but neutral ([ADR-0031](0031-concept-lesson-teaching-substrate.md)).
A durable Game UX policy is needed so future playable projections optimize for mastery and flow
without smuggling personalization into neutral graph assets or turning delight into distraction.
