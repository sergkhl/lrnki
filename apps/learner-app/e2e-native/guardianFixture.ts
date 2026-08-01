import {
  foldRecallChallenge,
  projectRecallChallengeView,
  type RecallAnswerFeedback,
  type RecallChallengeView
} from "@lrnki/application";
import type { OptionSelectItem, StudyItem } from "@lrnki/domain-core";
import type { RecallChallengeEvent } from "@lrnki/ports";

// Deterministic five-ward Leg Guardian for the native gate (ADR-0038; Ward Obelisk plan U4).
// The obelisk separates its ward states by fill, facet, gloss and contour weight rather than hue,
// and Android draws those primitives through react-native-svg's native canvas rather than
// Chromium's SVG — so the states have to be reachable on a real APK, not just in the web suite.
//
// This module owns the FIXTURE DATA and the event log only. Every combat rule — queue rotation on
// a miss, the shield floor, the recovery phase edge, the single restored buffer unit on a clean
// recovery answer, and the learner-safe view — comes from the production pure functions above, so
// no rule is represented twice. The one thing decided here is which option is keyed correct, and
// that is read off the item's own `isCorrect` flag rather than restated.

// Fixed so the Maestro flow can deep-link straight to a fight (`lrnki://guardian/<id>`), which keeps
// this block independent of trail-entry navigation the web layers already own. Two scopes, because
// the two duels are supposed to stay shape-distinguishable: a Leg's orange `legWard` diamond at five
// wards, and the summit's pink `summitWard` trident at the seven-ward maximum — the tightest band
// height the body ever renders, and so the hardest case for the facet that separates queued from
// resolved.
export const NATIVE_CHALLENGE_ID = "9a2f0b4c-6d1e-4a35-9c7f-3d2b8e5a1c04";
export const NATIVE_SUMMIT_CHALLENGE_ID = "5b1d7e28-3c46-4f90-a1b5-8e7d0c364a92";

// Anchored to the real captured expedition (`scenario/expedition.json`): its enrichment, section 0's
// milestone "Facilitated diffusion" for the Leg, and its own target node for the summit.
const ENRICHMENT_ID = "012c74c3-c197-43e6-810c-072786ed9ee9";
const LEG_ANCHOR_DERIVED_NODE_ID = "14de0271-b0fd-420b-b0b5-050046739285";
const SUMMIT_ANCHOR_DERIVED_NODE_ID = "fe898a0b-2406-4812-9b4f-a772ac218abb";

function ward(input: {
  index: number;
  derivedNodeId: string;
  question: string;
  explanation: string;
  correct: string;
  distractors: readonly [string, string, string];
}): OptionSelectItem {
  const options = [
    { optionId: `w${input.index}-a`, text: input.correct, isCorrect: true, provenance: "source" as const },
    ...input.distractors.map((text, i) => ({
      optionId: `w${input.index}-${"bcd"[i]}`,
      text,
      isCorrect: false,
      provenance: "generated" as const
    }))
  ];
  return {
    studyItemId: `2a7c1e00-0000-4000-8000-00000000000${input.index}`,
    graphVersionId: null,
    enrichmentId: ENRICHMENT_ID,
    derivedNodeId: input.derivedNodeId,
    groundingProvenance: "source_cep",
    generatingModel: "native-fixture",
    configHash: "native-fixture",
    explorableTerms: [],
    itemType: "option_select",
    question: input.question,
    explanation: input.explanation,
    options
  };
}

// Five wards over the captured expedition's own membrane-transport concepts. Option text is unique
// across the whole lineup so the flow taps by visible copy, never by position or coordinates.
const LINEUP: readonly StudyItem[] = [
  ward({
    index: 1,
    derivedNodeId: "0acbad54-e063-4cd5-9987-f64f7d37f2cb",
    question: "Which process moves water across a selectively permeable membrane?",
    explanation: "Osmosis is the diffusion of water toward the more concentrated solution.",
    correct: "Osmosis carries water toward the more concentrated side",
    distractors: [
      "Pinocytosis pumps water out through a channel",
      "Exocytosis pulls water in through a vesicle",
      "Phagocytosis drags water along a microtubule"
    ]
  }),
  ward({
    index: 2,
    derivedNodeId: "14de0271-b0fd-420b-b0b5-050046739285",
    question: "Which transport mechanism spends ATP to move a solute against its gradient?",
    explanation: "Active transport is the mechanism that consumes ATP to work against a gradient.",
    correct: "Active transport spends ATP against the gradient",
    distractors: [
      "Simple diffusion spends ATP against the gradient",
      "Facilitated diffusion spends ATP against the gradient",
      "Osmotic pressure spends ATP against the gradient"
    ]
  }),
  ward({
    index: 3,
    derivedNodeId: "0d53cdf2-ac47-464b-bc1c-a350235732ba",
    question: "How does a cell take in a large particle it cannot move through a channel?",
    explanation: "Endocytosis wraps the particle in membrane and draws the vesicle inward.",
    correct: "Endocytosis wraps the particle in membrane",
    distractors: [
      "Endocytosis dissolves the particle in the bilayer",
      "Endocytosis splits the particle at the glycocalyx",
      "Endocytosis threads the particle through a pore"
    ]
  }),
  ward({
    index: 4,
    derivedNodeId: "1f4a2c9e-91d2-4e18-9f27-6ab84f1d5c73",
    question: "Which surrounding solution makes a cell lose water and shrink?",
    explanation: "A hypertonic solution holds more solute outside, so water leaves the cell.",
    correct: "A hypertonic solution draws water out",
    distractors: [
      "A hypotonic solution draws water out",
      "An isotonic solution draws water out",
      "A saturated solution draws water out"
    ]
  }),
  ward({
    index: 5,
    derivedNodeId: "3c6e5b81-4a20-4d7f-b0c3-5e9d1a827f46",
    question: "Which membrane property lets some substances cross while blocking others?",
    explanation: "Selective permeability is the property that admits some substances and blocks others.",
    correct: "Selective permeability admits some and blocks others",
    distractors: [
      "Fluid mosaic structure admits some and blocks others",
      "Amphipathic character admits some and blocks others",
      "Membrane potential admits some and blocks others"
    ]
  })
];

// Two more wards so the summit lineup reaches the seven-ward maximum. The summit's lineup spans the
// whole expedition in production, so it legitimately re-fights the Leg's own wards as well.
const EXTRA_WARDS: readonly StudyItem[] = [
  ward({
    index: 6,
    derivedNodeId: "8b3d7f14-2e65-4c09-a3d8-71f0c6b492ae",
    question: "Which protein moves a specific solute down its gradient without spending ATP?",
    explanation: "A carrier protein in facilitated diffusion follows the gradient and needs no ATP.",
    correct: "A carrier protein following the gradient",
    distractors: [
      "A sodium-potassium pump following the gradient",
      "A vesicle coat following the gradient",
      "A cytoskeletal motor following the gradient"
    ]
  }),
  ward({
    index: 7,
    derivedNodeId: "6d90a35c-7b18-4e42-8fa1-0c53d7e28b64",
    question: "What does a vesicle do when a cell exports a large molecule?",
    explanation: "In exocytosis the vesicle fuses with the plasma membrane and releases its cargo.",
    correct: "It fuses with the plasma membrane and releases cargo",
    distractors: [
      "It dissolves in the cytosol and releases cargo",
      "It buds inward from the membrane and releases cargo",
      "It ruptures at the nuclear envelope and releases cargo"
    ]
  })
];

// One fixture challenge: an immutable lineup plus the append-only event log the real store keeps.
// Every rule that turns those events into a state comes from `foldRecallChallenge`, and every rule
// that turns that state into something the client may see comes from `projectRecallChallengeView`.
// The runner spawns a fresh process per run, so each gate run starts at the entry state.
function fixtureChallenge(
  challenge: { challengeId: string; enrichmentId: string; scopeKind: "section" | "enrichment"; scopeAnchorDerivedNodeId: string },
  lineup: readonly StudyItem[]
) {
  const itemById: ReadonlyMap<string, StudyItem> = new Map(lineup.map((item) => [item.studyItemId, item]));
  const entries = lineup.map((item) => ({ studyItemId: item.studyItemId }));
  const events: RecallChallengeEvent[] = [];
  const seenRefs = new Set<string>();

  // No Matching wards in these lineups, so no pair count is ever consulted.
  const fold = () => foldRecallChallenge({ lineup: entries, events, pairCountFor: () => 0 });
  const view = (): RecallChallengeView => projectRecallChallengeView({ challenge, lineup: entries, state: fold(), itemById });

  return {
    view,
    // Mirrors the real answer boundary: turn validity is enforced here, grading is read off the
    // keyed option, and a repeated `attemptRef` replays the committed view with no second feedback.
    answer(input: { attemptRef: string; studyItemId: string; chosenId: string; responseDurationMs: number | null }): GuardianAnswerOutcome {
      if (seenRefs.has(input.attemptRef)) return { answered: true, replayed: true, feedback: null, view: view() };

      const before = fold();
      if (before.phase === "won" || before.abandoned) return { answered: false, refused: "inactive" };
      if (before.unresolvedItemIds[0] !== input.studyItemId) return { answered: false, refused: "out_of_turn" };

      const item = itemById.get(input.studyItemId);
      if (!item || item.itemType !== "option_select") return { answered: false, refused: "not_found" };
      const keyed = item.options.find((option) => option.isCorrect);
      if (!keyed) return { answered: false, refused: "not_found" };

      const correct = input.chosenId === keyed.optionId;
      seenRefs.add(input.attemptRef);
      events.push({
        seq: events.length + 1,
        kind: "selection_answer",
        attemptRef: input.attemptRef,
        studyItemId: input.studyItemId,
        promptId: null,
        chosenId: input.chosenId,
        correct,
        recoveryPhase: before.phase === "recovery",
        responseDurationMs: input.responseDurationMs
      });

      return {
        answered: true,
        replayed: false,
        feedback: { kind: "selection", correct, chosenId: input.chosenId, keyedCorrectId: keyed.optionId },
        view: view()
      };
    },
    lifecycle(input: { kind: "retreat" | "resume" | "abandon"; operationRef: string }): RecallChallengeView {
      if (!seenRefs.has(input.operationRef)) {
        seenRefs.add(input.operationRef);
        events.push({ seq: events.length + 1, kind: input.kind, operationRef: input.operationRef });
      }
      return view();
    }
  };
}

const CHALLENGES = new Map([
  [
    NATIVE_CHALLENGE_ID,
    fixtureChallenge(
      { challengeId: NATIVE_CHALLENGE_ID, enrichmentId: ENRICHMENT_ID, scopeKind: "section", scopeAnchorDerivedNodeId: LEG_ANCHOR_DERIVED_NODE_ID },
      LINEUP
    )
  ],
  [
    NATIVE_SUMMIT_CHALLENGE_ID,
    fixtureChallenge(
      { challengeId: NATIVE_SUMMIT_CHALLENGE_ID, enrichmentId: ENRICHMENT_ID, scopeKind: "enrichment", scopeAnchorDerivedNodeId: SUMMIT_ANCHOR_DERIVED_NODE_ID },
      [...LINEUP, ...EXTRA_WARDS]
    )
  ]
]);

export function guardianView(challengeId: string): RecallChallengeView | null {
  return CHALLENGES.get(challengeId)?.view() ?? null;
}

export type GuardianAnswerOutcome =
  | { answered: false; refused: "not_found" | "out_of_turn" | "inactive" }
  | { answered: true; replayed: boolean; feedback: RecallAnswerFeedback | null; view: RecallChallengeView };

export function answerGuardianSelection(input: {
  challengeId: string;
  attemptRef: string;
  studyItemId: string;
  chosenId: string;
  responseDurationMs: number | null;
}): GuardianAnswerOutcome {
  const challenge = CHALLENGES.get(input.challengeId);
  if (!challenge) return { answered: false, refused: "not_found" };
  return challenge.answer(input);
}

export function applyGuardianLifecycle(input: {
  kind: "retreat" | "resume" | "abandon";
  challengeId: string;
  operationRef: string;
}): { applied: false; refused: "not_found" } | { applied: true; view: RecallChallengeView } {
  const challenge = CHALLENGES.get(input.challengeId);
  if (!challenge) return { applied: false, refused: "not_found" };
  return { applied: true, view: challenge.lifecycle(input) };
}
