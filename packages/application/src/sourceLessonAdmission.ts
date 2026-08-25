import type {
  ConceptLesson,
  ConceptLessonSection,
  LessonAbsentNode
} from "@lrnki/domain-core";
import type {
  SourceEvidenceReadPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import { SUBSTANTIVE_KINDS } from "./assembleConceptLesson";
import { validateLessonExplorableTerms } from "./explorableTerms";
import {
  evaluateProjectedSourceSupport,
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  type ProjectedSourceSupportEvaluation,
  type SourceAssetEvaluationStage,
  type SourceSupportDecision,
  type SourceSupportNodeContext
} from "./sourceAssetEvaluation";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";
import {
  projectSourceMaterialClaims,
  type SourceMaterialClaim,
  type SourceMaterialClaimLocation
} from "./sourceMaterialClaims";

export type SourceLessonAdmissionResult = {
  // Exact post-assembly generator payloads. Persistence retains these in the immutable bank
  // artifact even when settlement admits only a filtered lesson or an explicit absence.
  candidates: ConceptLesson[];
  lessons: ConceptLesson[];
  absent: LessonAbsentNode[];
  evaluation: ProjectedSourceSupportEvaluation;
};

// Settle one source-derived lesson generation as a unit. The verifier may only classify the
// projected fields; this module alone omits unsupported optional material, decides sufficiency,
// revalidates dependent affordances, and assigns the qualified artifact identity. It never edits a
// claim into a different claim and never manufactures citation provenance.
export async function admitSourceConceptLessons(input: {
  candidates: readonly ConceptLesson[];
  nodes: readonly SourceSupportNodeContext[];
  baseConfigHash: string;
  sourceEvidenceRead: SourceEvidenceReadPort;
  sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
  sourceSupportStage?: SourceAssetEvaluationStage;
}): Promise<SourceLessonAdmissionResult> {
  const candidates = [...input.candidates];
  const projection = projectSourceMaterialClaims({
    lessons: candidates,
    optionSelectItems: []
  });
  const evaluateSourceSupport = () => evaluateProjectedSourceSupport({
    projection,
    nodes: input.nodes,
    sourceEvidenceRead: input.sourceEvidenceRead,
    sourceSupportVerifier: input.sourceSupportVerifier
  });
  const supportClaimCount = projection.claims.filter((claim) => claim.purpose === "source_support").length;
  const evaluation = input.sourceSupportVerifier && input.sourceSupportStage && supportClaimCount > 0
    ? await input.sourceSupportStage(
        evaluateSourceSupport,
        supportClaimCount * SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS
      )
    : await evaluateSourceSupport();
  const decisionByClaimKey = new Map(
    evaluation.decisions.map((decision) => [decision.claimKey, decision] as const)
  );
  const claimsByAsset = groupBy(
    projection.claims.filter((claim) => claim.assetKind === "concept_lesson"),
    (claim) => claim.assetId
  );
  const lessons: ConceptLesson[] = [];
  const absent: LessonAbsentNode[] = [];
  const qualifiedConfigHash = qualifiedSourceExpeditionAssetConfigHash(input.baseConfigHash);

  for (const candidate of candidates) {
    const claims = claimsByAsset.get(candidate.conceptLessonId) ?? [];
    const decisionFor = indexDecisions(claims, decisionByClaimKey);
    const sections = candidate.sections.flatMap((section, sectionIndex) => {
      if (!fieldAccepted(decisionFor, { kind: "lesson_section_text", sectionIndex })) return [];
      return [settleSection(section, sectionIndex, decisionFor)];
    });
    const hasSubstantive = sections.some((section) => SUBSTANTIVE_KINDS.includes(section.kind));
    if (!hasSubstantive) {
      absent.push({
        derivedNodeId: candidate.derivedNodeId,
        canonicalLabel: candidate.canonicalLabel,
        reason: lessonAbsenceReason(claims, decisionByClaimKey)
      });
      continue;
    }
    lessons.push({
      ...candidate,
      configHash: qualifiedConfigHash,
      sections,
      explorableTerms: validateLessonExplorableTerms(
        candidate.explorableTerms,
        sections,
        candidate.canonicalLabel
      )
    });
  }

  return { candidates, lessons, absent, evaluation };
}

type DecisionForLocation = ReadonlyMap<string, SourceSupportDecision | undefined>;

function indexDecisions(
  claims: readonly SourceMaterialClaim[],
  decisionByClaimKey: ReadonlyMap<string, SourceSupportDecision>
): DecisionForLocation {
  const indexed = new Map<string, SourceSupportDecision | undefined>();
  for (const claim of claims) {
    const key = locationKey(claim.location);
    if (indexed.has(key)) {
      throw new Error(`Source lesson projection repeated field location ${JSON.stringify(key)}.`);
    }
    indexed.set(key, decisionByClaimKey.get(claim.claimKey));
  }
  return indexed;
}

function settleSection(
  section: ConceptLessonSection,
  sectionIndex: number,
  decisionFor: DecisionForLocation
): ConceptLessonSection {
  const items = section.items?.filter((_item, itemIndex) => fieldAccepted(decisionFor, {
    kind: "lesson_section_item",
    sectionIndex,
    itemIndex
  }));
  const diagramAccepted = section.diagram !== undefined &&
    fieldAccepted(decisionFor, { kind: "lesson_diagram_caption", sectionIndex }) &&
    fieldAccepted(decisionFor, { kind: "lesson_diagram_spec", sectionIndex });
  return {
    kind: section.kind,
    text: section.text,
    groundingProvenance: section.groundingProvenance,
    ...(section.citation ? { citation: section.citation } : {}),
    ...(items?.length ? { items } : {}),
    ...(diagramAccepted ? { diagram: section.diagram } : {})
  };
}

function fieldAccepted(
  decisionFor: DecisionForLocation,
  location: SourceMaterialClaimLocation
): boolean {
  return decisionFor.get(locationKey(location))?.disposition === "accepted";
}

function lessonAbsenceReason(
  claims: readonly SourceMaterialClaim[],
  decisionByClaimKey: ReadonlyMap<string, SourceSupportDecision>
): string {
  const decisions = claims.map((claim) => decisionByClaimKey.get(claim.claimKey));
  if (decisions.some((decision) => decision === undefined)) {
    return "source-supported lesson admission was incomplete; the candidate remains inspection-only";
  }
  if (decisions.some((decision) => decision?.reasonCode === "source_evidence_read_unavailable")) {
    return "source evidence could not be read; the candidate remains inspection-only";
  }
  if (decisions.some((decision) => decision?.reasonCode === "source_support_verifier_unavailable")) {
    return "source-support verification was unavailable; the candidate remains inspection-only";
  }
  if (decisions.some((decision) =>
    decision?.reasonCode === "source_support_verifier_not_activated"
  )) {
    return "source-support verifier is not activated; the candidate remains inspection-only";
  }
  return "source-supported lesson admission retained no substantive section; the candidate remains inspection-only";
}

function locationKey(location: SourceMaterialClaimLocation): string {
  switch (location.kind) {
    case "lesson_section_text":
      return `${location.kind}:${location.sectionIndex}`;
    case "lesson_section_item":
      return `${location.kind}:${location.sectionIndex}:${location.itemIndex}`;
    case "lesson_diagram_caption":
    case "lesson_diagram_spec":
      return `${location.kind}:${location.sectionIndex}`;
    case "option_select_question_key":
    case "option_select_explanation":
      return location.kind;
    case "option_select_distractor":
      return `${location.kind}:${location.optionIndex}`;
  }
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}
