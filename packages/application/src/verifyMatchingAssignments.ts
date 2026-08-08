import type { MatchingAssignmentFit, MatchingAssignmentVerdict, MatchingItem } from "@lrnki/domain-core";
import type { MatchingAssignmentVerificationPort, StudyItemGroundingPassage } from "@lrnki/ports";
import { normalizeOptionText } from "./optionSelectGuard";
import {
  verifyGuardedItems,
  type VerificationOutcome,
  type VerificationRegeneration
} from "./verifyGuardedItems";

// Matching Assignment Verification (plan 2026-08-07-001 D5/D6/D7, amending ADR-0026).
//
// Matching is the one item type outside Study Item Key Verification, and deliberately so: its
// harm class is not a false claim but an AMBIGUOUS BOARD. When two matches both answer one
// prompt, a learner who knows the material is marked wrong — and every one of those pairs is
// individually TRUE, so a per-candidate claim judge sees nothing. This phase asks the question
// that does see it: for every (prompt, match) cell of the N×N grid, does that match fit that
// prompt? The deterministic rule below then proves assignment uniqueness over the answer.
//
// The two-round control flow is `verifyGuardedItems`', shared with key verification (rule 18);
// this module owns the presentation, the rule, and the disposition.

export type MatchingAssignmentRequest = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  question: string;
  prompts: { ordinal: number; text: string }[];
  matches: { ordinal: number; text: string }[];
  groundingPassages: StudyItemGroundingPassage[];
  siblings: { label: string; snippet: string }[];
};

export type MatchingAssignmentSubject = {
  request: MatchingAssignmentRequest;
  item: MatchingItem;
  // Presentation index -> pair ordinal for the matches, the inverse of the shuffle below. The
  // judge echoes PRESENTATION indices; every rule here works in pair-ordinal space.
  matchPairOrdinals: readonly number[];
  regenerate: (feedback: string) => Promise<VerificationRegeneration<MatchingAssignmentSubject>>;
};

export type MatchingAssignmentSpec = {
  verifier: MatchingAssignmentVerificationPort;
  concurrency?: number;
};

// How the board is shown to the judge.
//
// Prompts keep their pair ordinals. Matches are sorted by normalized text and RENUMBERED by
// sorted position, so neither the listing order nor the printed number tells the judge which
// match a prompt is keyed to. Both halves of that are load-bearing: an aligned listing leaks the
// key by position, and attaching the pair ordinal leaks it more legibly still — a judge that can
// read the key off the prompt has no reason to test any other cell, and the grid degenerates
// into a rubber stamp of the diagonal. The sort keeps the permutation a deterministic function of
// the item, so a re-run presents the same board and a disagreement is a real disagreement rather
// than a reshuffle. Ties (equal normalized text) cannot occur: the guard rejects duplicate
// matches before this phase ever sees the item.
export function matchingAssignmentPresentation(item: MatchingItem): {
  prompts: { ordinal: number; text: string }[];
  matches: { ordinal: number; text: string }[];
  matchPairOrdinals: number[];
} {
  const matchPairOrdinals = item.pairs
    .map((pair, pairOrdinal) => ({ pairOrdinal, sortKey: normalizeOptionText(pair.matchText) }))
    .sort((left, right) => (left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0))
    .map((entry) => entry.pairOrdinal);
  return {
    prompts: item.pairs.map((pair, ordinal) => ({ ordinal, text: pair.promptText })),
    matches: matchPairOrdinals.map((pairOrdinal, presentationIndex) => ({
      ordinal: presentationIndex,
      text: item.pairs[pairOrdinal].matchText
    })),
    matchPairOrdinals
  };
}

// A cell the judge never returned is `unclear`, never an error and never a veto — the same
// rule-16 reading key verification applies to a missing ordinal. An N×N grid is exactly where
// this matters: a short response leaves whole rows unjudged, and "the judge did not say" is as
// weak a guarantee as "the judge was unsure".
export function assignmentFitFor(
  verdicts: readonly MatchingAssignmentVerdict[],
  promptOrdinal: number,
  matchPresentationIndex: number
): MatchingAssignmentFit {
  return verdicts.find(
    (verdict) => verdict.promptOrdinal === promptOrdinal && verdict.matchOrdinal === matchPresentationIndex
  )?.verdict ?? "unclear";
}

function assignmentReasonFor(
  verdicts: readonly MatchingAssignmentVerdict[],
  promptOrdinal: number,
  matchPresentationIndex: number
): string {
  return verdicts.find(
    (verdict) => verdict.promptOrdinal === promptOrdinal && verdict.matchOrdinal === matchPresentationIndex
  )?.reason.trim() || "no reason given";
}

// The assignment-uniqueness rule (D5). Admit iff no NON-KEYED cell is `fits` and no KEYED cell is
// `does_not_fit`; `unclear` never vetoes.
//
// Both halves are needed and they catch different defects. A non-keyed `fits` is the ambiguity
// class this plan exists for — the learner who pairs defensibly and is graded wrong. A keyed
// `does_not_fit` is a MIS-KEYED pair, which the grid exposes for free and a per-prompt fit-set
// would not. Neither half is affirmative in the impostor sense: an all-`unclear` grid admits,
// because matching's unavailable-judge disposition is pass-through (D6) and a rule that demanded
// proof of fit would subtract items on judge silence.
export function matchingAssignmentVetoReason(
  subject: { item: MatchingItem; matchPairOrdinals: readonly number[] },
  verdicts: readonly MatchingAssignmentVerdict[]
): string | null {
  const offenders: string[] = [];
  subject.item.pairs.forEach((pair, promptOrdinal) => {
    subject.matchPairOrdinals.forEach((pairOrdinal, presentationIndex) => {
      const fit = assignmentFitFor(verdicts, promptOrdinal, presentationIndex);
      const reason = assignmentReasonFor(verdicts, promptOrdinal, presentationIndex);
      const matchText = subject.item.pairs[pairOrdinal].matchText;
      if (pairOrdinal === promptOrdinal) {
        if (fit === "does_not_fit") {
          offenders.push(`the keyed match "${matchText}" was judged not to fit its own prompt "${pair.promptText}" (${reason})`);
        }
        return;
      }
      if (fit === "fits") {
        offenders.push(`match "${matchText}" also fits prompt "${pair.promptText}", which is keyed to "${pair.matchText}" (${reason})`);
      }
    });
  });
  return offenders.length
    ? `matching assignment verification rejected the item: ${offenders.join("; ")}. Rewrite so every prompt names an aspect with exactly one defensible match and no match answers another prompt.`
    : null;
}

export async function verifyMatchingAssignments(
  subjects: readonly MatchingAssignmentSubject[],
  spec: MatchingAssignmentSpec
): Promise<VerificationOutcome<MatchingItem>[]> {
  return verifyGuardedItems<MatchingAssignmentSubject, MatchingAssignmentVerdict[], MatchingItem>(subjects, {
    ...(spec.concurrency === undefined ? {} : { concurrency: spec.concurrency }),
    judge: (subject) => spec.verifier.verify(subject.request),
    vetoReason: matchingAssignmentVetoReason,
    // D6: an unreachable judge admits the item UNVERIFIED. That is matching's status quo — every
    // pair still carries a verbatim mechanical anchor, because matching never opted into the
    // generated-passage citation fallback (D8), and its worst failure is a `partial` grade rather
    // than a taught falsehood. Dropping instead would gut a third of the bank under the upstream
    // throttling real traffic has already shown. This extends ADR-0026's harm asymmetry rather
    // than contradicting it: impostor drops because a true "lie" teaches a falsehood; matching
    // does not, so it passes through.
    onUnavailable: (subject) => ({ admitted: true, item: subject.item })
  });
}
