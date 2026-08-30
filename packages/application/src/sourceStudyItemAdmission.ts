import type {
  ConceptLesson,
  ImpostorItem,
  MatchingItem,
  OptionSelectItem,
  RejectedStudyItem,
  StudyItem,
  StudyItemCandidateVerdict,
  StudyItemCitation,
  StudyItemType
} from "@lrnki/domain-core";
import { classifyEvidenceMatch } from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  MatchingAssignmentVerificationPort,
  SourceEvidenceReadPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import {
  evaluateProjectedOptionSelectTruth,
  evaluateProjectedSourceSupport,
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  type EvaluationDisposition,
  type ProjectedOptionSelectTruthEvaluation,
  type ProjectedSourceSupportEvaluation,
  type SourceAssetEvaluationStage,
  type SourceSupportDecision,
  type SourceSupportNodeContext
} from "./sourceAssetEvaluation";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";
import { settleSourceCitationMatchKinds } from "./sourceCitationMatch";
import {
  projectSourceMaterialClaims,
  type SourceMaterialClaim,
  type SourceMaterialClaimSet
} from "./sourceMaterialClaims";
import { lessonGroundingShape, lessonOptionSelectAnswer } from "./lessonGroundingShape";
import { matchingPairUsesSurfaceContainmentCue } from "./matchingGuard";
import { normalizeOptionText } from "./optionSelectGuard";
import {
  sourceOptionExactReferenceContractReasons,
  sourceOptionUsesExactReferenceContract
} from "./sourceOptionExactReference";
import {
  assignmentFitFor,
  matchingAssignmentPresentation
} from "./verifyMatchingAssignments";
import { claimReasonFor, claimVerdictFor } from "./verifyStudyItemKeys";

export type SourceStudyItemSemanticReason =
  | "matching_assignment_verified"
  | "matching_keyed_pair_rejected"
  | "matching_assignment_ambiguous"
  | "matching_assignment_unclear"
  | "matching_assignment_verifier_unavailable"
  | "impostor_key_verified"
  | "impostor_planted_lie_true"
  | "impostor_truth_false"
  | "impostor_truth_unclear"
  | "impostor_key_verifier_unavailable";

export type SourceStudyItemSemanticDecision = {
  studyItemId: string;
  itemType: "matching" | "impostor";
  disposition: EvaluationDisposition;
  reasonCode: SourceStudyItemSemanticReason;
  reason: string;
  verifierModel: string;
};

export type SourceStudyItemAdmissionResult = {
  // Exact post-guard payloads with source-citation match kinds re-derived from immutable blocks.
  // Rejected candidates remain available to the neutral artifact and are never rewritten into a
  // different material claim.
  candidates: StudyItem[];
  studyItems: StudyItem[];
  rejected: RejectedStudyItem[];
  sourceSupport: ProjectedSourceSupportEvaluation;
  optionTruth: ProjectedOptionSelectTruthEvaluation;
  matchingAssignments: SourceStudyItemSemanticDecision[];
  impostorTruth: SourceStudyItemSemanticDecision[];
};

// Generation may already have spent the named strict semantic stage because that stage also owns
// the established one-shot verifier-informed regeneration envelope. Admission accepts only the
// exact post-regeneration ids and the exact verifier identity; every other candidate is evaluated
// here. This avoids reopening a non-repeatable timeline stage or paying for the same judgment twice.
export type SourceStudyItemSemanticPrequalification = {
  matching?: { studyItemIds: readonly string[]; verifierModel: string };
  impostor?: { studyItemIds: readonly string[]; verifierModel: string };
};

// One family-complete source admission boundary. It composes immutable evidence resolution,
// material-claim support, exact provenance settlement, and the family-specific key/assignment
// question; callers either receive a qualified item whose only mutation is config/citation
// fidelity identity, or an inspectable candidate plus concrete rejection.
export async function admitSourceStudyItems(input: {
  candidates: readonly StudyItem[];
  lessons: readonly ConceptLesson[];
  nodes: readonly SourceSupportNodeContext[];
  baseConfigHash: string;
  sourceEvidenceRead: SourceEvidenceReadPort;
  sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
  sourceSupportStage?: SourceAssetEvaluationStage;
  answerKeyVerifier: AnswerKeyVerificationPort;
  optionAnswerKeyStage?: SourceAssetEvaluationStage;
  impostorAnswerKeyStage?: SourceAssetEvaluationStage;
  matchingAssignmentVerifier: MatchingAssignmentVerificationPort;
  matchingAssignmentStage?: SourceAssetEvaluationStage;
  semanticPrequalification?: SourceStudyItemSemanticPrequalification;
  relatedConceptsForNode?: (derivedNodeId: string) => { label: string; snippet: string }[];
}): Promise<SourceStudyItemAdmissionResult> {
  const rawCandidates = [...input.candidates];
  assertUniqueIds(rawCandidates.map((candidate) => candidate.studyItemId), "source Study Item");
  validateSemanticPrequalification(
    rawCandidates,
    input.semanticPrequalification,
    input.matchingAssignmentVerifier.model,
    input.answerKeyVerifier.model
  );
  const nodeById = new Map(input.nodes.map((node) => [node.derivedNodeId, node] as const));
  const lessonByNode = uniqueLessonsByNode(input.lessons);
  const structureReasonsByItem = new Map<string, string[]>();

  for (const candidate of rawCandidates) {
    const node = nodeById.get(candidate.derivedNodeId);
    if (!node) {
      throw new Error(
        `Source Study Item candidate references unknown derived node ${JSON.stringify(candidate.derivedNodeId)}.`
      );
    }
    const lesson = lessonByNode.get(candidate.derivedNodeId);
    structureReasonsByItem.set(
      candidate.studyItemId,
      sourceStudyItemStructureReasons(candidate, lesson, node.label)
    );
  }

  const structurallyEligible = rawCandidates.filter((candidate) =>
    (structureReasonsByItem.get(candidate.studyItemId) ?? []).length === 0
  );
  const fullProjection = projectSourceMaterialClaims({
    lessons: input.lessons,
    studyItems: structurallyEligible
  });
  // Lessons were settled earlier. Their evidence remains the subject evidence pool, but this
  // admission spends and settles only the exact Study Item fields it owns.
  const projection: SourceMaterialClaimSet = {
    ...fullProjection,
    claims: fullProjection.claims.filter((claim) => claim.assetKind !== "concept_lesson")
  };
  const evaluateSourceSupport = () => evaluateProjectedSourceSupport({
    projection,
    nodes: input.nodes,
    sourceEvidenceRead: input.sourceEvidenceRead,
    sourceSupportVerifier: input.sourceSupportVerifier
  });
  const supportClaimCount = projection.claims.filter((claim) =>
    claim.purpose === "source_support"
  ).length;
  const sourceSupport = input.sourceSupportVerifier && input.sourceSupportStage && supportClaimCount > 0
    ? await input.sourceSupportStage(
        evaluateSourceSupport,
        supportClaimCount * SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS
      )
    : await evaluateSourceSupport();
  const candidates = settleSourceCitationMatchKinds({
    studyItems: rawCandidates,
    evidence: sourceSupport.evidence
  }).studyItems;
  const candidateById = new Map(candidates.map((candidate) => [
    candidate.studyItemId,
    candidate
  ] as const));
  const sourceDecisionByClaim = new Map(sourceSupport.decisions.map((decision) => [
    decision.claimKey,
    decision
  ] as const));
  const sourceReasonsByItem = new Map<string, string[]>();
  for (const candidate of structurallyEligible) {
    sourceReasonsByItem.set(candidate.studyItemId, sourceGateRejectionReasons(
      candidateById.get(candidate.studyItemId) ?? candidate,
      projection.claims.filter((claim) => claim.assetId === candidate.studyItemId),
      sourceDecisionByClaim
    ));
  }
  const sourceEligible = candidates.filter((candidate) =>
    (structureReasonsByItem.get(candidate.studyItemId) ?? []).length === 0 &&
    (sourceReasonsByItem.get(candidate.studyItemId) ?? []).length === 0
  );
  const optionCandidates = sourceEligible.filter((candidate): candidate is OptionSelectItem =>
    candidate.itemType === "option_select"
  );
  const matchingCandidates = sourceEligible.filter((candidate): candidate is MatchingItem =>
    candidate.itemType === "matching"
  );
  const impostorCandidates = sourceEligible.filter((candidate): candidate is ImpostorItem =>
    candidate.itemType === "impostor"
  );

  const evaluateOptionTruth = () => evaluateProjectedOptionSelectTruth({
    items: optionCandidates,
    lessons: input.lessons,
    projection,
    evidence: sourceSupport.evidence,
    nodes: input.nodes,
    answerKeyVerifier: input.answerKeyVerifier,
    relatedConceptsForNode: input.relatedConceptsForNode
  });
  const needsNeuralOptionTruth = optionCandidates.some((candidate) => {
    const node = nodeById.get(candidate.derivedNodeId);
    return node !== undefined && !sourceOptionUsesExactReferenceContract(candidate, node.label);
  });
  const optionTruthPromise = input.optionAnswerKeyStage &&
      optionCandidates.length > 0 &&
      needsNeuralOptionTruth
    ? input.optionAnswerKeyStage(evaluateOptionTruth, optionCandidates.length)
    : evaluateOptionTruth();
  const matchingPromise = runMatchingEvaluation({
    items: matchingCandidates,
    lessonsByNode: lessonByNode,
    nodesById: nodeById,
    verifier: input.matchingAssignmentVerifier,
    prequalification: input.semanticPrequalification?.matching,
    relatedConceptsForNode: input.relatedConceptsForNode,
    stage: input.matchingAssignmentStage
  });
  const impostorPromise = runImpostorEvaluation({
    items: impostorCandidates,
    lessonsByNode: lessonByNode,
    nodesById: nodeById,
    verifier: input.answerKeyVerifier,
    prequalification: input.semanticPrequalification?.impostor,
    relatedConceptsForNode: input.relatedConceptsForNode,
    stage: input.impostorAnswerKeyStage
  });
  const [optionTruth, matchingAssignments, impostorTruth] = await Promise.all([
    optionTruthPromise,
    matchingPromise,
    impostorPromise
  ]);

  const distractorDecisionByClaim = new Map(optionTruth.distractorInvalidity.map((decision) => [
    decision.claimKey,
    decision
  ] as const));
  const optionKeyDecisionByItem = new Map(optionTruth.keyUniqueness.map((decision) => [
    decision.studyItemId,
    decision
  ] as const));
  const matchingDecisionByItem = new Map(matchingAssignments.map((decision) => [
    decision.studyItemId,
    decision
  ] as const));
  const impostorDecisionByItem = new Map(impostorTruth.map((decision) => [
    decision.studyItemId,
    decision
  ] as const));
  const qualifiedConfigHash = qualifiedSourceExpeditionAssetConfigHash(input.baseConfigHash);
  const studyItems: StudyItem[] = [];
  const rejected: RejectedStudyItem[] = [];

  for (const candidate of candidates) {
    const node = nodeById.get(candidate.derivedNodeId)!;
    const claims = projection.claims.filter((claim) => claim.assetId === candidate.studyItemId);
    const reasons = [
      ...(structureReasonsByItem.get(candidate.studyItemId) ?? []),
      ...(sourceReasonsByItem.get(candidate.studyItemId) ?? [])
    ];
    if (reasons.length === 0 && candidate.itemType === "option_select") {
      reasons.push(...optionSemanticRejectionReasons(
        candidate,
        claims,
        distractorDecisionByClaim,
        optionKeyDecisionByItem.get(candidate.studyItemId)
      ));
    } else if (reasons.length === 0 && candidate.itemType === "matching") {
      reasons.push(...semanticDecisionRejectionReasons(
        "matching_assignment",
        matchingDecisionByItem.get(candidate.studyItemId)
      ));
    } else if (reasons.length === 0) {
      reasons.push(...semanticDecisionRejectionReasons(
        "impostor_key",
        impostorDecisionByItem.get(candidate.studyItemId)
      ));
    }

    if (reasons.length > 0) {
      rejected.push({
        derivedNodeId: candidate.derivedNodeId,
        canonicalLabel: node.label,
        itemType: candidate.itemType,
        reason: `source ${sourceFamilyLabel(candidate.itemType)} admission rejected: ${reasons.join("; ")}`
      });
      continue;
    }
    studyItems.push({ ...candidate, configHash: qualifiedConfigHash });
  }

  return {
    candidates,
    studyItems,
    rejected,
    sourceSupport,
    optionTruth,
    matchingAssignments,
    impostorTruth
  };
}

async function runMatchingEvaluation(input: {
  items: readonly MatchingItem[];
  lessonsByNode: ReadonlyMap<string, ConceptLesson>;
  nodesById: ReadonlyMap<string, SourceSupportNodeContext>;
  verifier: MatchingAssignmentVerificationPort;
  prequalification?: SourceStudyItemSemanticPrequalification["matching"];
  relatedConceptsForNode?: (derivedNodeId: string) => { label: string; snippet: string }[];
  stage?: SourceAssetEvaluationStage;
}): Promise<SourceStudyItemSemanticDecision[]> {
  const prequalified = semanticPrequalificationFor(
    input.items,
    "matching",
    input.prequalification,
    input.verifier.model
  );
  const pending = input.items.filter((item) => !prequalified.has(item.studyItemId));
  const evaluate = async (): Promise<SourceStudyItemSemanticDecision[]> => {
    const decisions: SourceStudyItemSemanticDecision[] = [];
    for (const item of [...pending].sort((left, right) =>
      left.studyItemId.localeCompare(right.studyItemId)
    )) {
      const node = input.nodesById.get(item.derivedNodeId)!;
      const grounding = lessonGroundingShape(input.lessonsByNode.get(item.derivedNodeId)!);
      const presentation = matchingAssignmentPresentation(item);
      try {
        const verdicts = await input.verifier.verify({
          declaredDomain: node.declaredDomain,
          node: {
            derivedNodeId: node.derivedNodeId,
            canonicalLabel: node.label,
            aliases: [...node.aliases]
          },
          question: item.question,
          prompts: presentation.prompts,
          matches: presentation.matches,
          groundingPassages: grounding!.passages,
          siblings: input.relatedConceptsForNode?.(item.derivedNodeId) ?? []
        });
        decisions.push(settleStrictMatchingAssignment(
          item,
          presentation.matchPairOrdinals,
          verdicts,
          input.verifier.model
        ));
      } catch (error) {
        decisions.push({
          studyItemId: item.studyItemId,
          itemType: "matching",
          disposition: "not_evaluated",
          reasonCode: "matching_assignment_verifier_unavailable",
          reason: errorMessage(error),
          verifierModel: input.verifier.model
        });
      }
    }
    return mergeSemanticDecisions(input.items, prequalified, decisions);
  };
  return input.stage && pending.length > 0
    ? input.stage(evaluate, pending.length)
    : evaluate();
}

async function runImpostorEvaluation(input: {
  items: readonly ImpostorItem[];
  lessonsByNode: ReadonlyMap<string, ConceptLesson>;
  nodesById: ReadonlyMap<string, SourceSupportNodeContext>;
  verifier: AnswerKeyVerificationPort;
  prequalification?: SourceStudyItemSemanticPrequalification["impostor"];
  relatedConceptsForNode?: (derivedNodeId: string) => { label: string; snippet: string }[];
  stage?: SourceAssetEvaluationStage;
}): Promise<SourceStudyItemSemanticDecision[]> {
  const prequalified = semanticPrequalificationFor(
    input.items,
    "impostor",
    input.prequalification,
    input.verifier.model
  );
  const pending = input.items.filter((item) => !prequalified.has(item.studyItemId));
  const evaluate = async (): Promise<SourceStudyItemSemanticDecision[]> => {
    const decisions: SourceStudyItemSemanticDecision[] = [];
    for (const item of [...pending].sort((left, right) =>
      left.studyItemId.localeCompare(right.studyItemId)
    )) {
      const node = input.nodesById.get(item.derivedNodeId)!;
      const grounding = lessonGroundingShape(input.lessonsByNode.get(item.derivedNodeId)!);
      try {
        const verdicts = await input.verifier.verify({
          itemType: "impostor",
          declaredDomain: node.declaredDomain,
          subject: { canonicalLabel: node.label, aliases: [...node.aliases] },
          candidates: item.statements.map((statement) => ({
            ordinal: statement.ordinal,
            text: statement.text
          })),
          groundingPassages: grounding!.passages.map((passage) => ({
            passageId: passage.passageId,
            kind: passage.kind,
            text: passage.text
          })),
          relatedConcepts: input.relatedConceptsForNode?.(item.derivedNodeId) ?? []
        });
        decisions.push(settleStrictImpostorTruth(item, verdicts, input.verifier.model));
      } catch (error) {
        decisions.push({
          studyItemId: item.studyItemId,
          itemType: "impostor",
          disposition: "not_evaluated",
          reasonCode: "impostor_key_verifier_unavailable",
          reason: errorMessage(error),
          verifierModel: input.verifier.model
        });
      }
    }
    return mergeSemanticDecisions(input.items, prequalified, decisions);
  };
  return input.stage && pending.length > 0
    ? input.stage(evaluate, pending.length)
    : evaluate();
}

function semanticPrequalificationFor<TItem extends MatchingItem | ImpostorItem>(
  items: readonly TItem[],
  itemType: TItem["itemType"],
  prequalification: SourceStudyItemSemanticPrequalification[TItem["itemType"]] | undefined,
  expectedVerifierModel: string
): Map<string, SourceStudyItemSemanticDecision> {
  if (!prequalification) return new Map();
  if (prequalification.verifierModel !== expectedVerifierModel) {
    throw new Error(
      `Source ${itemType} semantic prequalification used verifier ${JSON.stringify(prequalification.verifierModel)}, expected ${JSON.stringify(expectedVerifierModel)}.`
    );
  }
  assertUniqueIds(prequalification.studyItemIds, `source ${itemType} semantic prequalification`);
  const itemIds = new Set(items.map((item) => item.studyItemId));
  return new Map(prequalification.studyItemIds.filter((studyItemId) => itemIds.has(studyItemId)).map((studyItemId) => [
    studyItemId,
    itemType === "matching"
      ? {
          studyItemId,
          itemType: "matching" as const,
          disposition: "accepted" as const,
          reasonCode: "matching_assignment_verified" as const,
          reason: "Every keyed cell fits and every non-keyed cell does not fit, yielding one defensible assignment.",
          verifierModel: prequalification.verifierModel
        }
      : {
          studyItemId,
          itemType: "impostor" as const,
          disposition: "accepted" as const,
          reasonCode: "impostor_key_verified" as const,
          reason: "Answer-Key Verification accepted exactly three true statements and one false statement.",
          verifierModel: prequalification.verifierModel
        }
  ]));
}

function validateSemanticPrequalification(
  candidates: readonly StudyItem[],
  prequalification: SourceStudyItemSemanticPrequalification | undefined,
  matchingVerifierModel: string,
  impostorVerifierModel: string
): void {
  const validate = (
    itemType: "matching" | "impostor",
    entry: SourceStudyItemSemanticPrequalification[typeof itemType] | undefined,
    expectedVerifierModel: string
  ): void => {
    if (!entry) return;
    if (entry.verifierModel !== expectedVerifierModel) {
      throw new Error(
        `Source ${itemType} semantic prequalification used verifier ${JSON.stringify(entry.verifierModel)}, expected ${JSON.stringify(expectedVerifierModel)}.`
      );
    }
    assertUniqueIds(entry.studyItemIds, `source ${itemType} semantic prequalification`);
    const candidateIds = new Set(candidates
      .filter((candidate) => candidate.itemType === itemType)
      .map((candidate) => candidate.studyItemId));
    for (const studyItemId of entry.studyItemIds) {
      if (!candidateIds.has(studyItemId)) {
        throw new Error(
          `Source ${itemType} semantic prequalification references unknown Study Item ${JSON.stringify(studyItemId)}.`
        );
      }
    }
  };
  validate("matching", prequalification?.matching, matchingVerifierModel);
  validate("impostor", prequalification?.impostor, impostorVerifierModel);
}

function mergeSemanticDecisions(
  items: readonly (MatchingItem | ImpostorItem)[],
  prequalified: ReadonlyMap<string, SourceStudyItemSemanticDecision>,
  evaluated: readonly SourceStudyItemSemanticDecision[]
): SourceStudyItemSemanticDecision[] {
  const evaluatedById = new Map(evaluated.map((decision) => [decision.studyItemId, decision] as const));
  return [...items]
    .sort((left, right) => left.studyItemId.localeCompare(right.studyItemId))
    .flatMap((item) => {
      const decision = prequalified.get(item.studyItemId) ?? evaluatedById.get(item.studyItemId);
      return decision ? [decision] : [];
    });
}

export function settleStrictMatchingAssignment(
  item: MatchingItem,
  matchPairOrdinals: readonly number[],
  verdicts: readonly Awaited<ReturnType<MatchingAssignmentVerificationPort["verify"]>>[number][],
  verifierModel: string
): SourceStudyItemSemanticDecision {
  const keyedRejected: string[] = [];
  const ambiguous: string[] = [];
  const unclear: string[] = [];
  item.pairs.forEach((pair, promptOrdinal) => {
    matchPairOrdinals.forEach((pairOrdinal, presentationIndex) => {
      const fit = assignmentFitFor(verdicts, promptOrdinal, presentationIndex);
      const match = item.pairs[pairOrdinal]!;
      if (pairOrdinal === promptOrdinal && fit === "does_not_fit") {
        keyedRejected.push(`${JSON.stringify(pair.promptText)} -> ${JSON.stringify(match.matchText)}`);
      } else if (pairOrdinal !== promptOrdinal && fit === "fits") {
        ambiguous.push(`${JSON.stringify(pair.promptText)} also accepts ${JSON.stringify(match.matchText)}`);
      } else if (fit === "unclear") {
        unclear.push(`${JSON.stringify(pair.promptText)} / ${JSON.stringify(match.matchText)}`);
      }
    });
  });
  if (keyedRejected.length > 0) {
    return semanticDecision(
      item,
      "rejected",
      "matching_keyed_pair_rejected",
      `The keyed assignment contains a rejected pair: ${keyedRejected.join(", ")}.`,
      verifierModel
    );
  }
  if (ambiguous.length > 0) {
    return semanticDecision(
      item,
      "rejected",
      "matching_assignment_ambiguous",
      `The board has more than one defensible assignment: ${ambiguous.join(", ")}.`,
      verifierModel
    );
  }
  if (unclear.length > 0) {
    return semanticDecision(
      item,
      "not_evaluated",
      "matching_assignment_unclear",
      `The verifier did not settle every board cell: ${unclear.join(", ")}.`,
      verifierModel
    );
  }
  return semanticDecision(
    item,
    "accepted",
    "matching_assignment_verified",
    "Every keyed cell fits and every non-keyed cell does not fit, yielding one defensible assignment.",
    verifierModel
  );
}

export function settleStrictImpostorTruth(
  item: ImpostorItem,
  verdicts: readonly StudyItemCandidateVerdict[],
  verifierModel: string
): SourceStudyItemSemanticDecision {
  const trueLie: string[] = [];
  const falseTruth: string[] = [];
  const unclear: string[] = [];
  for (const statement of item.statements) {
    const verdict = claimVerdictFor(verdicts, statement.ordinal);
    if (statement.isImpostor && verdict === "claim_true") {
      trueLie.push(`${JSON.stringify(statement.text)} (${claimReasonFor(verdicts, statement.ordinal)})`);
    } else if (!statement.isImpostor && verdict === "claim_false") {
      falseTruth.push(`${JSON.stringify(statement.text)} (${claimReasonFor(verdicts, statement.ordinal)})`);
    } else if (verdict === "unclear") {
      unclear.push(JSON.stringify(statement.text));
    }
  }
  if (trueLie.length > 0) {
    return semanticDecision(
      item,
      "rejected",
      "impostor_planted_lie_true",
      `The planted lie was judged true: ${trueLie.join(", ")}.`,
      verifierModel
    );
  }
  if (falseTruth.length > 0) {
    return semanticDecision(
      item,
      "rejected",
      "impostor_truth_false",
      `A displayed truth was judged false: ${falseTruth.join(", ")}.`,
      verifierModel
    );
  }
  if (unclear.length > 0) {
    return semanticDecision(
      item,
      "not_evaluated",
      "impostor_truth_unclear",
      `The verifier did not settle every statement: ${unclear.join(", ")}.`,
      verifierModel
    );
  }
  return semanticDecision(
    item,
    "accepted",
    "impostor_key_verified",
    "Answer-Key Verification accepted exactly three true statements and one false statement.",
    verifierModel
  );
}

// Deterministic read-time recheck for a persisted item carrying the qualified Source Expedition
// config identity. Neural decisions are represented by that exact identity; this function replays
// every metadata, family-shape, provenance, and lesson-grounding condition that can be proven from
// the persisted rows without calling a model.
export function persistedSourceStudyItemQualificationReasons(input: {
  candidate: StudyItem;
  lesson: ConceptLesson | undefined;
  canonicalLabel: string;
  graphVersionId: string;
  enrichmentId: string;
  qualifiedAssetConfigHash: string;
}): string[] {
  const reasons: string[] = [];
  if (input.candidate.graphVersionId !== input.graphVersionId) {
    reasons.push("graph_version: qualified graph version required");
  }
  if (input.candidate.enrichmentId !== input.enrichmentId) {
    reasons.push("enrichment: qualified enrichment required");
  }
  if (input.candidate.configHash !== input.qualifiedAssetConfigHash) {
    reasons.push("config_hash: qualified Source Expedition identity required");
  }
  reasons.push(...sourceStudyItemStructureReasons(
    input.candidate,
    input.lesson,
    input.canonicalLabel
  ));
  return reasons;
}

function sourceStudyItemStructureReasons(
  candidate: StudyItem,
  lesson: ConceptLesson | undefined,
  canonicalLabel: string
): string[] {
  const reasons: string[] = [];
  if (candidate.groundingProvenance === "generated") {
    reasons.push("grounding_provenance: source-derived item required");
  }
  if (!lesson) {
    reasons.push("lesson: exactly one source-qualified Concept Lesson is required");
    return reasons;
  }
  const grounding = lessonGroundingShape(lesson);
  if (!grounding) {
    reasons.push("lesson_grounding: at least one grounding passage is required");
    return reasons;
  }
  if (candidate.itemType === "option_select") {
    const keyed = candidate.options.filter((option) => option.isCorrect);
    if (keyed.length !== 1 ||
        keyed[0]?.provenance !== "source" ||
        keyed[0].citation?.provenance !== "source") {
      reasons.push("key_citation: exactly one source-cited key required");
    }
    if (candidate.options.some((option) =>
      !option.isCorrect && (option.provenance !== "generated" || option.citation !== undefined)
    )) {
      reasons.push("distractor_provenance: distractors must be generated and uncited");
    }
    reasons.push(...sourceOptionExactReferenceContractReasons(
      candidate,
      canonicalLabel,
      lessonOptionSelectAnswer(lesson)?.text
    ));
    return reasons;
  }
  if (candidate.itemType === "matching") {
    if (!candidate.question.trim()) reasons.push("matching_instruction: non-empty instruction required");
    if (candidate.pairs.length < 3 || candidate.pairs.length > 4) {
      reasons.push(`matching_pairs: expected 3 or 4, found ${candidate.pairs.length}`);
    }
    assertUniqueIds(candidate.pairs.map((pair) => pair.pairId), "matching pair");
    assertUniqueIds(candidate.pairs.map((pair) => pair.matchId), "matching match");
    const prompts = candidate.pairs.map((pair) => normalizeOptionText(pair.promptText));
    const matches = candidate.pairs.map((pair) => normalizeOptionText(pair.matchText));
    if (prompts.some((text) => !text) || matches.some((text) => !text)) {
      reasons.push("matching_relationship: prompt and match text must be non-empty");
    }
    if (new Set(prompts).size !== prompts.length) reasons.push("matching_prompts: distinct prompts required");
    if (new Set(matches).size !== matches.length) reasons.push("matching_matches: distinct matches required");
    candidate.pairs.forEach((pair, pairIndex) => {
      if (normalizeOptionText(pair.promptText) === normalizeOptionText(pair.matchText) ||
          matchingPairUsesSurfaceContainmentCue(pair.promptText, pair.matchText)) {
        reasons.push(`matching_relationship:${pairIndex}: surface-cued prompt/match pair`);
      }
      if (!citationMatchesGrounding(pair.citation, grounding.passages, candidate.derivedNodeId)) {
        reasons.push(`matching_relationship:${pairIndex}: citation does not resolve against lesson grounding`);
      }
    });
    return reasons;
  }

  if (!candidate.question.trim()) reasons.push("impostor_question: non-empty instruction required");
  if (candidate.statements.length !== 4) {
    reasons.push(`impostor_statements: expected 4, found ${candidate.statements.length}`);
  }
  assertUniqueIds(candidate.statements.map((statement) => statement.statementId), "impostor statement");
  const ordinals = candidate.statements.map((statement) => statement.ordinal).sort((left, right) => left - right);
  if (ordinals.length !== 4 || ordinals.some((ordinal, index) => ordinal !== index)) {
    reasons.push("impostor_ordinals: exact 0-3 presentation order required");
  }
  const lies = candidate.statements.filter((statement) => statement.isImpostor);
  const truths = candidate.statements.filter((statement) => !statement.isImpostor);
  if (lies.length !== 1 || truths.length !== 3) {
    reasons.push(`impostor_shape: expected three truths and one lie, found ${truths.length}/${lies.length}`);
  }
  truths.forEach((truth, statementIndex) => {
    if (truth.provenance !== truth.citation.provenance) {
      reasons.push(`impostor_truth:${statementIndex}: displayed provenance disagrees with citation`);
    }
    if (!citationMatchesGrounding(truth.citation, grounding.passages, candidate.derivedNodeId)) {
      reasons.push(`impostor_truth:${statementIndex}: citation does not resolve against lesson grounding`);
    }
  });
  for (const lie of lies) {
    if (lie.provenance !== "generated") {
      reasons.push("impostor_lie: generated provenance required");
    }
    if (!lie.reveal.trim()) reasons.push("impostor_reveal: non-empty correction required");
    const siblingLabel = lie.siblingLabel?.trim();
    if (lie.lieSource === "sibling" && !siblingLabel) {
      reasons.push("impostor_lie: sibling source requires siblingLabel");
    }
    if (lie.lieSource === "generated" && siblingLabel) {
      reasons.push("impostor_lie: generated source must not carry siblingLabel");
    }
  }
  return reasons;
}

function sourceGateRejectionReasons(
  candidate: StudyItem,
  claims: readonly SourceMaterialClaim[],
  sourceDecisionByClaim: ReadonlyMap<string, SourceSupportDecision>
): string[] {
  const reasons: string[] = [];
  const supportClaims = claims.filter((claim) => claim.purpose === "source_support");
  const expectedSupportClaims = candidate.itemType === "option_select"
    ? 2
    : candidate.itemType === "matching"
      ? candidate.pairs.length
      : candidate.statements.filter((statement) => !statement.isImpostor).length + 1;
  if (supportClaims.length !== expectedSupportClaims) {
    reasons.push(
      `source_support_projection: expected ${expectedSupportClaims} claims, found ${supportClaims.length}`
    );
  }
  for (const claim of supportClaims) {
    const decision = sourceDecisionByClaim.get(claim.claimKey);
    if (!decision) {
      reasons.push(`${claim.location.kind}: missing source-support decision`);
    } else if (decision.disposition !== "accepted") {
      reasons.push(`${claim.location.kind}: ${decision.reasonCode}: ${decision.reason}`);
    }
  }
  return reasons;
}

function optionSemanticRejectionReasons(
  candidate: OptionSelectItem,
  claims: readonly SourceMaterialClaim[],
  distractorDecisionByClaim: ReadonlyMap<string, ProjectedOptionSelectTruthEvaluation["distractorInvalidity"][number]>,
  keyDecision: ProjectedOptionSelectTruthEvaluation["keyUniqueness"][number] | undefined
): string[] {
  const reasons: string[] = [];
  const distractorClaims = claims.filter((claim) => claim.purpose === "distractor_invalidity");
  const expectedDistractors = candidate.options.filter((option) => !option.isCorrect).length;
  if (distractorClaims.length !== expectedDistractors) {
    reasons.push(
      `distractor_projection: expected ${expectedDistractors} claims, found ${distractorClaims.length}`
    );
  }
  for (const claim of distractorClaims) {
    const decision = distractorDecisionByClaim.get(claim.claimKey);
    if (!decision) {
      reasons.push(`${claim.location.kind}: missing distractor-invalidity decision`);
    } else if (decision.disposition !== "accepted") {
      reasons.push(`${claim.location.kind}: ${decision.reasonCode}: ${decision.reason}`);
    }
  }
  if (!keyDecision) {
    reasons.push("key_uniqueness: missing decision");
  } else if (keyDecision.disposition !== "accepted") {
    reasons.push(`key_uniqueness: ${keyDecision.reasonCode}: ${keyDecision.reason}`);
  }
  return reasons;
}

function semanticDecisionRejectionReasons(
  gate: string,
  decision: SourceStudyItemSemanticDecision | undefined
): string[] {
  if (!decision) return [`${gate}: missing decision`];
  return decision.disposition === "accepted"
    ? []
    : [`${gate}: ${decision.reasonCode}: ${decision.reason}`];
}

function citationMatchesGrounding(
  citation: StudyItemCitation,
  passages: NonNullable<ReturnType<typeof lessonGroundingShape>>["passages"],
  derivedNodeId: string
): boolean {
  if (citation.provenance === "source") {
    return passages.some((passage) =>
      "sourceResourceId" in passage &&
      passage.sourceResourceId === citation.sourceResourceId &&
      passage.sourceBlockId === citation.sourceBlockId &&
      classifyEvidenceMatch(passage.text, citation.evidenceQuote) !== "none"
    );
  }
  return citation.derivedNodeId === derivedNodeId && passages.some((passage) =>
    !("sourceResourceId" in passage) &&
    passage.derivedNodeId === derivedNodeId &&
    classifyEvidenceMatch(passage.text, citation.passageText) !== "none"
  );
}

function uniqueLessonsByNode(lessons: readonly ConceptLesson[]): Map<string, ConceptLesson> {
  const result = new Map<string, ConceptLesson>();
  for (const lesson of lessons) {
    if (result.has(lesson.derivedNodeId)) {
      throw new Error(
        `Source Study Item admission received multiple lessons for ${JSON.stringify(lesson.derivedNodeId)}.`
      );
    }
    result.set(lesson.derivedNodeId, lesson);
  }
  return result;
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    throw new Error(`Duplicate ${label} id ${JSON.stringify(duplicate)}.`);
  }
}

function semanticDecision(
  item: MatchingItem | ImpostorItem,
  disposition: EvaluationDisposition,
  reasonCode: SourceStudyItemSemanticReason,
  reason: string,
  verifierModel: string
): SourceStudyItemSemanticDecision {
  return {
    studyItemId: item.studyItemId,
    itemType: item.itemType,
    disposition,
    reasonCode,
    reason,
    verifierModel
  };
}

function sourceFamilyLabel(itemType: StudyItemType): string {
  return itemType === "option_select" ? "option-select" : itemType;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
