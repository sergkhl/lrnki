import { createHash } from "node:crypto";
import type {
  ConceptLesson,
  ConceptLessonDiagramDescriptor,
  ConceptLessonSection,
  ConceptLessonSectionKind,
  OptionSelectItem,
  StudyItemCitation,
  StudyItemOption
} from "@lrnki/domain-core";

type ClaimTreatment = "context" | "exclude" | "project" | "recurse" | "select_key";

// Compile-time tripwires over every learner-facing source-asset owner. A newly added field cannot
// silently escape material-claim treatment: typechecking fails until its projection disposition is
// named here. Metadata and provenance remain in the raw payload/report even when excluded from a
// verifier claim.
const lessonFieldTreatment = {
  conceptLessonId: "context",
  derivedNodeId: "context",
  graphVersionId: "exclude",
  enrichmentId: "exclude",
  generatingModel: "exclude",
  configHash: "exclude",
  canonicalLabel: "context",
  sections: "recurse",
  explorableTerms: "exclude"
} as const satisfies Record<keyof ConceptLesson, ClaimTreatment>;

const lessonSectionFieldTreatment = {
  kind: "context",
  text: "project",
  items: "project",
  groundingProvenance: "exclude",
  citation: "exclude",
  diagram: "recurse"
} as const satisfies Record<keyof ConceptLessonSection, ClaimTreatment>;

const diagramFieldTreatment = {
  caption: "project",
  spec: "project"
} as const satisfies Record<keyof ConceptLessonDiagramDescriptor, ClaimTreatment>;

const optionSelectFieldTreatment = {
  studyItemId: "context",
  graphVersionId: "exclude",
  enrichmentId: "exclude",
  derivedNodeId: "context",
  groundingProvenance: "exclude",
  generatingModel: "exclude",
  configHash: "exclude",
  facet: "context",
  explorableTerms: "exclude",
  itemType: "context",
  question: "project",
  explanation: "project",
  options: "recurse"
} as const satisfies Record<keyof OptionSelectItem, ClaimTreatment>;

const optionFieldTreatment = {
  optionId: "context",
  text: "project",
  isCorrect: "select_key",
  provenance: "exclude",
  citation: "exclude"
} as const satisfies Record<keyof StudyItemOption, ClaimTreatment>;

void lessonFieldTreatment;
void lessonSectionFieldTreatment;
void diagramFieldTreatment;
void optionSelectFieldTreatment;
void optionFieldTreatment;

export const SOURCE_MATERIAL_CLAIM_PROJECTION = "source_material_claims_v1" as const;
export type SourceMaterialClaimProjection = typeof SOURCE_MATERIAL_CLAIM_PROJECTION;

export type SourceMaterialEvidenceReference = {
  evidenceKey: string;
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
  matchKind: "exact" | "normalized";
  passageKind: "definition" | "mention";
};

export type SourceMaterialClaimSubject =
  | {
      kind: "lesson_section";
      sectionKind: ConceptLessonSectionKind;
      sectionText: string;
    }
  | {
      kind: "lesson_section_item";
      sectionKind: ConceptLessonSectionKind;
      sectionText: string;
      itemText: string;
    }
  | {
      kind: "lesson_diagram_caption";
      sectionKind: ConceptLessonSectionKind;
      sectionText: string;
      caption: string;
    }
  | {
      kind: "lesson_diagram_spec";
      sectionKind: ConceptLessonSectionKind;
      sectionText: string;
      caption: string;
      spec: string;
    }
  | {
      kind: "option_select_question_key";
      question: string;
      keyedAnswer: string;
    }
  | {
      kind: "option_select_explanation";
      question: string;
      keyedAnswer: string;
      explanation: string;
    }
  | {
      kind: "option_select_distractor";
      question: string;
      proposedAnswer: string;
    };

export type SourceMaterialClaim = {
  claimKey: string;
  purpose: "source_support" | "distractor_invalidity";
  assetKind: "concept_lesson" | "option_select";
  assetId: string;
  derivedNodeId: string;
  canonicalLabel: string;
  subject: SourceMaterialClaimSubject;
  statement: string;
  evidenceKeys: string[];
  directEvidenceKeys: string[];
};

export type SourceMaterialClaimSet = {
  projection: SourceMaterialClaimProjection;
  evidence: SourceMaterialEvidenceReference[];
  claims: SourceMaterialClaim[];
};

type CitationOccurrence = {
  citation: Extract<StudyItemCitation, { provenance: "source" }>;
  passageKind: "definition" | "mention";
};

// One lossless projection for every learner-visible material field in the source-ready families.
// Exact payload strings are retained in the typed subject; `statement` is a mechanical rendering
// for a verifier, never a second hand-authored paraphrase of the claim.
export function projectSourceMaterialClaims(input: {
  lessons: readonly ConceptLesson[];
  optionSelectItems: readonly OptionSelectItem[];
  projection?: SourceMaterialClaimProjection;
}): SourceMaterialClaimSet {
  const projection = input.projection ?? SOURCE_MATERIAL_CLAIM_PROJECTION;
  if (projection !== SOURCE_MATERIAL_CLAIM_PROJECTION) {
    throw new Error(`Unknown source material-claim projection ${JSON.stringify(projection)}.`);
  }

  const lessons = [...input.lessons].sort((left, right) =>
    left.conceptLessonId.localeCompare(right.conceptLessonId)
  );
  const optionSelectItems = [...input.optionSelectItems].sort((left, right) =>
    left.studyItemId.localeCompare(right.studyItemId)
  );
  const canonicalLabelByNode = new Map(
    lessons.map((lesson) => [lesson.derivedNodeId, lesson.canonicalLabel] as const)
  );
  const occurrencesByNode = new Map<string, CitationOccurrence[]>();
  const recordCitation = (
    derivedNodeId: string,
    citation: StudyItemCitation | undefined,
    passageKind: "definition" | "mention"
  ): void => {
    if (citation?.provenance !== "source") return;
    occurrencesByNode.set(derivedNodeId, [
      ...(occurrencesByNode.get(derivedNodeId) ?? []),
      { citation, passageKind }
    ]);
  };

  for (const lesson of lessons) {
    for (const section of lesson.sections) {
      recordCitation(
        lesson.derivedNodeId,
        section.citation,
        section.kind === "definition" ? "definition" : "mention"
      );
    }
  }
  for (const item of optionSelectItems) {
    for (const option of item.options) {
      if (option.isCorrect) recordCitation(item.derivedNodeId, option.citation, "mention");
    }
  }

  const evidence: SourceMaterialEvidenceReference[] = [];
  const evidenceKeyByNodeAndSignature = new Map<string, string>();
  const evidenceKeysByNode = new Map<string, string[]>();
  for (const [derivedNodeId, occurrences] of [...occurrencesByNode.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const grouped = new Map<string, CitationOccurrence[]>();
    for (const occurrence of occurrences) {
      const signature = citationSignature(occurrence.citation);
      grouped.set(signature, [...(grouped.get(signature) ?? []), occurrence]);
    }
    const nodeEvidence = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([signature, values]): SourceMaterialEvidenceReference => {
        const citation = values[0]!.citation;
        const passageKind: SourceMaterialEvidenceReference["passageKind"] = values.some((value) => value.passageKind === "definition")
          ? "definition"
          : "mention";
        const reference = {
          sourceResourceId: citation.sourceResourceId,
          sourceBlockId: citation.sourceBlockId,
          evidenceQuote: citation.evidenceQuote,
          matchKind: citation.matchKind,
          passageKind
        };
        const evidenceKey = `source-evidence-${createHash("sha256")
          .update(JSON.stringify(reference))
          .digest("hex")}`;
        evidenceKeyByNodeAndSignature.set(`${derivedNodeId}\u0000${signature}`, evidenceKey);
        return { evidenceKey, ...reference };
      });
    evidence.push(...nodeEvidence);
    evidenceKeysByNode.set(derivedNodeId, nodeEvidence.map((reference) => reference.evidenceKey));
  }

  const claims: SourceMaterialClaim[] = [];
  const directEvidenceKeys = (
    derivedNodeId: string,
    citation: StudyItemCitation | undefined
  ): string[] => {
    if (citation?.provenance !== "source") return [];
    const key = evidenceKeyByNodeAndSignature.get(
      `${derivedNodeId}\u0000${citationSignature(citation)}`
    );
    return key ? [key] : [];
  };
  const addClaim = (input: Omit<SourceMaterialClaim, "statement">): void => {
    assertMaterialSubjectIsNonEmpty(input.claimKey, input.subject);
    claims.push({ ...input, statement: renderSourceMaterialClaim(input.subject) });
  };

  for (const lesson of lessons) {
    const evidenceKeys = evidenceKeysByNode.get(lesson.derivedNodeId) ?? [];
    lesson.sections.forEach((section, sectionIndex) => {
      const base = {
        purpose: "source_support" as const,
        assetKind: "concept_lesson" as const,
        assetId: lesson.conceptLessonId,
        derivedNodeId: lesson.derivedNodeId,
        canonicalLabel: lesson.canonicalLabel,
        evidenceKeys,
        directEvidenceKeys: directEvidenceKeys(lesson.derivedNodeId, section.citation)
      };
      addClaim({
        ...base,
        claimKey: `lesson:${lesson.conceptLessonId}:section:${sectionIndex}:text`,
        subject: {
          kind: "lesson_section",
          sectionKind: section.kind,
          sectionText: section.text
        }
      });
      section.items?.forEach((itemText, itemIndex) => addClaim({
        ...base,
        claimKey: `lesson:${lesson.conceptLessonId}:section:${sectionIndex}:item:${itemIndex}`,
        directEvidenceKeys: [],
        subject: {
          kind: "lesson_section_item",
          sectionKind: section.kind,
          sectionText: section.text,
          itemText
        }
      }));
      if (section.diagram) {
        addClaim({
          ...base,
          claimKey: `lesson:${lesson.conceptLessonId}:section:${sectionIndex}:diagram:caption`,
          directEvidenceKeys: [],
          subject: {
            kind: "lesson_diagram_caption",
            sectionKind: section.kind,
            sectionText: section.text,
            caption: section.diagram.caption
          }
        });
        addClaim({
          ...base,
          claimKey: `lesson:${lesson.conceptLessonId}:section:${sectionIndex}:diagram:spec`,
          directEvidenceKeys: [],
          subject: {
            kind: "lesson_diagram_spec",
            sectionKind: section.kind,
            sectionText: section.text,
            caption: section.diagram.caption,
            spec: section.diagram.spec
          }
        });
      }
    });
  }

  for (const item of optionSelectItems) {
    const keyed = item.options.filter((option) => option.isCorrect);
    if (keyed.length !== 1) {
      throw new Error(
        `Source material-claim projection requires exactly one keyed option for ${JSON.stringify(item.studyItemId)}, got ${keyed.length}.`
      );
    }
    const keyedOption = keyed[0]!;
    const evidenceKeys = evidenceKeysByNode.get(item.derivedNodeId) ?? [];
    const canonicalLabel = canonicalLabelByNode.get(item.derivedNodeId);
    if (!canonicalLabel) {
      throw new Error(
        `Source material-claim projection cannot resolve the lesson subject for option-select ${JSON.stringify(item.studyItemId)}.`
      );
    }
    const base = {
      assetKind: "option_select" as const,
      assetId: item.studyItemId,
      derivedNodeId: item.derivedNodeId,
      canonicalLabel,
      evidenceKeys
    };
    addClaim({
      ...base,
      purpose: "source_support",
      claimKey: `option-select:${item.studyItemId}:question-key`,
      directEvidenceKeys: directEvidenceKeys(item.derivedNodeId, keyedOption.citation),
      subject: {
        kind: "option_select_question_key",
        question: item.question,
        keyedAnswer: keyedOption.text
      }
    });
    addClaim({
      ...base,
      purpose: "source_support",
      claimKey: `option-select:${item.studyItemId}:explanation`,
      directEvidenceKeys: [],
      subject: {
        kind: "option_select_explanation",
        question: item.question,
        keyedAnswer: keyedOption.text,
        explanation: item.explanation
      }
    });
    item.options.forEach((option, optionIndex) => {
      if (option.isCorrect) return;
      addClaim({
        ...base,
        purpose: "distractor_invalidity",
        claimKey: `option-select:${item.studyItemId}:distractor:${optionIndex}`,
        directEvidenceKeys: [],
        subject: {
          kind: "option_select_distractor",
          question: item.question,
          proposedAnswer: option.text
        }
      });
    });
  }

  return {
    projection,
    evidence: [...new Map(evidence.map((reference) => [reference.evidenceKey, reference] as const))
      .values()]
      .sort((left, right) => left.evidenceKey.localeCompare(right.evidenceKey)),
    claims
  };
}

export function renderSourceMaterialClaim(subject: SourceMaterialClaimSubject): string {
  switch (subject.kind) {
    case "lesson_section":
      return `Lesson section (${subject.sectionKind}) material claim: ${JSON.stringify(subject.sectionText)}`;
    case "lesson_section_item":
      return `Within lesson section (${subject.sectionKind}) ${JSON.stringify(subject.sectionText)}, material item: ${JSON.stringify(subject.itemText)}`;
    case "lesson_diagram_caption":
      return `Within lesson section (${subject.sectionKind}) ${JSON.stringify(subject.sectionText)}, diagram caption: ${JSON.stringify(subject.caption)}`;
    case "lesson_diagram_spec":
      return `Within lesson section (${subject.sectionKind}) ${JSON.stringify(subject.sectionText)} and caption ${JSON.stringify(subject.caption)}, diagram specification: ${JSON.stringify(subject.spec)}`;
    case "option_select_question_key":
      return `For learner question ${JSON.stringify(subject.question)}, the keyed answer is ${JSON.stringify(subject.keyedAnswer)}.`;
    case "option_select_explanation":
      return `For learner question ${JSON.stringify(subject.question)} with keyed answer ${JSON.stringify(subject.keyedAnswer)}, explanation: ${JSON.stringify(subject.explanation)}`;
    case "option_select_distractor":
      return `For learner question ${JSON.stringify(subject.question)}, proposed answer: ${JSON.stringify(subject.proposedAnswer)}.`;
  }
}

function citationSignature(citation: Extract<StudyItemCitation, { provenance: "source" }>): string {
  return JSON.stringify({
    sourceResourceId: citation.sourceResourceId,
    sourceBlockId: citation.sourceBlockId,
    evidenceQuote: citation.evidenceQuote,
    matchKind: citation.matchKind
  });
}

function assertMaterialSubjectIsNonEmpty(
  claimKey: string,
  subject: SourceMaterialClaimSubject
): void {
  const values = Object.entries(subject)
    .filter(([key]) => key !== "kind" && key !== "sectionKind")
    .map(([, value]) => value);
  if (values.some((value) => typeof value === "string" && value.trim().length === 0)) {
    throw new Error(`Source material claim ${JSON.stringify(claimKey)} contains an empty material field.`);
  }
}
