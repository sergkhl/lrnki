import type {
  ConceptLesson,
  EvidenceMatchKind,
  OptionSelectItem,
  StudyItemCitation
} from "@lrnki/domain-core";

// The source-evidence evaluator is the only boundary that has both an asset citation and the
// immutable cited block. Reapply its derived match kind to the artifact without changing any
// learner-visible claim. This is provenance settlement, not model-output repair.
export type ResolvedSourceCitationEvidence = {
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
  matchKind: EvidenceMatchKind;
};

export function settleSourceCitationMatchKinds(input: {
  lessons?: readonly ConceptLesson[];
  optionSelectItems?: readonly OptionSelectItem[];
  evidence: readonly ResolvedSourceCitationEvidence[];
}): { lessons: ConceptLesson[]; optionSelectItems: OptionSelectItem[] } {
  const matchByCitation = new Map(
    input.evidence
      .filter((row): row is ResolvedSourceCitationEvidence & {
        matchKind: "exact" | "normalized";
      } => row.matchKind !== "none")
      .map((row) => [citationKey(row), row.matchKind] as const)
  );
  const settleCitation = (citation: StudyItemCitation | undefined): StudyItemCitation | undefined => {
    if (citation?.provenance !== "source") return citation;
    const matchKind = matchByCitation.get(citationKey(citation));
    return matchKind ? { ...citation, matchKind } : citation;
  };

  return {
    lessons: (input.lessons ?? []).map((lesson) => ({
      ...lesson,
      sections: lesson.sections.map((section) => ({
        ...section,
        ...(section.citation
          ? { citation: settleCitation(section.citation) }
          : {})
      }))
    })),
    optionSelectItems: (input.optionSelectItems ?? []).map((item) => ({
      ...item,
      options: item.options.map((option) => ({
        ...option,
        ...(option.citation
          ? { citation: settleCitation(option.citation) }
          : {})
      }))
    }))
  };
}

function citationKey(input: {
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
}): string {
  return JSON.stringify({
    sourceResourceId: input.sourceResourceId,
    sourceBlockId: input.sourceBlockId,
    evidenceQuote: input.evidenceQuote
  });
}
