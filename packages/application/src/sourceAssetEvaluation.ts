import type {
  OptionSelectItem,
  StudyItemCandidateVerdict,
  StudyItemClaimVerdict
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  JourneyLineageReadPort,
  OperationStageSpendReadPort,
  OperationTimelineReadPort,
  SourceEvidenceReadPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import {
  costTimingReport,
  type CostTimingReport
} from "./costTimingReport";
import type { QualifiedSourceExpedition } from "./sourceExpedition";
import {
  projectSourceMaterialClaims,
  type SourceMaterialClaim,
  type SourceMaterialClaimSet,
  type SourceMaterialEvidenceReference
} from "./sourceMaterialClaims";
import {
  answerKeyCandidates,
  claimReasonFor,
  claimVerdictFor
} from "./verifyStudyItemKeys";

export const SOURCE_ASSET_EVALUATION_REPORT_SCHEMA_VERSION = 2 as const;

export type EvaluationDisposition = "accepted" | "rejected" | "not_evaluated";

export type SourceSupportDecisionReason =
  | "source_support_verified"
  | "source_support_rejected"
  | "source_support_unclear"
  | "source_support_verifier_not_activated"
  | "source_support_verifier_unavailable"
  | "source_evidence_read_unavailable"
  | "missing_source_evidence"
  | "unresolved_source_evidence";

export type DistractorInvalidityDecisionReason =
  | "distractor_invalid_for_question"
  | "distractor_valid_for_question"
  | "distractor_truth_unclear"
  | "answer_key_verifier_not_activated"
  | "answer_key_verifier_unavailable"
  | "missing_source_evidence"
  | "unresolved_source_evidence";

export type KeyUniquenessDecisionReason =
  | "unique_key_verified"
  | "keyed_answer_false"
  | "multiple_true_answers"
  | "answer_key_truth_unclear"
  | "answer_key_verifier_not_activated"
  | "answer_key_verifier_unavailable"
  | "missing_source_evidence"
  | "unresolved_source_evidence";

export type SourceSupportDecision = {
  claimKey: string;
  assetId: string;
  disposition: EvaluationDisposition;
  reasonCode: SourceSupportDecisionReason;
  reason: string;
  verifierModel: string | null;
};

export type DistractorInvalidityDecision = {
  claimKey: string;
  studyItemId: string;
  proposedAnswer: string;
  disposition: EvaluationDisposition;
  reasonCode: DistractorInvalidityDecisionReason;
  reason: string;
  verifierModel: string | null;
};

export type KeyUniquenessDecision = {
  studyItemId: string;
  question: string;
  keyedAnswer: string;
  disposition: EvaluationDisposition;
  reasonCode: KeyUniquenessDecisionReason;
  reason: string;
  verifierModel: string | null;
};

export type JoinedSourceMaterialEvidence = SourceMaterialEvidenceReference & {
  resolved: boolean;
  sourceTitle: string | null;
  blockType: string | null;
  headingPath: string[] | null;
  blockText: string | null;
};

export type SourceSupportNodeContext = {
  derivedNodeId: string;
  label: string;
  aliases: readonly string[];
  declaredDomain: string;
};

export type ProjectedSourceSupportEvaluation = {
  evidence: JoinedSourceMaterialEvidence[];
  decisions: SourceSupportDecision[];
  calls: number;
};

// One evaluator owns evidence resolution and claim-versus-source settlement for both the read-only
// U3 report and U5 learner admission. It never decides whether an asset is sufficient: consumers
// interpret only the typed decisions for the exact fields they own.
export async function evaluateProjectedSourceSupport(input: {
  projection: SourceMaterialClaimSet;
  nodes: readonly SourceSupportNodeContext[];
  sourceEvidenceRead: SourceEvidenceReadPort;
  sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
}): Promise<ProjectedSourceSupportEvaluation> {
  const blockReferences = input.projection.evidence.map((reference) => ({
    sourceResourceId: reference.sourceResourceId,
    sourceBlockId: reference.sourceBlockId
  }));
  let readError: string | null = null;
  let resolvedBlocks: Awaited<ReturnType<SourceEvidenceReadPort["readSourceEvidence"]>> = [];
  try {
    resolvedBlocks = await input.sourceEvidenceRead.readSourceEvidence(blockReferences);
  } catch (error) {
    readError = errorMessage(error);
  }
  const blockByPair = new Map(resolvedBlocks.map((block) => [
    sourcePairKey(block.sourceResourceId, block.sourceBlockId),
    block
  ] as const));
  const evidence = input.projection.evidence.map((reference): JoinedSourceMaterialEvidence => {
    const block = blockByPair.get(sourcePairKey(reference.sourceResourceId, reference.sourceBlockId));
    return {
      ...reference,
      resolved: block !== undefined,
      sourceTitle: block?.sourceTitle ?? null,
      blockType: block?.blockType ?? null,
      headingPath: block?.headingPath ?? null,
      blockText: block?.text ?? null
    };
  });
  const evidenceByKey = new Map(evidence.map((row) => [row.evidenceKey, row] as const));
  const nodeById = new Map(input.nodes.map((node) => [node.derivedNodeId, node] as const));
  let calls = 0;
  const decisions: SourceSupportDecision[] = [];

  for (const claim of input.projection.claims.filter((candidate) => candidate.purpose === "source_support")) {
    const evidenceRows = claim.evidenceKeys.flatMap((evidenceKey) => {
      const row = evidenceByKey.get(evidenceKey);
      return row ? [row] : [];
    });
    if (claim.evidenceKeys.length === 0) {
      decisions.push(sourceSupportDecision(
        claim,
        "rejected",
        "missing_source_evidence",
        "The projected material claim has no admitted source evidence reference.",
        input.sourceSupportVerifier?.model ?? null
      ));
      continue;
    }
    if (readError !== null) {
      decisions.push(sourceSupportDecision(
        claim,
        "not_evaluated",
        "source_evidence_read_unavailable",
        readError,
        input.sourceSupportVerifier?.model ?? null
      ));
      continue;
    }
    if (evidenceRows.length !== claim.evidenceKeys.length || evidenceRows.some((row) => !row.resolved)) {
      decisions.push(sourceSupportDecision(
        claim,
        "rejected",
        "unresolved_source_evidence",
        "At least one admitted source evidence reference did not resolve to its exact resource/block pair.",
        input.sourceSupportVerifier?.model ?? null
      ));
      continue;
    }
    if (!input.sourceSupportVerifier) {
      decisions.push(sourceSupportDecision(
        claim,
        "not_evaluated",
        "source_support_verifier_not_activated",
        "No source-support verifier was activated for this operation.",
        null
      ));
      continue;
    }
    const node = nodeById.get(claim.derivedNodeId);
    if (!node) {
      throw new Error(`Material claim references unknown derived node ${JSON.stringify(claim.derivedNodeId)}.`);
    }
    try {
      calls += 1;
      const verdict = await input.sourceSupportVerifier.verify({
        declaredDomain: node.declaredDomain,
        subject: { canonicalLabel: node.label, aliases: [...node.aliases] },
        claim: { claimKey: claim.claimKey, statement: claim.statement },
        evidence: evidenceRows.map((row) => ({
          evidenceKey: row.evidenceKey,
          passageKind: row.passageKind,
          blockText: row.blockText!,
          citedQuote: row.evidenceQuote,
          direct: claim.directEvidenceKeys.includes(row.evidenceKey)
        }))
      });
      decisions.push(sourceSupportDecision(
        claim,
        verdict.disposition === "supported"
          ? "accepted"
          : verdict.disposition === "unsupported"
            ? "rejected"
            : "not_evaluated",
        verdict.disposition === "supported"
          ? "source_support_verified"
          : verdict.disposition === "unsupported"
            ? "source_support_rejected"
            : "source_support_unclear",
        nonEmptyReason(verdict.reason),
        input.sourceSupportVerifier.model
      ));
    } catch (error) {
      decisions.push(sourceSupportDecision(
        claim,
        "not_evaluated",
        "source_support_verifier_unavailable",
        errorMessage(error),
        input.sourceSupportVerifier.model
      ));
    }
  }

  return { evidence, decisions, calls };
}

export type SourceAssetEvaluationReport = {
  schemaVersion: typeof SOURCE_ASSET_EVALUATION_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  activation: {
    sourceSupportVerifierModel: string | null;
    answerKeyVerifierModel: string | null;
  };
  qualification: {
    candidate: QualifiedSourceExpedition["candidate"];
    assetSetIdentity: string;
    graphVersionId: string | null;
    enrichmentConfigHash: string;
    enrichmentJudgeModel: string;
    lessonAssets: {
      conceptLessonId: string;
      derivedNodeId: string;
      configHash: string;
      generatingModel: string;
    }[];
    optionSelectAssets: {
      studyItemId: string;
      derivedNodeId: string;
      configHash: string;
      generatingModel: string;
    }[];
  };
  candidatePayloads: {
    lessons: QualifiedSourceExpedition["assets"]["lessons"];
    optionSelectItems: QualifiedSourceExpedition["assets"]["studyItems"];
  };
  projection: SourceMaterialClaimSet["projection"];
  claims: SourceMaterialClaim[];
  evidence: JoinedSourceMaterialEvidence[];
  decisions: {
    sourceSupport: SourceSupportDecision[];
    distractorInvalidity: DistractorInvalidityDecision[];
    keyUniqueness: KeyUniquenessDecision[];
  };
  operationEvidence: {
    costTiming: CostTimingReport | null;
    calls: number | null;
    tokens: number | null;
    costUsd: number | null;
    costEstimated: boolean;
  };
  evaluationCalls: {
    sourceSupport: number;
    answerKey: number;
    total: number;
  };
  positiveControls: {
    qualifiedCandidateRows: 1;
    conceptLessonRows: number;
    optionSelectRows: number;
    projectedClaimRows: number;
    sourceSupportClaimRows: number;
    distractorClaimRows: number;
    referencedEvidenceRows: number;
    resolvedEvidenceRows: number;
    sourceSupportDecisionRows: number;
    distractorDecisionRows: number;
    keyUniquenessDecisionRows: number;
  };
};

export async function evaluateQualifiedSourceExpedition(input: {
  qualification: QualifiedSourceExpedition;
  sourceEvidenceRead: SourceEvidenceReadPort;
  sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
  answerKeyVerifier?: AnswerKeyVerificationPort;
  operationEvidence?: {
    timelineRead: OperationTimelineReadPort;
    operationStageSpendRead: OperationStageSpendReadPort;
    journeyLineageRead: JourneyLineageReadPort;
  };
  generatedAt?: string;
}): Promise<SourceAssetEvaluationReport> {
  const { qualification } = input;
  const projection = projectSourceMaterialClaims({
    lessons: qualification.assets.lessons,
    optionSelectItems: qualification.assets.studyItems
  });
  const sourceSupportEvaluation = await evaluateProjectedSourceSupport({
    projection,
    nodes: qualification.assets.detail.nodes,
    sourceEvidenceRead: input.sourceEvidenceRead,
    sourceSupportVerifier: input.sourceSupportVerifier
  });
  const joinedEvidence = sourceSupportEvaluation.evidence;
  const joinedEvidenceByKey = new Map(joinedEvidence.map((row) => [row.evidenceKey, row] as const));
  const nodeById = new Map(qualification.assets.detail.nodes.map((node) => [node.derivedNodeId, node] as const));
  let answerKeyCalls = 0;
  const sourceSupport = sourceSupportEvaluation.decisions;

  const distractorInvalidity: DistractorInvalidityDecision[] = [];
  const keyUniqueness: KeyUniquenessDecision[] = [];
  for (const item of [...qualification.assets.studyItems].sort((left, right) =>
    left.studyItemId.localeCompare(right.studyItemId)
  )) {
    const itemDistractorClaims = projection.claims.filter((claim) =>
      claim.assetId === item.studyItemId && claim.purpose === "distractor_invalidity"
    );
    const keyed = item.options.filter((option) => option.isCorrect);
    if (keyed.length !== 1) {
      throw new Error(`Evaluation requires exactly one keyed option for ${JSON.stringify(item.studyItemId)}.`);
    }
    const keyedOption = keyed[0]!;
    const itemEvidenceKeys = projection.claims.find((claim) =>
      claim.assetId === item.studyItemId && claim.subject.kind === "option_select_question_key"
    )?.evidenceKeys ?? [];
    const itemEvidence = itemEvidenceKeys.flatMap((evidenceKey) => {
      const row = joinedEvidenceByKey.get(evidenceKey);
      return row ? [row] : [];
    });

    const unavailable = itemEvidenceKeys.length === 0
      ? {
          distractorReason: "missing_source_evidence" as const,
          keyReason: "missing_source_evidence" as const,
          detail: "The option-select item has no admitted source evidence reference."
        }
      : itemEvidence.length !== itemEvidenceKeys.length || itemEvidence.some((row) => !row.resolved)
        ? {
            distractorReason: "unresolved_source_evidence" as const,
            keyReason: "unresolved_source_evidence" as const,
            detail: "At least one option-select source evidence reference did not resolve."
          }
        : !input.answerKeyVerifier
          ? {
              distractorReason: "answer_key_verifier_not_activated" as const,
              keyReason: "answer_key_verifier_not_activated" as const,
              detail: "No answer-key verifier was activated for this diagnostic run."
            }
          : null;
    if (unavailable) {
      const disposition: EvaluationDisposition = unavailable.distractorReason === "missing_source_evidence" ||
          unavailable.distractorReason === "unresolved_source_evidence"
        ? "rejected"
        : "not_evaluated";
      for (const claim of itemDistractorClaims) {
        distractorInvalidity.push(distractorDecision(
          claim,
          item,
          disposition,
          unavailable.distractorReason,
          unavailable.detail,
          input.answerKeyVerifier?.model ?? null
        ));
      }
      keyUniqueness.push(keyDecision(
        item,
        keyedOption.text,
        disposition,
        unavailable.keyReason,
        unavailable.detail,
        input.answerKeyVerifier?.model ?? null
      ));
      continue;
    }

    const node = nodeById.get(item.derivedNodeId);
    if (!node) throw new Error(`Option-select item references unknown derived node ${JSON.stringify(item.derivedNodeId)}.`);
    const candidates = answerKeyCandidates(item.options);
    try {
      answerKeyCalls += 1;
      const verdicts = await input.answerKeyVerifier!.verify({
        itemType: "option_select",
        declaredDomain: node.declaredDomain,
        subject: { canonicalLabel: node.label, aliases: [...node.aliases] },
        question: item.question,
        candidates,
        groundingPassages: itemEvidence.map((row) => ({
          passageId: row.evidenceKey,
          kind: row.passageKind,
          text: row.evidenceQuote
        })),
        relatedConcepts: relatedConceptsFor(
          item.derivedNodeId,
          qualification,
          projection,
          joinedEvidenceByKey
        )
      });
      const settled = settleOptionSelectTruth({ item, distractorClaims: itemDistractorClaims, candidates, verdicts });
      distractorInvalidity.push(...settled.distractorInvalidity.map((decision) => ({
        ...decision,
        verifierModel: input.answerKeyVerifier!.model
      })));
      keyUniqueness.push({
        ...settled.keyUniqueness,
        verifierModel: input.answerKeyVerifier!.model
      });
    } catch (error) {
      for (const claim of itemDistractorClaims) {
        distractorInvalidity.push(distractorDecision(
          claim,
          item,
          "not_evaluated",
          "answer_key_verifier_unavailable",
          errorMessage(error),
          input.answerKeyVerifier!.model
        ));
      }
      keyUniqueness.push(keyDecision(
        item,
        keyedOption.text,
        "not_evaluated",
        "answer_key_verifier_unavailable",
        errorMessage(error),
        input.answerKeyVerifier!.model
      ));
    }
  }

  const timing = input.operationEvidence
    ? await costTimingReport({
        scope: { journeyAnchorEnrichmentId: qualification.candidate.enrichmentId },
        ...input.operationEvidence
      })
    : undefined;
  const operationEvidence = {
    costTiming: timing ?? null,
    calls: timing?.total.calls ?? null,
    tokens: timing?.total.tokens ?? null,
    costUsd: timing?.total.costUsd ?? null,
    costEstimated: timing?.total.costEstimated ?? false
  };

  return {
    schemaVersion: SOURCE_ASSET_EVALUATION_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    activation: {
      sourceSupportVerifierModel: input.sourceSupportVerifier?.model ?? null,
      answerKeyVerifierModel: input.answerKeyVerifier?.model ?? null
    },
    qualification: {
      candidate: qualification.candidate,
      assetSetIdentity: qualification.assets.expectedAssets.assetSetIdentity,
      graphVersionId: qualification.assets.detail.summary.graphVersionId,
      enrichmentConfigHash: qualification.assets.detail.summary.enrichmentConfigHash,
      enrichmentJudgeModel: qualification.assets.detail.summary.judgeModel,
      lessonAssets: qualification.assets.lessons.map((lesson) => ({
        conceptLessonId: lesson.conceptLessonId,
        derivedNodeId: lesson.derivedNodeId,
        configHash: lesson.configHash,
        generatingModel: lesson.generatingModel
      })),
      optionSelectAssets: qualification.assets.studyItems.map((item) => ({
        studyItemId: item.studyItemId,
        derivedNodeId: item.derivedNodeId,
        configHash: item.configHash,
        generatingModel: item.generatingModel
      }))
    },
    candidatePayloads: {
      lessons: qualification.assets.lessons,
      optionSelectItems: qualification.assets.studyItems
    },
    projection: projection.projection,
    claims: projection.claims,
    evidence: joinedEvidence,
    decisions: { sourceSupport, distractorInvalidity, keyUniqueness },
    operationEvidence,
    evaluationCalls: {
      sourceSupport: sourceSupportEvaluation.calls,
      answerKey: answerKeyCalls,
      total: sourceSupportEvaluation.calls + answerKeyCalls
    },
    positiveControls: {
      qualifiedCandidateRows: 1,
      conceptLessonRows: qualification.assets.lessons.length,
      optionSelectRows: qualification.assets.studyItems.length,
      projectedClaimRows: projection.claims.length,
      sourceSupportClaimRows: projection.claims.filter((claim) => claim.purpose === "source_support").length,
      distractorClaimRows: projection.claims.filter((claim) => claim.purpose === "distractor_invalidity").length,
      referencedEvidenceRows: joinedEvidence.length,
      resolvedEvidenceRows: joinedEvidence.filter((row) => row.resolved).length,
      sourceSupportDecisionRows: sourceSupport.length,
      distractorDecisionRows: distractorInvalidity.length,
      keyUniquenessDecisionRows: keyUniqueness.length
    }
  };
}

export function settleOptionSelectTruth(input: {
  item: OptionSelectItem;
  distractorClaims: readonly SourceMaterialClaim[];
  candidates: readonly { ordinal: number; text: string }[];
  verdicts: readonly StudyItemCandidateVerdict[];
}): {
  distractorInvalidity: DistractorInvalidityDecision[];
  keyUniqueness: KeyUniquenessDecision;
} {
  const keyed = input.item.options.filter((option) => option.isCorrect);
  if (keyed.length !== 1) {
    throw new Error(`Answer-key settlement requires exactly one keyed option for ${JSON.stringify(input.item.studyItemId)}.`);
  }
  const keyedOption = keyed[0]!;
  const ordinalFor = (text: string): number => {
    const candidate = input.candidates.find((entry) => entry.text === text);
    if (!candidate) throw new Error(`Answer-key settlement cannot correlate candidate ${JSON.stringify(text)}.`);
    return candidate.ordinal;
  };
  const verdictFor = (text: string): StudyItemClaimVerdict =>
    claimVerdictFor(input.verdicts, ordinalFor(text));
  const reasonFor = (text: string): string =>
    claimReasonFor(input.verdicts, ordinalFor(text));

  const distractorInvalidity = input.distractorClaims.map((claim): DistractorInvalidityDecision => {
    if (claim.subject.kind !== "option_select_distractor") {
      throw new Error(`Distractor settlement received non-distractor claim ${JSON.stringify(claim.claimKey)}.`);
    }
    const verdict = verdictFor(claim.subject.proposedAnswer);
    return distractorDecision(
      claim,
      input.item,
      verdict === "claim_false" ? "accepted" : verdict === "claim_true" ? "rejected" : "not_evaluated",
      verdict === "claim_false"
        ? "distractor_invalid_for_question"
        : verdict === "claim_true"
          ? "distractor_valid_for_question"
          : "distractor_truth_unclear",
      reasonFor(claim.subject.proposedAnswer),
      null
    );
  });

  const keyedVerdict = verdictFor(keyedOption.text);
  const trueDistractors = input.item.options.filter((option) =>
    !option.isCorrect && verdictFor(option.text) === "claim_true"
  );
  const unclearOptions = input.item.options.filter((option) => verdictFor(option.text) === "unclear");
  const keyUniqueness = keyedVerdict === "claim_false"
    ? keyDecision(
        input.item,
        keyedOption.text,
        "rejected",
        "keyed_answer_false",
        reasonFor(keyedOption.text),
        null
      )
    : trueDistractors.length > 0
      ? keyDecision(
          input.item,
          keyedOption.text,
          "rejected",
          "multiple_true_answers",
          `At least one distractor was judged true: ${trueDistractors.map((option) => JSON.stringify(option.text)).join(", ")}.`,
          null
        )
      : keyedVerdict === "unclear" || unclearOptions.length > 0
        ? keyDecision(
            input.item,
            keyedOption.text,
            "not_evaluated",
            "answer_key_truth_unclear",
            `The verifier did not establish truth for every candidate: ${unclearOptions.map((option) => JSON.stringify(option.text)).join(", ")}.`,
            null
          )
        : keyDecision(
            input.item,
            keyedOption.text,
            "accepted",
            "unique_key_verified",
            "The keyed answer was judged true and every distractor was judged false.",
            null
          );

  return { distractorInvalidity, keyUniqueness };
}

function sourceSupportDecision(
  claim: SourceMaterialClaim,
  disposition: EvaluationDisposition,
  reasonCode: SourceSupportDecisionReason,
  reason: string,
  verifierModel: string | null
): SourceSupportDecision {
  return { claimKey: claim.claimKey, assetId: claim.assetId, disposition, reasonCode, reason, verifierModel };
}

function distractorDecision(
  claim: SourceMaterialClaim,
  item: OptionSelectItem,
  disposition: EvaluationDisposition,
  reasonCode: DistractorInvalidityDecisionReason,
  reason: string,
  verifierModel: string | null
): DistractorInvalidityDecision {
  if (claim.subject.kind !== "option_select_distractor") {
    throw new Error(`Expected distractor claim, got ${JSON.stringify(claim.subject.kind)}.`);
  }
  return {
    claimKey: claim.claimKey,
    studyItemId: item.studyItemId,
    proposedAnswer: claim.subject.proposedAnswer,
    disposition,
    reasonCode,
    reason,
    verifierModel
  };
}

function keyDecision(
  item: OptionSelectItem,
  keyedAnswer: string,
  disposition: EvaluationDisposition,
  reasonCode: KeyUniquenessDecisionReason,
  reason: string,
  verifierModel: string | null
): KeyUniquenessDecision {
  return {
    studyItemId: item.studyItemId,
    question: item.question,
    keyedAnswer,
    disposition,
    reasonCode,
    reason,
    verifierModel
  };
}

function relatedConceptsFor(
  subjectNodeId: string,
  qualification: QualifiedSourceExpedition,
  projection: SourceMaterialClaimSet,
  joinedEvidenceByKey: ReadonlyMap<string, JoinedSourceMaterialEvidence>
): { label: string; snippet: string }[] {
  return qualification.assets.detail.nodes
    .filter((node) => qualification.assets.trailNodeIds.has(node.derivedNodeId) && node.derivedNodeId !== subjectNodeId)
    .sort((left, right) => left.label.localeCompare(right.label))
    .flatMap((node) => {
      const evidenceKey = projection.claims.find((claim) =>
        claim.derivedNodeId === node.derivedNodeId && claim.evidenceKeys.length > 0
      )?.evidenceKeys[0];
      const snippet = evidenceKey ? joinedEvidenceByKey.get(evidenceKey)?.evidenceQuote : undefined;
      return snippet ? [{ label: node.label, snippet }] : [];
    });
}

function sourcePairKey(sourceResourceId: string, sourceBlockId: string): string {
  return `${sourceResourceId}\u0000${sourceBlockId}`;
}

function nonEmptyReason(reason: string): string {
  return reason.trim() || "The verifier returned no reason.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
