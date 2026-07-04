type ActivityPathStep = {
  derivedNodeId: string;
  state: string;
};

type ActivitySegmentRef = {
  item: {
    studyItemId: string;
  };
};

export function selectActivityNodeId(input: {
  path: readonly ActivityPathStep[];
  studySegmentsByNode: Readonly<Record<string, readonly ActivitySegmentRef[]>>;
  answeredStudyItemIds: ReadonlySet<string>;
  selectedFrontierTarget: string | null;
  fallbackTargetDerivedNodeId: string | null;
}): string | null {
  const firstUnansweredUnlocked = input.path.find((step) => {
    if (step.state === "locked") return false;
    return (input.studySegmentsByNode[step.derivedNodeId] ?? []).some(
      (segment) => !input.answeredStudyItemIds.has(segment.item.studyItemId)
    );
  });
  return firstUnansweredUnlocked?.derivedNodeId ?? input.selectedFrontierTarget ?? input.fallbackTargetDerivedNodeId;
}

export function unansweredActivitySegments<T extends ActivitySegmentRef>(
  segments: readonly T[],
  answeredStudyItemIds: ReadonlySet<string>
): T[] {
  return segments.filter((segment) => !answeredStudyItemIds.has(segment.item.studyItemId));
}
