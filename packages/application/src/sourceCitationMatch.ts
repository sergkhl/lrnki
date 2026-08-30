import type {
  ConceptLesson,
  EvidenceMatchKind,
  StudyItem,
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
  studyItems?: readonly StudyItem[];
  evidence: readonly ResolvedSourceCitationEvidence[];
}): { lessons: ConceptLesson[]; studyItems: StudyItem[] } {
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
    studyItems: (input.studyItems ?? []).map((item): StudyItem => {
      if (item.itemType === "option_select") {
        return {
          ...item,
          options: item.options.map((option) => ({
            ...option,
            ...(option.citation
              ? { citation: settleCitation(option.citation) }
              : {})
          }))
        };
      }
      if (item.itemType === "matching") {
        return {
          ...item,
          pairs: item.pairs.map((pair) => ({
            ...pair,
            citation: settleCitation(pair.citation) ?? pair.citation
          }))
        };
      }
      return {
        ...item,
        statements: item.statements.map((statement) => statement.isImpostor
          ? statement
          : {
              ...statement,
              citation: settleCitation(statement.citation) ?? statement.citation
            })
      };
    })
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
