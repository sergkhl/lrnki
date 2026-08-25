import type {
  ConceptLesson,
  OptionSelectItem,
  RejectedStudyItem
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  SourceEvidenceReadPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import {
  evaluateProjectedOptionSelectTruth,
  evaluateProjectedSourceSupport,
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  type DistractorInvalidityDecision,
  type KeyUniquenessDecision,
  type ProjectedOptionSelectTruthEvaluation,
  type ProjectedSourceSupportEvaluation,
  type SourceAssetEvaluationStage,
  type SourceSupportDecision,
  type SourceSupportNodeContext
} from "./sourceAssetEvaluation";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";
import {
  projectSourceMaterialClaims,
  type SourceMaterialClaim,
  type SourceMaterialClaimSet
} from "./sourceMaterialClaims";
import { lessonOptionSelectAnswer } from "./lessonGroundingShape";
import { settleSourceCitationMatchKinds } from "./sourceCitationMatch";
import {
  sourceOptionExactReferenceContractReasons,
  sourceOptionUsesExactReferenceContract
} from "./sourceOptionExactReference";

export type SourceOptionSelectAdmissionResult = {
  // Exact post-guard generator payloads. Persistence retains these in the immutable bank artifact
  // whether or not semantic settlement admits them as current learner activities.
  candidates: OptionSelectItem[];
  studyItems: OptionSelectItem[];
  rejected: RejectedStudyItem[];
  sourceSupport: ProjectedSourceSupportEvaluation;
  optionTruth: ProjectedOptionSelectTruthEvaluation;
};

// Settle one source-derived option-select generation as a unit. Source support and answer truth are
// independent decisions over the same exact candidate. This owner alone composes them into learner
// admission and assigns the qualified identity; neither verifier can patch the question, key,
// explanation, options, citations, or provenance.
export async function admitSourceOptionSelectItems(input: {
  candidates: readonly OptionSelectItem[];
  lessons: readonly ConceptLesson[];
  nodes: readonly SourceSupportNodeContext[];
  baseConfigHash: string;
  sourceEvidenceRead: SourceEvidenceReadPort;
  sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
  sourceSupportStage?: SourceAssetEvaluationStage;
  answerKeyVerifier: AnswerKeyVerificationPort;
  answerKeyStage?: SourceAssetEvaluationStage;
  relatedConceptsForNode?: (derivedNodeId: string) => { label: string; snippet: string }[];
}): Promise<SourceOptionSelectAdmissionResult> {
  let candidates = [...input.candidates];
  const nodeById = new Map(input.nodes.map((node) => [node.derivedNodeId, node] as const));
  const expectedReferenceByNode = new Map(input.lessons.map((lesson) => [
    lesson.derivedNodeId,
    lessonOptionSelectAnswer(lesson)?.text
  ] as const));
  const fullProjection = projectSourceMaterialClaims({
    lessons: input.lessons,
    optionSelectItems: candidates
  });
  // Lessons are already settled before item generation. Keep their citations in the evidence pool
  // and their canonical labels as projection context, but do not spend calls re-verifying them.
  const projection: SourceMaterialClaimSet = {
    ...fullProjection,
    claims: fullProjection.claims.filter((claim) => claim.assetKind === "option_select")
  };
  const structurallyEligibleIds = new Set(
    candidates
      .filter((candidate) => {
        const node = nodeById.get(candidate.derivedNodeId);
        return node !== undefined && sourceStructureRejectionReasons(
          candidate,
          node.label,
          expectedReferenceByNode.get(candidate.derivedNodeId)
        ).length === 0;
      })
      .map((candidate) => candidate.studyItemId)
  );
  const eligibleProjection = {
    ...projection,
    claims: projection.claims.filter((claim) => structurallyEligibleIds.has(claim.assetId))
  };
  const evaluateSourceSupport = () => evaluateProjectedSourceSupport({
    projection: eligibleProjection,
    nodes: input.nodes,
    sourceEvidenceRead: input.sourceEvidenceRead,
    sourceSupportVerifier: input.sourceSupportVerifier
  });
  const supportClaimCount = eligibleProjection.claims.filter((claim) =>
    claim.purpose === "source_support"
  ).length;
  const sourceSupport = input.sourceSupportVerifier && input.sourceSupportStage && supportClaimCount > 0
    ? await input.sourceSupportStage(
        evaluateSourceSupport,
        supportClaimCount * SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS
      )
    : await evaluateSourceSupport();
  candidates = settleSourceCitationMatchKinds({
    optionSelectItems: candidates,
    evidence: sourceSupport.evidence
  }).optionSelectItems;
  const sourceDecisionByClaim = new Map(
    sourceSupport.decisions.map((decision) => [decision.claimKey, decision] as const)
  );
  // Source support is the cheaper prerequisite for answer truth. Do not spend a key-verifier call
  // on a candidate that cannot be learner-visible regardless of that verdict.
  const truthCandidates = candidates.filter((candidate) => {
    const node = nodeById.get(candidate.derivedNodeId);
    return node !== undefined && sourceGateRejectionReasons({
      candidate,
      canonicalLabel: node.label,
      expectedReferenceText: expectedReferenceByNode.get(candidate.derivedNodeId),
      claims: projection.claims.filter((claim) => claim.assetId === candidate.studyItemId),
      sourceDecisionByClaim
    }).length === 0;
  });
  const evaluateOptionTruth = () => evaluateProjectedOptionSelectTruth({
    items: truthCandidates,
    lessons: input.lessons,
    projection,
    evidence: sourceSupport.evidence,
    nodes: input.nodes,
    answerKeyVerifier: input.answerKeyVerifier,
    relatedConceptsForNode: input.relatedConceptsForNode
  });
  const needsNeuralTruth = truthCandidates.some((candidate) => {
    const node = nodeById.get(candidate.derivedNodeId);
    return node !== undefined && !sourceOptionUsesExactReferenceContract(candidate, node.label);
  });
  const optionTruth = input.answerKeyStage && truthCandidates.length > 0 && needsNeuralTruth
    ? await input.answerKeyStage(evaluateOptionTruth, truthCandidates.length)
    : await evaluateOptionTruth();
  const distractorDecisionByClaim = new Map(
    optionTruth.distractorInvalidity.map((decision) => [decision.claimKey, decision] as const)
  );
  const keyDecisionByItem = new Map(
    optionTruth.keyUniqueness.map((decision) => [decision.studyItemId, decision] as const)
  );
  const qualifiedConfigHash = qualifiedSourceExpeditionAssetConfigHash(input.baseConfigHash);
  const studyItems: OptionSelectItem[] = [];
  const rejected: RejectedStudyItem[] = [];

  for (const candidate of candidates) {
    const node = nodeById.get(candidate.derivedNodeId);
    if (!node) {
      throw new Error(
        `Source option-select candidate references unknown derived node ${JSON.stringify(candidate.derivedNodeId)}.`
      );
    }
    const claims = projection.claims.filter((claim) => claim.assetId === candidate.studyItemId);
    const reasons = sourceOptionRejectionReasons({
      candidate,
      canonicalLabel: node.label,
      expectedReferenceText: expectedReferenceByNode.get(candidate.derivedNodeId),
      claims,
      sourceDecisionByClaim,
      distractorDecisionByClaim,
      keyDecision: keyDecisionByItem.get(candidate.studyItemId)
    });
    if (reasons.length > 0) {
      rejected.push({
        derivedNodeId: candidate.derivedNodeId,
        canonicalLabel: node.label,
        itemType: "option_select",
        reason: `source option-select admission rejected: ${reasons.join("; ")}`
      });
      continue;
    }
    studyItems.push({ ...candidate, configHash: qualifiedConfigHash });
  }

  return { candidates, studyItems, rejected, sourceSupport, optionTruth };
}

function sourceOptionRejectionReasons(input: {
  candidate: OptionSelectItem;
  canonicalLabel: string;
  expectedReferenceText: string | undefined;
  claims: readonly SourceMaterialClaim[];
  sourceDecisionByClaim: ReadonlyMap<string, SourceSupportDecision>;
  distractorDecisionByClaim: ReadonlyMap<string, DistractorInvalidityDecision>;
  keyDecision: KeyUniquenessDecision | undefined;
}): string[] {
  const reasons = sourceGateRejectionReasons(input);
  if (reasons.length > 0) return reasons;

  const distractorClaims = input.claims.filter((claim) => claim.purpose === "distractor_invalidity");
  const expectedDistractors = input.candidate.options.filter((option) => !option.isCorrect).length;
  if (distractorClaims.length !== expectedDistractors) {
    reasons.push(
      `distractor_projection: expected ${expectedDistractors} claims, found ${distractorClaims.length}`
    );
  }
  for (const claim of distractorClaims) {
    const decision = input.distractorDecisionByClaim.get(claim.claimKey);
    if (!decision) {
      reasons.push(`${claim.location.kind}: missing distractor-invalidity decision`);
    } else if (decision.disposition !== "accepted") {
      reasons.push(decisionReason(claim.location.kind, decision));
    }
  }

  if (!input.keyDecision) {
    reasons.push("key_uniqueness: missing decision");
  } else if (input.keyDecision.disposition !== "accepted") {
    reasons.push(decisionReason("key_uniqueness", input.keyDecision));
  }
  return reasons;
}

function sourceGateRejectionReasons(input: {
  candidate: OptionSelectItem;
  canonicalLabel?: string;
  expectedReferenceText?: string;
  claims: readonly SourceMaterialClaim[];
  sourceDecisionByClaim: ReadonlyMap<string, SourceSupportDecision>;
}): string[] {
  const reasons = sourceStructureRejectionReasons(
    input.candidate,
    input.canonicalLabel,
    input.expectedReferenceText
  );
  if (reasons.length > 0) return reasons;

  const supportClaims = input.claims.filter((claim) => claim.purpose === "source_support");
  if (supportClaims.length !== 2) {
    reasons.push(`source_support_projection: expected 2 claims, found ${supportClaims.length}`);
  }
  for (const claim of supportClaims) {
    const decision = input.sourceDecisionByClaim.get(claim.claimKey);
    if (!decision) {
      reasons.push(`${claim.location.kind}: missing source-support decision`);
    } else if (decision.disposition !== "accepted") {
      reasons.push(decisionReason(claim.location.kind, decision));
    }
  }

  return reasons;
}

function sourceStructureRejectionReasons(
  candidate: OptionSelectItem,
  canonicalLabel?: string,
  expectedReferenceText?: string
): string[] {
  const reasons: string[] = [];
  const keyed = candidate.options.filter((option) => option.isCorrect);
  if (candidate.groundingProvenance === "generated") {
    reasons.push("grounding_provenance: source grounding required");
  }
  if (keyed.length !== 1 || keyed[0]?.citation?.provenance !== "source") {
    reasons.push("key_citation: exactly one source-cited key required");
  }
  if (canonicalLabel === undefined) {
    reasons.push("subject: source option-select node is unknown");
  } else {
    reasons.push(...sourceOptionExactReferenceContractReasons(
      candidate,
      canonicalLabel,
      expectedReferenceText
    ));
  }
  return reasons;
}

function decisionReason(
  gate: string,
  decision: SourceSupportDecision | DistractorInvalidityDecision | KeyUniquenessDecision
): string {
  return `${gate}: ${decision.reasonCode}: ${decision.reason}`;
}
