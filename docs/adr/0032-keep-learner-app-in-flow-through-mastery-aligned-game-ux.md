# Keep the Learner App in flow through mastery-aligned game UX

Status: Accepted (last amended 2026-07-19).

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

The single durable **recall challenge** is the **Recall Challenge** defined in
[CONTEXT.md](../../CONTEXT.md), presented as the **Crystal Guardian** (Leg) and **Expedition
Guardian** (summit) duel; it supersedes and replaces the earlier global Crystal Duel (its timer,
simulated rival, unlock splash, grade/win API, award/badge, navigation, vocabulary, and client-local
unlock memory are removed in the same change; the weekly podium is unaffected). A recall challenge is
earned, scope-shaped, and mastery-aligned: it fires only at a completed Leg or the completed
Expedition summit, draws its lineup exclusively from that scope's *already-passed* neutral Study Item
Bank items (coverage-first — distinct concepts and the milestone/summit concept before repeats; five
Leg / seven Expedition rounds are maxima, never invented minimums), and grants **no** reward when no
eligible item exists (a content-coverage defect to surface, never a silent award). Its stakes are
**corrective, not punitive**: a miss counterattacks a learner shield and re-queues the item, shield
exhaustion enters a Last Stand that recovery repairs, and no challenge outcome ever causes defeat,
mastery loss, reward loss, or a restart; there is no correctness timer. The lifecycle is durable and
idempotent (one active fight per learner+scope, exact retreat/resume, confirmed abandon). The reward
is a **permanent, singular** Leg binding or summit keystone in the Crystal Formation earned on the
first victory; rematches rotate coverage and receive only a restrained endurance acknowledgment —
they never replay binding or growth, never fire a re-award haptic, and never dim, revoke,
duplicate, or re-award the permanent reward (see the Crystal Formation contract below). Crucially, **challenge evidence is not acquisition evidence**: Guardian answers persist
in their own durable challenge tables and never enter the neutral acquisition `response_log`, count
toward Concept Mastery, award learning points, or alter prerequisite access — so finishing a Leg's
normal Study Sessions keeps the next prerequisite-valid stop available even while its Guardian is
postponed (the challenge gates the *reward*, never the *learning*). Version one challenges neutral
concept Study Items only; extending fixed-budget selection to completed learner-scoped Support Paths
is deferred until they carry a richer typed Study Item set.

The weekly cohort leaderboard — simulated seeded rivals, the division ladder, journal splash
celebrations, and the `weekly_podium` award — is a **deliberately retained MVP motivation surface**
(decision 2026-07-17). Rivals remain presentation-side fiction: they never touch `learners`, graded
evidence, or any persistence. Its retention is provisional — beta learner response decides whether
it is kept, reshaped, or removed — and real multiplayer is out of scope until after beta.

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

The support ladder governs *automatic* interventions. A learner may also *explicitly request* support
on demand for an unfamiliar term through a quiet Explorable Term action; that request starts a
**Scaffold Detour** immediately without climbing the ladder, because the learner has already named
the gap. This is a one-level, optional detour that passed the Flow design gate below like any other
mechanic and stays inside the same neutral boundary — it earns no crystals, points, or base
progress and never becomes neutral graph knowledge. Its durable persistence, exact-reuse rule, and
scoped-response identity are owned by
[ADR-0037](0037-persist-learner-scoped-scaffold-detours.md).

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
crystal motion, no audio. Crystal Vista is **never auto-opened**; its deliberate entry and one-time
reward contextualization are owned by the Crystal Formation contract below.

One shared **reduced-motion policy** honors the OS or browser preference (there is no app-specific
motion setting): transform and assembly motion are replaced by immediate state and static emphasis,
and assistive-preference users receive equivalent state and progress information. Haptics are
**selective and semantic** — checkpoint and answer selection, grading outcomes, mastery, fusion, and
unlock — fired once at the transition; generic navigation never vibrates.

## Crystal Formation reward presentation

The learner's expedition rewards render as **one Crystal Formation**: a quiet, vertical, scrollable
ascent of compact per-Leg geode islands — each ONE smooth organic outline around a center-out
specimen mound — joined by a single smooth, **nonsemantic** spine curve through every island
junction and ended by a distinct summit peak whose apex holds the **keystone** slot. The formation
is a downstream presentation of existing learner facts only — structural state derives from the
section/scope projection (`future`, `collecting`, `guardian_ready` with honest
available/engaged/unavailable copy, `bound` only from the durable first `wonChallengeId`) and lives
on the island rim plus one junction badge (dashed muted → solid neutral → solid accent with a
guardian glyph → solid gold with a gold seal), always a shape distinction, never color alone.
Mineral **species is a curated, hand-authored library of three real-mineral silhouettes encoding
exactly one neutral fact**: the concept's intrinsic difficulty band
([ADR-0024](0024-learner-neutral-intrinsic-difficulty.md)) through the shared `difficultyBand`
mapping (bands 1–2 quartz, 3–4 amethyst, 5 diamond); remaining per-concept variation is a tiny
deterministic mirror/scale with no semantic meaning, and no learner-specific signal (retries,
correctness) ever reaches specimen appearance. Progression is one visual variable — ghost outline,
fill rising with growth, full tier tint plus gloss when collected. **The formation renders no graph
edges at all**; prerequisite structure stays on trail and inspection surfaces. Scene chrome is
neutral with three muted tier tints, and **gold appears exclusively on earned rewards** (seals, lit
spine segments, the keystone). Known-calibrated concepts stay labeled ghosts and are never counted
as collected crystals; compact surfaces speak exact progress, counts, and status language instead
of rendering detailed specimens below a readable size. Island packing derives its row capacity from
the available canvas width, and each island's header band is allocated by the layout geometry so
labels can never overlap artwork.

**One shared Leg scene** is the single visual boundary for a Leg's island, badge, and mound;
capstone collection, Guardian reward, and Crystal Vista compose that scene in explicit modes rather
than maintaining parallel drawings, and every reward moment frames the whole compact island.
**Collection and binding are distinct event-bound rewards**: mastery raises only the newly earned
specimen's fill into its shared slot (one mastery haptic), a first Guardian victory scales in the
junction seal, sweeps the rim gold once, and lights the Leg's spine segment (one fusion haptic) or
seats the summit keystone (one unlock haptic) without regrowing minerals, and a rematch receives
only a restrained light sweep with endurance copy and no re-award haptic. Reward motion requires
the route-local win transition observed by the mounted fight; direct loads, refreshes, and
rerenders of an already-won challenge render the settled scene. The final keyed answer reveal
always precedes the same-route reward stage, and a failed reward-preview refetch can never hide a
committed victory, be classified as a rematch, or block continuing.

**Crystal Vista opens only through explicit learner action** (including explicit reward-driven
Explore intent, consumed on close). The one-time contextualization for a newly bound reward is a
focused island settle plus spine light — never a second binding or growth replay — and the whole
displayed bound snapshot is marked seen so stale animations cannot queue; local memory records only
whether contextualization was viewed, while reward existence always derives from the server
projection. Reduced motion renders every reward's final state immediately with equivalent copy and
static emphasis. There is no ambient formation motion or audio.

## Trail map presentation

The Expedition trail screen renders as **one explorer's field-chart**: a single parchment map
artifact behind the whole trail column (aged ground wash, one seeded SVG `<Pattern>` grain tile, and
an edge/border weathering treatment), not a list of cards on the app background. All decoration is
**procedural, deterministic, and nonsemantic**: a pure jest-tested layout module seeds every route
jitter, grain parameter, and margin doodle from the `enrichmentId`, so a learner's map always looks
the same, decoration cost stays O(stops + sections), and no doodle is ever positioned where it could
read as graph structure, an edge, or progress (compass rose and contour/peak glyphs live only in the
side margins with a center-column exclusion). The route is one continuous hand-drawn line through
every measured checkpoint center: **progressive inking** draws segments behind the learner as solid
ink and segments ahead as faint irregular dashes — a shape distinction, never color alone, never
gold, with no route-drawing motion (the mastery beat stays on the capstone). Checkpoints remain
pressable circles restyled ink-on-parchment; **X is reserved for the single terminus cartouche**;
uncharted (fogged/locked) legs read as not-yet-charted parchment rather than plain opacity dimming,
with per-stop state still carried by shape **and** text (WCAG F73). A single bundled display font
(IM Fell English via `expo-font`, exposed through the app-owned `Text` boundary) applies **only to
map-surface headings** — cartouche titles, terminus, and the expedition title — while body and
interaction text keep the current face. This is pure downstream presentation: it changes no API,
projection, persisted shape, copy, or motion, keeps **gold exclusively on earned rewards**, and
renders identically on web and Android (no SVG filters; grain via `<Pattern>`; literal color tokens,
never `color-mix()` opacity modifiers the native styler drops). Trail structure and state semantics
come unchanged from the Study Session projection (`buildTrailView`).

## Context

The project already keeps learner-specific state downstream of the learner-neutral graph
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md)) and composes learner-facing
projections behind application use-cases ([ADR-0027](0027-serve-inspection-through-read-model-ports.md)).
The Concept Lesson is game-ready but neutral ([ADR-0031](0031-concept-lesson-teaching-substrate.md)).
A durable Game UX policy is needed so future playable projections optimize for mastery and flow
without smuggling personalization into neutral graph assets or turning delight into distraction.
