# Keep the Learner App in flow through mastery-aligned game UX

Status: Accepted.

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

The project's single durable retrieval challenge is the **Recall Challenge** defined in
[CONTEXT.md](../../CONTEXT.md), which owns its scope, lineup rule, reward, and evidence isolation.
Three game-UX properties make it admissible under this ADR rather than a parallel objective:

- It is **earned and mastery-aligned**. It fires only at a completed Leg or completed summit and
  draws only on that scope's already-passed neutral items, so a learner cannot win the game layer
  while bypassing the understanding it exists to confirm. No eligible item means no reward — a
  content-coverage defect to surface, never a silent award.
- Its stakes are **corrective, not punitive**. No outcome causes defeat, mastery loss, reward loss,
  or a restart, and there is no correctness timer; a miss re-queues the item behind a recoverable
  shield.
- It gates the **reward, never the learning**. Because challenge evidence is isolated from
  acquisition evidence, a postponed Guardian never blocks the next prerequisite-valid stop.

Two properties of the expedition loop follow, and derivation — not content luck — owns both.

The loop must be **completable**. No Leg may exist that cannot be won, and no progression gate may
depend on a precondition nothing can satisfy. Where an unwinnable unit would otherwise appear,
derivation removes its boundary rather than auto-awarding it, and any gate that still cannot be
satisfied reports itself honestly instead of waiting forever. Completability is a claim about
reachability, not about content: a stop that carries neither a Study Item nor a Concept Lesson nor a
recorded lesson-absence is not masterable, and the code does not pretend otherwise — that state is
measured, not assumed away.

The loop must be **paced**. A Leg is a milestone-shaped unit bounded by its own Guardian's ward
budget, so the interval between reward beats is a designed property of derivation rather than an
incidental consequence of how a layer's concepts happened to cluster. A Leg boundary may only fall
on a recognizable intermediate outcome, never at an arbitrary depth or difficulty transition, and
boundary rules stay learner-independent: adapting to the learner belongs to the support ladder,
lineup rotation, and pacing, never to the trail skeleton whose stability is what makes a permanent
reward permanent.

The weekly cohort leaderboard is a motivation surface retained under one constraint: its rivals are
presentation-side fiction that never touch `learners`, graded evidence, or any persistence. Real
multiplayer is out of scope. Retention is provisional and reopens on beta learner response.

Achievement surfaces keep their visual composition **self-contained — meaningful as a static image,
not only through interaction** — so an achievement can be exported as a picture fit for posting
outside the app. Any such export carries only the learner's own progress imagery and themed copy;
sharing celebrates mastery without becoming a parallel objective.

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
for an unfamiliar term through a quiet Explorable Term action; that request starts a **Scaffold
Detour** ([ADR-0037](0037-persist-learner-scoped-scaffold-detours.md)) immediately without climbing
the ladder, because the learner has already named the gap. Skipping the ladder is admissible here
only because the detour earns no crystals, points, or base progress, so it cannot become a parallel
objective.

Each new Learner App mechanic must pass a Flow design gate before implementation: name the
player-visible goal, confirm it matches the intended learning goal, identify distractions, describe
the challenge curve and expected skill growth, state which pleasures it prioritizes, and define the
focused runtime signals needed to inspect flow. The minimum focused signals are segment
completion/abandonment, correctness, retries, hint use, response time, and calibration changes;
invasive affective or fine-grained behavioral telemetry is not part of the baseline.

## Interaction system, overlays, motion, and haptics

The Learner App renders through **one app-owned component boundary** over NativeWind, whose members
are exactly the components exported by `apps/learner-app/src/ui/index.ts`. Semantic colors, spacing,
typography, radii, touch sizes, interaction states, haptic intents, and motion durations have a
single token source (no duplicate values). The boundary is lint-enforced: learner surfaces import
the app-owned `Text` and press surfaces, never raw React Native `Pressable`/`Text`.

Every overlay carries a **circular semantic icon header**; an activity header reuses the exact icon
and state language of the checkpoint that opened it, so the overlay reads as a continuation of the
trail stop. Surface kinds are fixed by role: full-screen dialogs for study and Crystal Vista, bottom
sheets for section overview / expedition planning / the journal menu, adaptive dialogs for the Board
and celebration splashes; selected Crystal Vista memory detail uses a bottom sheet over the
full-screen Vista. One **dismissal contract** applies everywhere — dialogs support close,
system back or Escape, and backdrop; bottom sheets add pan-down; full-screen surfaces use explicit
and system back — and a pending mutation temporarily blocks dismissal. Learner surfaces never
import the platform bottom-sheet primitive directly; the app-owned wrapper is the enforced
dismissal, safe-area, and web-layer boundary.

**Safe-area framing belongs to the surface that owns a device edge, never to its callers.** The
route shell, both full-screen and drawer overlays, and the bottom sheet each apply the device
insets themselves under the transparent system status and navigation bars; a learner surface never
reads insets directly, and lint enforces it. Delegating the inset to callers is what let one
full-screen surface paint its header and close control under the status bar while its siblings each
hand-rolled the same padding.

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

The learner's expedition rewards render as **one bright, warm geode Crystal Formation** reached
from the parchment field-chart — a shared light parchment ground behind a vertical stack of
**one panel per Leg**, each holding **one cell per concept**, ended by a summit strip that holds the
**keystone**. The formation, Guardian rewards, activity capstones, trail capstone sockets, and
Guardian art mechanically share the same warm parchment surface roles, so crystal art has exactly
ONE light ground everywhere and needs no light/dark variant. The formation is a downstream
presentation of existing learner facts only:
structural state derives from the section/scope projection (`future`, `collecting`,
`guardian_ready` with honest available/engaged/unavailable copy, `bound` only from the durable first
`wonChallengeId`) and reads on the panel edge plus one junction badge straddling it (dashed muted →
solid neutral → solid frontier with the Leg ward crystal → solid gold with the gold seal), always a
shape distinction with text, never color alone. **The formation renders no graph edges at all**;
prerequisite structure stays on trail and inspection surfaces.

Crystal species is a curated **eight-crystal library** of flat polygon silhouettes whose public
identifiers are **art-independent role ids**, never appearance names, so a future art direction is a
revision of the library's data module and nothing else. Five concept crystals map **one-to-one onto
the five ADR-0024 intrinsic difficulty bands** (`band1`–`band5`) through the shared `difficultyBand`
mapping, and three shapes are **earned-only and never a tier tint**: `keystone` (summit),
`legWard` (Crystal Guardian), `summitWard` (Expedition Guardian). Both encoding channels run
monotone — shape sharpens across the bands and hue walks cool→warm — with the true warm hues
reserved for the earned trio. Species encodes exactly that one neutral fact; remaining per-concept
variation is a tiny deterministic scale with no semantic meaning, and **no learner-specific signal
(retries, correctness, time) ever reaches a specimen**.

Each species authors ONE color 4-tuple plus per-facet ramp tones, and the four materials —
`fogged`, `open`, `next`, `collected` — are **derived mechanically** from that single authored source
with shared stone and per-material presentation constants, so there is no hand-maintained second
representation of any crystal's appearance. Growth renders as the collected material **clipped below
the growth cut over the open material**: the same geometry drawn twice at two material resolutions
with one polygon clip, keeping the honest per-concept progress signal underneath the material
ladder. Because saturation is the "earned" channel, it is **always paired with a non-color partner**
(WCAG F73): state text, the rising fill height, the gloss that only collected carries, and the `Next`
chip on the single next cell. **No `<ClipPath>`, `<Defs>`, gradient, pattern, or SVG id exists
anywhere in the crystal library** — ids are document-global on web, so a per-instance clip would
mis-render one concept shown at two growth values on two surfaces, and this constraint is also what
buys identical web/Android rendering. Known-calibrated concepts stay labeled ghosts and are never
counted as collected crystals; compact surfaces speak exact progress, counts, and status language
instead of rendering detailed specimens below a readable size.

Cell geometry is **two fixed sizes** — one charted cell and one compact locked cell — with row
capacity derived from the panel's inner width, wrapped rows, and a centered last row; panel height
grows with concept count. **Crystal size never varies by Leg**, so it can never misread as
importance, and no specimen renders below the shared minimum. The layout owns every width-driven
decision (panel width, row capacity, cell rects, crystal boxes, caption stacking) but allocates **no
vertical band geometry**: caption and Guardian rows are text-sized, so they stack in flex flow and
focus scrolling uses measured offsets, because a layout-allocated band cannot follow OS font scaling.

**Every panel carries its own Guardian row.** A single global Guardian call to action would be
dishonest because disjoint Legs are simultaneously available; the row and the trail's Guardian node
share one state→copy mapping, so the two surfaces cannot disagree about a scope, and entering a
Guardian from the cavern closes it only after a successful enter.

**Collection and binding remain distinct event-bound rewards.** Mastery raises only the newly earned
crystal's fill in its own cell (one mastery haptic); a first Guardian victory scales the gold seal
into the junction badge and sweeps gold once along the **panel edge** (one fusion haptic); the summit
seats the keystone in the summit strip (one unlock haptic); a rematch receives only restrained
endurance copy with no re-award haptic. **Gold appears exclusively on earned rewards** — bright gold
fills and sweeps carry the decorative reward effect, while `gold-ink` carries earned text, icons,
outlines, and boundaries legibly on the light formation ground — and the `guardian_ready` ward badge
must read as its own hue, not as gold, at real badge size. Reward motion requires the route-local win transition observed
by the mounted fight; direct loads, refreshes, and rerenders of an already-won challenge render the
settled scene. The final keyed answer reveal always precedes the same-route reward stage, and a
failed reward-preview refetch can never hide a committed victory, be classified as a rematch, or
block continuing.

**The Guardian's body is one fixed Ward Obelisk.** Both duels render as a single symmetric obelisk
standing in the cavern socket, divided into exactly `wardTotal` ordered segments — one per real
lineup ward, anywhere from one to the five-Leg / seven-Expedition maxima, never a fixed count.
Segments are indexed base to crown: resolved wards accumulate from the base as bare stone slots that
never vanish, the lowest unresolved segment is the current ward carrying the scope species' full
collected palette with its lit facet, a static gloss and a heavier boundary, and queued wards sit
above it at the quieter open material. **Geometry is a function of the ward count alone**, so
answering changes only a segment's material: the silhouette, its bounds and its seams never move,
resize, reflow, or disappear mid-fight, and `unresolvedItemCount === 1` therefore makes the crown
the Final Ward by construction. These segments are the **single visual encoding of ward count** —
there is no separate ward arc — while the visible status line and the figure's one accessibility
label remain the authoritative exact counts. Every state difference is carried by fill, facet,
gloss, contour weight and ordered position before hue, and no ambient motion, filter, gradient,
pattern, SVG id, `<Defs>` or `<ClipPath>` is introduced. The learner's three-segment shield below
the body stays independent: a miss spends a shield and may shake the whole figure once, but never
resolves or rearranges a ward. The body is built from **its scope's ward species** — `legWard`'s
orange diamond and `summitWard`'s pink trident are carried as a normalized emblem cut into the
crown, so the two duels stay shape-distinguishable without a ninth crystal species — and never from
the anchor concept's band crystal: `RecallChallengeView` carries no intrinsic difficulty, and
inventing a band for it would make a concept crystal encode noise as though it were the one fact
bands stand for. The Guardian body is therefore **scope-derived, not anchor-seeded**, and carries no
anchor identity. **The body is drawn only while a fight is in progress.** A committed victory routes
straight to the Crystal Formation reward, which owns the whole victory beat, so the Guardian
component has no victory state at all — its phase is the two in-fight states only. That structural
absence, not a defensive branch, is what guarantees the corrective contract: no shatter, collapse, or
defeat pose exists anywhere to render, and a second victory presentation on the Guardian would
contradict the bound-formation reward that already owns it.

**Crystal Vista opens only through explicit learner action** (including explicit reward-driven
Explore intent, consumed on close). The one-time contextualization for a newly bound reward is a
focused settle on that Leg's panel — never a second binding or growth replay — and the whole
displayed bound snapshot is marked seen so stale animations cannot queue; local memory records only
whether contextualization was viewed, while reward existence always derives from the server
projection. Selecting a nameable crystal opens its memory detail in the app-owned bottom sheet over
the still-open, still-scrollable Vista: revealed ground shows its existing gist and Examine action,
guarded ground shows guarded copy without Examine, and unnamed locked ground stays inert. Backdrop,
pan-down, Escape/system back, and close clear only this selection; Examine clears the selection
before closing Vista and returning to the corresponding trail stop. The action footer keeps 16px
content spacing in addition to the device bottom inset. Reduced motion renders every reward's final
state immediately with equivalent copy and static emphasis. There is no ambient formation motion or
audio.

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
interaction text keep the current face. The map is pure downstream presentation: it keeps **gold
exclusively on earned rewards** and must render identically on web and Android (no SVG filters;
grain via `<Pattern>`; literal color tokens, never `color-mix()` opacity modifiers the native styler
drops). Trail structure and state semantics come unchanged from the Study Session projection.

## Context

The project already keeps learner-specific state downstream of the learner-neutral graph
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md)) and composes learner-facing
projections behind application use-cases ([ADR-0027](0027-serve-inspection-through-read-model-ports.md)).
The Concept Lesson is game-ready but neutral ([ADR-0031](0031-concept-lesson-teaching-substrate.md)).
A durable Game UX policy is needed so future playable projections optimize for mastery and flow
without smuggling personalization into neutral graph assets or turning delight into distraction.
