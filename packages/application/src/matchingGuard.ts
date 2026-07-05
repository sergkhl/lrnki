import { randomUUID } from "node:crypto";
import {
  type MatchingItem,
  type MatchingItemDraft,
  type MatchingPair
} from "@lrnki/domain-core";
import { normalizeOptionText, resolveGroundingCitation, type StudyItemGuardGrounding } from "./optionSelectGuard";

// Shared with option-select and impostor (rule 18).
export type MatchingGrounding = StudyItemGuardGrounding;

export type MatchingGuardResult =
  | { ok: true; item: MatchingItem }
  | { ok: false; reason: string };

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
    const citation = resolveGroundingCitation(grounding.passages, pair.citation, grounding.derivedNodeId);
    if (!citation) {
      return { ok: false, reason: "matching pair citation does not verify against grounding" };
    }
    pairs.push({ pairId: newPairId(), matchId: newMatchId(), promptText: pair.promptText, matchText: pair.matchText, citation });
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
      question: draft.question,
      pairs
    }
  };
}
