# Plan 2026-07-10-001 — Learner goal gradient, constructive Crystal Vista, and duel arena

Status: ready.

Accepted framing and requirements:
[2026-07-10 brainstorm](../brainstorms/2026-07-10-learner-goal-gradient-requirements.md) (R1–R7 and
the rejected/deferred ledgers). Policy:
[ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (incl. the
shareable-achievement paragraph added with this plan),
[ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md),
[ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md),
[ADR-0026](../adr/0026-typed-study-item-bank.md),
[ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

## Flow design gate (ADR-0032, answered before implementation)

- **Player-visible goals:** next stop (unchanged) → announced leg goal (banner: crystals guarding a
  named milestone) → summit purpose (journal teaser + header line, "Summit push" final-leg state,
  trail terminus count) → formation build (fused leg clusters, summit keystone).
- **Same as the learning goals:** each tier is a re-framing of mastery structure — a leg's goal *is*
  its milestone's prerequisites; a fused cluster *is* a fully-mastered section; the summit count *is*
  remaining trail mastery. No goal has degrees of freedom independent of mastery.
- **Distractions:** the memory door is review navigation, not a collection game; fog naming follows
  one rule (nameable in fog ⇔ announced goal) so reveals never become a separate hunt; the duel stays
  grade-only and stake-free on loss.
- **Challenge curve:** unchanged in this plan (measure-first, brainstorm R7); the support ladder and
  Leg Trial belong to the follow-up informed by the measured signals.
- **Pleasures:** Challenge (summit push, duel), Discovery (fog reveal, memory door, vein map),
  Sensation (fusion celebration, keystone).
- **Focused signals:** existing only — `response_log` correctness / `attempt_seq` / timestamps,
  lesson reads, calibration verdicts.

## Design decisions

1. The layer purpose is a learner-neutral capability statement stored in plain register; the Learner
   App themes it at render. Generated copy keys only to the enrichment and to concepts — never to
   Expedition Sections, which are read-time derivations.
2. Fail-open everywhere: an enrichment without a purpose row renders the mechanical template
   ("Summit: {label} — {n} legs, {m} crystals"), so pre-existing enrichments keep working.
3. Nameable-in-fog ⇔ announced goal (summit + section milestones; frontier always nameable; ordinary
   locked crystals stay mystery shapes).
4. No new persistence beyond one purpose row per enrichment; clusters, fusion, naming tiers, and all
   counts derive from the Study Session projection every surface already reads.

## Implementation units

### U1 — Layer-purpose descriptor and plumbing

- New `prompts/layer-purpose.prompt` + typed rim in `packages/infrastructure-litellm` (sibling of
  `conceptLessonGenerationAdapters.ts`), executed by the generic forced-tool executor. Prompt stays
  domain-neutral (AGENTS rule 17); the rim caps the purpose at 2 sentences / ~240 chars.
- Stage tag `layer-purpose-generation` registered under `study_items` in
  `OPERATION_TIMELINE_CATALOG` in the same change (ADR-0029; the set-equality catalog test enforces
  it). The study-bank config hash picks the descriptor up mechanically — no hand bump.
- Initial migration gains `enrichment_layer_purposes` (`enrichment_id` PK/FK →
  `graph_enrichments`, `purpose text NOT NULL`, `created_at`); dev DB re-init per AGENTS rules 8/9.
- `generateStudyItemBank` (`packages/application/src/generateStudyItemBank.ts`) runs the stage once
  per bank; a stage failure writes no row and surfaces as an operator-visible stage outcome, never
  fails the bank.
- Reads: the Study Session projection (`getStudySession.ts`) and the journal expeditions read gain
  `layerPurpose: string | null`; `apps/learner-api` responses and the app's typed client/queries
  carry it through.

Acceptance: a real generated expedition persists exactly one purpose row in plain register;
an enrichment without a row renders the template on every surface; catalog + config-hash tests green.

### U2 — Trail goal surfaces (`apps/learner-app`)

- `QuestHeader`: the secondary line becomes "Summit: {label} — {purpose}" (2-line clamp, template
  fallback); the "Expedition" eyebrow swaps to the summit-push copy when
  `currentSectionIndex` is the last section. No new header controls.
- New leg-banner wrapper around `SectionCrystalStrip` at each section divider: leg ordinal, crystal
  count, guarded milestone name ("Leg 2 · 5 crystals guard *Bayes' theorem*"), and a completed state.
- Journal card (`index.tsx`): purpose teaser, 2-line clamp.
- Trail terminus after the last stop: summit visual + remaining-crystal count.
- New vocabulary keys only (ADR-0033); durable identifiers stay plain.

Acceptance: 390 px portrait screenshots show every goal tier visible in advance; the first trail stop
stays above the fold with the merged header line.

### U3 — Constructive Crystal Vista (RN primitives; subsumes the vista re-port TODO)

- Vista surface over the surviving seam `crystalVistaView.ts` (react-native-svg canvas, header
  crystal tally as the door, Reanimated for motion honoring reduced-motion).
- Leg clusters via `sectionIndex`; fused state from `completeSectionIndexes`; a newly complete
  section plays the fusion celebration (local nav memory dedupes it, same pattern as the splash
  seam); the final section's fusion crowns the summit keystone.
- **Memory door** replaces the bare `labelChipFor` chip in the same change (AGENTS rule 18): card =
  concept name + lesson gist + "Examine" navigating to that trail stop. Fogged-milestone variant =
  name + "guarded by Leg {n}", no gist. `CrystalFormationNode` gains `gist`, `isMilestone`,
  `isSummit`; `isNameableCrystal` becomes the tiered rule (design decision 3).
- Composition stays meaningful as a static image (ADR-0032 shareable-achievement policy); the future
  share export and cross-expedition gallery reuse the existing formation-list seam untouched.

Acceptance: completing a leg live plays exactly one fusion; memory door navigates to the correct
stop; naming verified per state (mastered/frontier/known/fogged-milestone/fogged-ordinary/summit).

### U4 — Duel arena re-port (RN primitives)

- New `/duel` route driving the existing pure `duelMachine` over the live `duelSetupQuery`,
  `POST /duel/grade`, and `POST /duel/win` (no API change).
- Journal-screen entry card: locked state renders the existing unlock-progress copy; unlocked state
  starts the duel. The unlock splash stays deferred with the other splashes.

Acceptance: a full duel on the web build against a seeded rival; `response_log` row count
byte-identical across the duel (re-assert KTD3); a win records one idempotent `duel_win`.

### U5 — Real-use gate (rule 14, web-first) and flow evaluation

- Real registration → real topic expedition through production LiteLLM (including the new purpose
  stage) → study across all item types → leg completion → fusion → memory door → duel.
- Flow evaluation from existing signals only (brainstorm R7): correctness rate by difficulty band
  over attempt order (skill-growth proxy), retry depth per item type (too-hard detector), activity
  gaps per expedition (abandonment proxy). Findings recorded as the baseline for the follow-up
  difficulty/Leg Trial work.
- Screenshot evidence for every goal tier + vista states; gate learners deleted afterwards.
- The separate native-device TODO then verifies these surfaces in the same single device pass.

## Deletions in this change-set

- `labelChipFor` bare name chip (replaced by the memory door, U3).
- The standalone "Summit: {label}" header line (merged into the purpose line, U2).
- `docs/brainstorms/2026-07-06-growing-crystals-and-vista-requirements.md` (completed work; its
  view-only-vista clause is superseded by the 2026-07-10 brainstorm; `TODO.md` reference repaired).
