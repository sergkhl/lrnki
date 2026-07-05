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
Version 1 starts orchestrated-first: the learner chooses a target or quest, and the app chooses the
next mechanic or segment to preserve flow instead of asking the learner to pick a mechanic cold.

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
