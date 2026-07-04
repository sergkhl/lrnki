---
date: 2026-07-04
topic: learner-app-map-center-ux
---

# Learner App — map-centered trail, one-activity flow, and charting onboarding

## Summary

Make the trail the Learner App's single home surface and merge it with the survey map: fog covers
unmastered territory and lifts in place as mastery folds. Activities open one at a time as a
full-screen sheet, journal pages and gems collapse into one journal surface, and "Chart a new
course" becomes a one-field form with an inferred, learner-correctable Declared Domain and
learner-friendly progress copy. The literal graph view stays operator-only, and the Admin Lab gains
a link into the Learn App under the `admin` learner reference.

---

## Problem Frame

Real use of the shipped `/learn` surface surfaced three frictions. The expedition page stacks the
quest header, the current lesson, its activity cards, and the full trail on one screen, so
everything is visible at once and nothing reads as the center. The charting card renders raw
operation stage identifiers (`knowledge-boundary-probe`, `concept-lesson-generation`) straight from
the stage timeline, and the course form asks for "Course data" and "Domain" — operator vocabulary
on a learner surface. The shipped layout also does not hold up at phone width, despite v1's
mobile-first requirement.

---

## Key Decisions

- **The survey map becomes the trail, staged.** The target look is a trail winding across map
  terrain where fog marks unmastered territory and lifts in place. The first pass ships the same
  behavior with a fog band above the next stop and no terrain art; a later pass deepens the terrain
  rendering. Chosen over a calm parchment trail so the fog stays part of moment-to-moment play
  rather than a souvenir view.
- **Fog is a mastery re-render, never a mechanic.** Fog renders "mastery hasn't reached here." A
  failed stop keeps its fog and its replayable activities. Generating remediation items on failure
  is a Learner-Scoped Scaffold on the
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) support
  ladder and stays deferred.
- **One activity at a time.** A stop opens its activity as a full-screen sheet over the trail; the
  inline lesson-plus-activities grid is retired. The trail is the only persistent surface.
- **The journal absorbs the map's souvenir role; graph rendering becomes operator-only.** Journal
  pages and the gem collection merge into one surface behind one button. The learner-facing graph
  map view is deleted; graph visualization lives only in the Admin Lab.
- **Topic-first charting with pre-submit domain inference.** The learner types what they want to
  learn; an optional field-of-study input is available from the start. When it is blank, the
  Declared Domain is inferred and shown for correction before the create action; when the learner
  filled it, creation is a single step. Charting always starts with a settled domain, so no
  mid-charting correction or re-chart path exists.
- **Stage copy is a display mapping.** Learner-friendly, domain-neutral, fiction-voiced copy keyed
  by stage identifier replaces raw stage strings on the learner surface. Operation timelines and
  persisted stage identifiers are unchanged.
- **The Admin Lab links into the Learn App as `admin`.** The cross-link uses the fixed learner
  reference `admin` rather than prompting for a name; operator play-test state accumulates there,
  separate from real learners.

---

## Requirements

**Trail and fog**

- R1. The trail is the expedition's only persistent surface: a slim header (target, progress, next
  stop) and the trail itself; the current lesson and activity cards no longer render inline beside
  it.
- R2. Unmastered territory renders fogged with the fog line just above the pulsing next stop;
  mastery lifts fog in place, and completing the expedition keeps the single summit celebration
  revealing the whole range.
- R3. A failed or unfinished stop keeps its fog and its replayable activities; fog never adds,
  hides, or generates study content.
- R4. The first pass may render fog as a soft band above the next stop without terrain art,
  provided R2–R3 behavior is identical to the terrain target.

**Activity flow and journal**

- R5. Tapping the marked next stop opens its activity as a full-screen sheet over the trail with
  exactly one activity visible; finishing or closing returns to the trail with the stop's state
  updated.
- R6. At any moment exactly one clearly marked "next" affordance is visible.
- R7. Journal pages and the gem collection merge into one journal surface behind a single button;
  the separate learner map view is removed.
- R8. Every screen and interaction works at phone width; phone is the layout baseline and desktop
  the adaptation.

**Charting**

- R9. The course form leads with one input asking what the learner wants to learn, with concrete
  example topics; an optional field-of-study input is available from the start.
- R10. When the domain input is blank, the Declared Domain is inferred from the typed topic and
  shown for correction before the learner presses create; a learner-supplied domain skips
  inference; charting starts only with the settled domain.
- R11. Charting progress shows domain-neutral, fiction-voiced stage copy; raw stage identifiers
  never reach the learner surface.

**Admin Lab**

- R12. From an enrichment view in the Admin Lab, the operator can open the corresponding Learn App
  expedition under the fixed learner reference `admin`.
- R13. Graph visualization remains available in the Admin Lab only.

**Cleanup**

- R14. Superseded learner-surface components — the learner graph map view, the separate journal and
  map routes, and the inline lesson-plus-activities layout — are deleted in the same change.

---

## Key Flows

- F1. **Study from the map.** **Trigger:** learner opens their expedition. **Steps:** trail renders
  at the current frontier with fog above the next stop → tap the pulsing stop → the activity sheet
  opens → complete the activity → return to the trail with the stop filled; on mastery the fog
  lifts over the concept's region and its gem appears on the trail. **Covers R1–R6.**
- F2. **Chart a course.** **Trigger:** learner types a topic. **Steps:** if the optional domain is
  blank, the inferred domain appears in the form and the learner confirms or edits it → create →
  progress renders fiction-voiced stage copy → the expedition appears ready. A learner-filled
  domain goes straight to create. **Covers R9–R11.**
- F3. **Operator cross-check.** **Trigger:** operator inspects an enrichment in the Admin Lab.
  **Steps:** follow the Learn App link → the expedition view opens as learner `admin` → the
  operator plays the same surface a learner would. **Covers R12.**

---

## Acceptance Examples

- AE1. **Covers R2, R5.** Given a frontier concept's last graded activity, when the learner
  completes it and mastery folds to mastered, then the sheet closes to the trail, the concept's
  region unfogs in place, and its gem renders on the trail.
- AE2. **Covers R3.** Given a learner answers a stop's activity incorrectly, when they return to
  the trail, then the fog line has not moved, the stop remains open with the same activities, and
  no new study content exists.
- AE3. **Covers R10.** Given a learner typed "Rust ownership" and the form shows the inferred
  domain "programming", when they edit it to "systems programming" and press create, then charting
  runs with the edited domain.
- AE4. **Covers R11.** Given a charting operation in its `knowledge-boundary-probe` stage, when the
  learner views progress, then they see fiction-voiced copy for that stage and the raw identifier
  appears nowhere.
- AE5. **Covers R12.** Given an operator viewing enrichment X in the Admin Lab, when they follow
  the Learn App link, then the expedition view for X opens under learner reference `admin`.
- AE6. **Covers R10.** Given a learner typed a topic and filled the optional domain input with
  "biology", when they press create, then no inference call occurs and charting starts with
  "biology".

---

## Scope Boundaries

**Deferred for later**

- Doc upload (PDF/markdown) as a charting door.
- Learner-background gathering in any form — profile questions, a course-level depth parameter, or
  calibration seeding — until real learners show mis-leveled courses.
- Fog-triggered remediation content (Learner-Scoped Scaffold, ADR-0032 support ladder).
- The full terrain/map art pass — stage two of the accepted map-as-trail direction.

---

## Dependencies / Assumptions

- Domain inference adds one small LLM call routed through a LiteLLM alias with a domain-neutral
  prompt (AGENTS rules 5 and 17).
- Existing learner theme tokens (a `--journal-fog` variable already exists) and the Motion
  dependency cover fog and sheet animation; no new libraries.
- The stage-copy mapping is UI copy in the learner vocabulary layer; persisted operation timelines
  are untouched.
- `admin` is an ordinary `learner_state_ref` value; operator play-test state accumulates under it,
  separate from real learners.

---

## Outstanding Questions

**Deferred to Planning**

- When domain inference fires in the form (debounced as the learner types, or an explicit step) and
  the fallback when the inference call fails.
- Whether the activity sheet and the journal render as routes or overlays.
- The concrete fiction-voiced wording set for stage copy.

---

## Sources / Research

- Current state (verified 2026-07-04): inline stack plus separate journal/map routes in
  `apps/admin-lab/src/app/learn/[learnerStateRef]/expedition/[enrichmentId]/page.tsx`; form fields
  in `apps/admin-lab/src/components/learn/ExpeditionEntry.tsx`; raw stage strings rendered by
  `apps/admin-lab/src/components/learn/ChartingProgress.tsx` from the persisted stage timeline with
  no label mapping anywhere; learner graph map in
  `apps/admin-lab/src/components/learn/SurveyMap.tsx` (Cytoscape); copy layer in
  `apps/admin-lab/src/components/learn/vocabulary.ts`; fog token in
  `apps/admin-lab/src/components/learn/theme.css`.
- Stage identifiers a learner currently sees during charting: `concept-set-synthesis`,
  `knowledge-boundary-probe`, `grounding-generation`, `prerequisite-ordering`,
  `intrinsic-difficulty`, `persist`, then `load`, `concept-lesson-generation`,
  `study-item-generation`, `impostor-generation`.
- Declared Domain is required at persistence
  (`packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`,
  `learner_expeditions.declared_domain NOT NULL`), which is why inference precedes creation.
- Shipped v1 surface: the Expedition Journal completed outcome in
  [TODO](../plans/TODO.md) (its brainstorm was folded and deleted on completion); game-UX policy:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
