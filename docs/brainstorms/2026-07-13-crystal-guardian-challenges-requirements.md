---
status: accepted
---

# Crystal Guardian Challenges — Accepted Requirements

## Problem

Passing individual Study Items currently grows concept crystals, but the learner has no
scope-shaped retrieval challenge that proves those crystals can be recalled together. The resulting
completion moment is visually pleasant but does not ask the learner to defend what they learned.

The new recall challenge must make a Leg and the whole Topic Expedition culminate in a stimulating,
mastery-aligned event without turning a challenge miss into lost Concept Mastery or blocking the
next learning step. The reward is earned only by completing the challenge; the app must never grant
the reward because no challenge content was available.

## Actors

- **A1 — Learner.** Has passed neutral Study Items in a Topic Expedition and reaches the end of a
  Leg or the summit of the Expedition.
- **A2 — Content operator.** Uses real-use evidence to detect a Leg or Expedition that cannot offer
  a legitimate Guardian lineup because its neutral Study Item Bank is too sparse.

## Key flows

- **F1 — Leg arrival.** Completing an eligible Leg reveals its Crystal Guardian and offers
  `Face the Guardian` or `Return to trail`; returning leaves a persistent Guardian node beside the
  unfused Leg. A zero-item Leg reveals the unavailable challenge state instead of a face/reward
  action.
- **F2 — Guardian duel.** The learner breaks one Guardian ward per correct recall. A miss makes the
  Guardian strike the learner's crystal shield, shows corrective feedback, and returns the item
  later.
- **F3 — Last Stand.** Exhausting the shield pauses normal attacks. Correctly recovering a missed
  item restores one shield segment, breaks that item's ward, and resumes the duel; another miss
  keeps the learner in Last Stand.
- **F4 — Retreat and resume.** The learner can leave and later resume the exact lineup, ward state,
  shield state, and recovery queue. There is no automatic restart or defeat reset.
- **F5 — Leg fusion.** Winning the Leg Guardian permanently fuses that Leg's already-solid concept
  crystals into a higher-order formation.
- **F6 — Expedition culmination.** After every Leg formation is earned, an Expedition Guardian at
  the summit samples the whole Expedition. Victory binds the Leg formations around a summit
  keystone.
- **F7 — Rematch.** A defeated Guardian remains available for later rematches. Rematches rotate
  coverage but cannot duplicate or revoke the permanent formation reward.

## Requirements

### Challenge and reward

- **R1 — Two earned challenge tiers.** A Leg Guardian challenges one completed Expedition Section;
  an Expedition Guardian challenges the completed Topic Expedition. The Leg reward is the Leg
  formation, and the Expedition reward is the summit keystone and bound formation.
- **R2 — No challenge, no reward.** A first-win Guardian requires at least one eligible passed Study
  Item. Five Leg rounds and seven Expedition rounds are maxima, not minimums; use every eligible
  item when fewer exist. With zero eligible items, show that no Guardian challenge is available and
  grant no formation. Treat this as a content-coverage defect for A2 rather than inventing a task or
  silently awarding the reward. The Expedition Guardian remains unavailable until every Leg
  formation has actually been won.

### Eligibility and selection

- **R3 — Neutral, passed-item eligibility.** A lineup may contain only current neutral Study Item
  Bank items whose latest acquisition-grade result is correct when the fight is created. Calibration
  known-skips, lesson-only nodes, learner-scoped Support Steps, and any other non-neutral evidence
  are excluded. The created lineup is a durable snapshot and remains playable if current mastery or
  bank supersession changes later.
- **R4 — Coverage-first selection.** Prefer distinct concepts before taking a second item for one
  concept. A Leg lineup includes its milestone concept whenever that concept has an eligible item.
  An Expedition lineup includes its summit concept whenever eligible, then spreads coverage across
  Legs before repeats. Prior Guardian history rotates equally eligible concepts on later fights;
  stable server-side tie-breaking makes a created lineup reproducible. Never select weakness-first
  or use client-side random draws.
- **R5 — Every neutral item type.** Option Select, Matching, and Impostor items may mix in one duel.
  The server owns grading and never sends pre-answer keys, future-item keys, or raw keyed items.
  After committing an attempt it may return corrective feedback for that current item. Every
  Matching pair attempt is idempotently checked and recorded as part of the active fight, so a
  client cannot omit an earlier wrong pair from its completion result. A Matching round is correct
  only when the board is completed without a wrong pair; a completed board with any wrong pair is
  one missed round and is reshuffled when it returns.

### Combat and lifecycle

- **R6 — Recovery gauntlet.** A Guardian begins with three learner shield segments and one ward per
  selected item. A correct response breaks that item's ward. A miss removes one shield segment,
  provides immediate corrective feedback, and queues the still-unbroken ward after other unresolved
  items where possible. Every selected ward must eventually be broken by a correct response. Shield
  exhaustion enters Last Stand as described in F3; it never causes death, mastery loss, reward loss,
  or a full restart.
- **R7 — No correctness timer.** Response time is not visible as pressure and has no effect on
  correctness, damage, survival, selection, or reward. A bounded client-observed duration may be
  recorded as non-authoritative Flow evidence for later analysis.
- **R8 — Durable, idempotent lifecycle.** The server owns the lineup, current turn, history, and
  lifecycle. At most one active fight exists for a learner and scope. Retrying one network request
  cannot record two responses. Retreat/resume preserves the exact fight. Abandoning an active fight
  and creating a fresh one requires explicit learner confirmation.

### Learning and reward isolation

- **R9 — Challenge evidence is not acquisition evidence.** Guardian answers are durable and
  queryable, but never enter the neutral acquisition `response_log`, count toward Concept Mastery,
  award learning points, or alter prerequisite access. A challenge miss cannot unmaster a concept,
  and a challenge recovery cannot master one.
- **R10 — Challenge gates reward, not learning.** Finishing the Leg's normal Study Sessions keeps
  the next prerequisite-valid learning stop available even if its Guardian is postponed. Only the
  Leg formation and the dependent Expedition Guardian remain locked.
- **R11 — Permanent, singular reward.** The first victory is the sole durable formation event for
  that scope. Later study misses and Guardian rematches cannot dim, revoke, duplicate, or re-award
  it. A rematch victory may replay a celebration without changing durable reward state.

### Learner experience

- **R12 — Expedition-owned entry and return.** The Leg arrival is offered immediately after the
  final capstone, while a persistent trail node makes postponement and exact resume discoverable.
  The Expedition Guardian occupies the summit. A completed Guardian node remains available as a
  rematch entry.
- **R13 — Stimulating but restorative metaphor.** The Learner App presents a `Crystal Guardian`
  duel: correct recall breaks wards; a miss triggers a Guardian counterattack against the learner's
  crystal shield; Last Stand lets the learner repair the shield through recall. The Guardian is not
  an enemy person and the learner never dies. Durable identifiers and application contracts remain
  neutral and plain; themed vocabulary is downstream presentation only.
- **R14 — Transferable visual treatment.** Build the Guardian, wards, shield, formations, and
  keystone from app-native vector/primitive geometry and the existing crystal visual language. Use
  restrained event-bound ward-shatter, shield-crack, Guardian-strike, Last-Stand, and fusion motion,
  selective semantic haptics, and equivalent reduced-motion states. Do not create a disposable
  raster character, cinematic, or combat subsystem.

### Consolidation, future scope, and evidence

- **R15 — One recall-challenge path.** Crystal Guardian Challenges supersede the global Crystal
  Duel. Remove the Duel's timer, simulated rival, unlock splash, grade/win API, award/badge,
  navigation, vocabulary, and client-local unlock memory in the same implementation. Weekly podium
  behavior remains.
- **R16 — Support Paths deferred.** Version one challenges neutral concept Study Items only. A
  future change may give learner-scoped Support Steps a richer typed Study Item set and then include
  completed visible Support Paths in fixed-budget Guardian selection; the current single inline
  generated option is not sufficient evidence for this challenge.
- **R17 — Flow evidence.** Persist enough lifecycle evidence to derive starts, retreats, resumes,
  abandons, victories, item correctness, recovery depth, Last-Stand use, and bounded response
  duration. These signals support later challenge-curve measurement and never become learning
  correctness policy by themselves.

## Acceptance examples

- **AE1 — Earned Leg formation.** A Leg has three eligible passed items. The learner answers all
  three correctly, wins, and sees its solid crystals fuse. The next Leg was already available from
  normal mastery; only the formation changed.
- **AE2 — Miss and recovery.** The learner misses one item, sees corrective feedback and a shield
  crack, answers other unresolved items, then answers the queued item correctly. Its ward breaks and
  victory occurs only after every selected item has a correct Guardian answer.
- **AE3 — Last Stand.** Three misses exhaust the shield. A Last-Stand miss keeps Last Stand active;
  a later correct response to a queued item restores one shield segment, breaks that ward, and
  returns the learner to normal duel flow.
- **AE4 — Exact resume and idempotency.** The learner retreats with two wards and one shield segment
  remaining. Reopening the Guardian shows exactly that state. Replaying the most recent HTTP answer
  request does not consume another shield segment or append another answer.
- **AE5 — Challenge isolation.** Starting, missing, recovering, and winning a Guardian leaves the
  learner's neutral `response_log`, Concept Mastery, and learning points byte-for-byte unchanged.
- **AE6 — Sparse content.** A Leg with two eligible items offers a two-ward Guardian. A Leg with no
  eligible item explains that its challenge is unavailable, grants no formation, and prevents the
  Expedition Guardian from unlocking.
- **AE7 — Expedition victory.** Every Leg formation is won. The Expedition Guardian uses no more
  than seven items, includes the eligible summit, spreads the remaining budget across Legs, and on
  victory binds the Leg formations around one permanent keystone.
- **AE8 — Rematch.** A learner reopens a won Leg Guardian. The fresh lineup uses prior history to
  rotate equally eligible concepts. Winning celebrates again but creates no second reward.
- **AE9 — Accessibility.** At compact mobile dimensions, at enlarged text, and with reduced motion,
  every ward/shield/Last-Stand state, answer action, retreat action, and recovery explanation remains
  perceivable without depending on animation, color, or haptics alone.

## Scope boundaries

### Included

- Leg and Expedition Guardian lifecycle, persistence, selection, grading, recovery, resume, rematch,
  reward projection, trail entry, summit entry, visual feedback, and Flow evidence.
- All three existing neutral Study Item types.
- Hard replacement and deletion of the redundant Crystal Duel path.
- Hard reset of the single initial migration during development.

### Deferred

- Learner-scoped Support Path Study Item expansion and Guardian inclusion.
- Difficulty adaptation, weakness-first selection, correctness timers, mastery decay, formation
  dimming, challenge leaderboards, consumable currency, or repeat-win material rewards.
- Generating special boss-only learning content to compensate for a sparse neutral bank.

## Decision rationale and sources

- The reward binds already-solid concept crystals into a new higher-order formation; it does not
  imply that pre-challenge crystals were fake, unstable, or unearned.
- A Guardian creates stakes through protect-and-recover play while keeping failure corrective rather
  than punitive. This is consistent with [Ring Fit Adventure's exercise-as-attack/defense and boss
  culmination](https://www.nintendo.com/au/games/nintendo-switch/ring-fit-adventure/) and avoids the
  durable party-damage pressure described by [Habitica](https://habitica.com/static/faq).
- The all-selected-items-correct-with-retry structure follows the retrieval-and-correction shape
  reported for educational level bosses in [Buis et al.](https://arxiv.org/abs/1410.3025), without
  importing that prototype's timer or disposable game shell.
- Product language and projection boundaries follow [CONTEXT.md](../../CONTEXT.md),
  [ADR-0002](../adr/0002-define-learner-neutral-core-concept-graph.md),
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md),
  [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md),
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md), and
  [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md).

## Outstanding questions

None. Implementation details are owned by the linked ready plan.
