import { randomUUID } from "node:crypto";
import {
  type MatchingItem,
  type MatchingItemDraft,
  type MatchingPair
} from "@lrnki/domain-core";
import { normalizeOptionText, resolveGroundingCitation, type StudyItemGuardGrounding } from "./optionSelectGuard";
import { validateItemExplorableTerms } from "./explorableTerms";

// Shared with option-select and impostor (rule 18).
export type MatchingGrounding = StudyItemGuardGrounding;

export type MatchingGuardResult =
  | { ok: true; item: MatchingItem }
  | { ok: false; reason: string };

// Containment is the one subclass of "solvable by surface overlap" that is provable rather than
// judged, so it is the only part of the cueing defect a deterministic veto may own (rule 16); the
// paraphrase subclass belongs to the generation prompt. It is computed over word sequences, not
// over `normalizeOptionText`'s characters, because that string keeps punctuation and does not know
// word boundaries: a raw `includes` both over-fires on subwords (an "ion" prompt inside an
// "ionization…" match) and under-fires on trailing punctuation ("…runtime" inside "…runtime,").
// Neither of those is provable overlap-solvability, and rule 16 forbids a veto that guesses.
function containmentWords(text: string): string[] {
  return normalizeOptionText(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
}

function containsWordSequence(outer: string[], inner: string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false;
  return outer.some((_, start) =>
    start + inner.length <= outer.length && inner.every((word, offset) => outer[start + offset] === word)
  );
}

// True when one side displays the other's whole phrase, in order and contiguously — the shape a
// learner can pair off by reading alone.
function matchingPairSidesContainOneAnother(promptText: string, matchText: string): boolean {
  const promptWords = containmentWords(promptText);
  const matchWords = containmentWords(matchText);
  return containsWordSequence(matchWords, promptWords) || containsWordSequence(promptWords, matchWords);
}

export function validateMatchingItem(
  draft: MatchingItemDraft,
  grounding: MatchingGrounding,
  newPairId: () => string = randomUUID,
  newMatchId: () => string = randomUUID
): MatchingGuardResult {
  if (draft.pairs.length < 3 || draft.pairs.length > 4) {
    return { ok: false, reason: `matching requires 3 or 4 pairs, got ${draft.pairs.length}` };
  }
  const promptTexts = draft.pairs.map((pair) => normalizeOptionText(pair.promptText));
  const matchTexts = draft.pairs.map((pair) => normalizeOptionText(pair.matchText));
  if (new Set(promptTexts).size !== promptTexts.length) return { ok: false, reason: "matching prompts must be distinct" };
  if (new Set(matchTexts).size !== matchTexts.length) return { ok: false, reason: "matching matches must be distinct" };

  const pairs: MatchingPair[] = [];
  for (const pair of draft.pairs) {
    if (normalizeOptionText(pair.promptText) === normalizeOptionText(pair.matchText)) {
      return { ok: false, reason: "matching prompt and match text must differ" };
    }
    if (matchingPairSidesContainOneAnother(pair.promptText, pair.matchText)) {
      return { ok: false, reason: "matching prompt and match must not contain one another" };
    }
    // No `generatedPassageFallback` opt-in: matching carries no key verification (D3), so
    // its citations resolve through the verbatim rungs alone. Forgiving a paraphrase without
    // a judge behind it would leave the claim attributed to nothing checkable (D6).
    const resolved = resolveGroundingCitation(grounding.passages, pair.citation, grounding.derivedNodeId);
    if (!resolved) {
      return { ok: false, reason: "matching pair citation does not verify against grounding" };
    }
    pairs.push({ pairId: newPairId(), matchId: newMatchId(), promptText: pair.promptText, matchText: pair.matchText, citation: resolved.citation });
  }

  return {
    ok: true,
    item: {
      itemType: "matching",
      studyItemId: grounding.studyItemId,
      graphVersionId: grounding.graphVersionId,
      enrichmentId: grounding.enrichmentId,
      derivedNodeId: grounding.derivedNodeId,
      groundingProvenance: grounding.groundingProvenance,
      generatingModel: grounding.generatingModel,
      configHash: grounding.configHash,
      ...(grounding.facet ? { facet: grounding.facet } : {}),
      explorableTerms: validateItemExplorableTerms(draft.explorableTerms ?? [], draft.question, grounding.canonicalLabel),
      question: draft.question,
      pairs
    }
  };
}
