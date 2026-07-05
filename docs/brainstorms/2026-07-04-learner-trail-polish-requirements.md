---
date: 2026-07-04
topic: learner-trail-polish
---

# Learner App — trail polish: opaque surfaces, honest icons, linear flow, journal retirement

## Summary

Fix the real-use defects found on the shipped checkpoint trail and tighten its game loop: portal
surfaces (popover, activity sheet) become opaque; answering is one tap (no Check button) with
grounded feedback for every item type; every stop keeps its item-type icon and signals completion
by fill instead of swapping to a checkmark; the "next" pointer and Continue follow the single
displayed trail order; theory reads persist so Field notes can complete; expedition rows show
domain and passed/left progress; and the separate Journal archive route is deleted — reviewing a
mastered concept happens by reopening its stops on the trail.

---

## Problem Frame

Real use of `/learn/admin/expedition/aa0e5b08-…` surfaced fourteen frictions:

1. The concept-group popover renders with no background.
2. Study-item and theory sheets render transparent with a near-unreadable contrast ratio.
3. Questions require select **then** Check — a redundant second action.
4. Wrong/right answers give no explanatory feedback (option-select has none at all).
5. Completed stops swap their item-type icon for a checkmark, erasing what the stop is.
6. Reopening an already-completed activity gives no completed indication.
7. Continue closes the sheet back to the trail instead of opening the next activity.
8. Active expeditions show no progress (items passed/left, progress indicator).
9. Expedition list rows do not show the Declared Domain.
10. Concept completion uses "Uncut"/"Collected" text labels instead of icon state.
11. The pulsing "next" highlight disagrees with the visible trail order (Field notes in
    "Probability foundations" highlighted while "Data types and structures" is the next unanswered
    work).
12. The expedition target heading truncates instead of wrapping.
13. The Journal archive has no back navigation.
14. The Journal archive's purpose is unclear — it duplicates review and collection.

Root causes established by inspection:

- **1–2**: every `--journal-*` CSS variable is scoped to `.learn-journal`, but base-ui Popover and
  Sheet render through a Portal into `document.body` — outside that scope — so
  `bg-[color:var(--journal-panel)]` resolves to nothing and falls through to translucent defaults.
- **11**: two independent causes. The next-pointer follows
  `classification.selectedFrontierTarget` (a readiness/difficulty-ranked pick) which can disagree
  with the flattened trail the learner sees; and a theory stop can never reach `complete` because
  nothing records that a lesson was read, so the pulse parks on Field notes indefinitely.
- **4**: `option_select` items carry no explanation content (impostor already has `reveal`), so
  feedback needs a generated, grounded explanation field — a Study Item Bank content change.

---

## Key Decisions

- **Delete the Journal archive route.** It is the parallel collection surface
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) warns
  against. Reviewing a mastered concept happens by reopening its completed stops on the trail; the
  gem count moves into the trail header. This supersedes the earlier "journal absorbs the map's
  souvenir role" decision in
  [2026-07-04-learner-app-map-center-ux-requirements.md](2026-07-04-learner-app-map-center-ux-requirements.md).
  Task 13 (back button) becomes moot.
- **Generate option-select explanations in the bank.** Extend the option-select item content
  ([ADR-0026](../adr/0026-typed-study-item-bank.md)) with a grounded per-item explanation shown
  after grading, symmetric with impostor `reveal`. Prompts stay domain-neutral (rule 17). Existing
  banks are regenerated after a DB hard reset (rules 8–9).
- **Persist a lesson-read marker.** A non-graded, idempotent per-(learner, node) mark — the
  mutable-state shape of `calibration_verdicts`, not a Response Log row (the log stays
  graded-only). ADR-0032 already names segment completion a baseline flow signal;
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md) forbids grading reads, not tracking
  them. Theory stops complete when read; reopening shows the completed state.
- **The next-pointer and Continue follow displayed trail order.** Next = first incomplete,
  unlocked stop in the flattened trail; Continue inside the sheet opens exactly that stop,
  returning to the trail only at a concept's gem capstone. `projectStatefulLearnerPath` already
  orders concepts topologically with an ascending-difficulty tiebreak, so the displayed order is
  already easiest-first within prerequisite constraints — no reordering work is needed, only one
  source of truth for the highlight.
- **Submit on select.** Selecting an option grades immediately; the Check button is deleted. The
  learner's tap is the commitment.
- **Icons carry identity; fill carries state.** Every stop always shows its item-type icon
  (theory/question/impostor/gem); completion is a fill change, not an icon swap. Locked stops keep
  the lock — fogged territory hides identity by design. The concept gem replaces the
  "Uncut"/"Collected" text badge with outline-vs-filled icon state.
- **Theme variables move to `:root`.** The `--journal-*` prefix is collision-free, and portal
  content resolves them wherever it mounts. `.learn-journal` keeps only the page background and
  ink application.
- **Expedition rows get domain and progress.** `declared_domain` is already persisted per
  expedition; progress (study items passed / total, plus a bar) is computed by an application-side
  read over the response log's latest outcomes — never stored.

## Scope

In: the fourteen numbered items above, the lesson-read schema/port/projection, the option-select
explanation generation change with bank regeneration, and deletion of the Journal route with its
components and dead vocabulary.

Out: terrain art for the trail, remediation scaffolds, spaced repetition, difficulty-model changes
(TODO 1), knowledge-boundary calibration (TODO 2), and any Learner-Neutral Core or projection
boundary change.
