export type MatchedPair = { promptId: string; matchId: string };

export type MatchingProgress = {
  lockedPromptIds: Set<string>;
  lockedMatchIds: Set<string>;
  complete: boolean;
};

export function matchingProgress(matchedPairs: readonly MatchedPair[], totalPairs: number): MatchingProgress {
  const lockedPromptIds = new Set(matchedPairs.map((pair) => pair.promptId));
  const lockedMatchIds = new Set(matchedPairs.map((pair) => pair.matchId));
  return {
    lockedPromptIds,
    lockedMatchIds,
    complete: totalPairs > 0 && matchedPairs.length === totalPairs
  };
}

export function canTryMatchingPair(input: {
  disabled: boolean;
  pending: boolean;
  complete: boolean;
  lockedPromptIds: ReadonlySet<string>;
  lockedMatchIds: ReadonlySet<string>;
  promptId: string;
  matchId: string;
}): boolean {
  return !input.disabled
    && !input.pending
    && !input.complete
    && !input.lockedPromptIds.has(input.promptId)
    && !input.lockedMatchIds.has(input.matchId);
}
