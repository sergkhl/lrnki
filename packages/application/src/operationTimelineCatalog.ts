import { STAGE_TAGS, isStageTag, type StageTag } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";

export type OperationTimelineStageKind = "llm" | "non_llm" | "unknown";

export const NON_LLM_STAGES = {
  documentLoad: "document-load",
  persist: "persist",
  load: "load",
  refine: "refine",
  symbolicDisposal: "symbolic-disposal"
} as const;

export type NonLlmStage = (typeof NON_LLM_STAGES)[keyof typeof NON_LLM_STAGES];

type OperationTimelineStageDescriptor = {
  stage: string;
  kind: Exclude<OperationTimelineStageKind, "unknown">;
};

const llm = (stage: StageTag): OperationTimelineStageDescriptor => ({ stage, kind: "llm" });
const nonLlm = (stage: NonLlmStage): OperationTimelineStageDescriptor => ({ stage, kind: "non_llm" });

export const OPERATION_TIMELINE_CATALOG: Record<OperationType, readonly OperationTimelineStageDescriptor[]> = {
  extraction: [
    llm(STAGE_TAGS.conceptDiscovery),
    llm(STAGE_TAGS.admission),
    llm(STAGE_TAGS.admissionLabelJudge),
    llm(STAGE_TAGS.cepExtraction),
    llm(STAGE_TAGS.definitionPassageQuality),
    llm(STAGE_TAGS.assertionEntailment),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  canonicalization: [
    nonLlm(NON_LLM_STAGES.load),
    llm(STAGE_TAGS.nodeEmbedding),
    llm(STAGE_TAGS.nodeMergeAdjudication),
    nonLlm(NON_LLM_STAGES.refine),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  minting: [
    nonLlm(NON_LLM_STAGES.load),
    nonLlm(NON_LLM_STAGES.refine),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  enrichment: [
    llm(STAGE_TAGS.declaredDomainInference),
    llm(STAGE_TAGS.conceptSetSynthesis),
    llm(STAGE_TAGS.knowledgeBoundaryProbe),
    llm(STAGE_TAGS.prerequisiteOrdering),
    llm(STAGE_TAGS.rescueDurability),
    llm(STAGE_TAGS.rescuedNodeLabeling),
    llm(STAGE_TAGS.rescueDefinitionQuality),
    llm(STAGE_TAGS.mintingDurability),
    llm(STAGE_TAGS.missingPrerequisiteProposal),
    llm(STAGE_TAGS.groundingGeneration),
    llm(STAGE_TAGS.groundingVerificationQuestionPlanning),
    llm(STAGE_TAGS.groundingVerificationAnswering),
    llm(STAGE_TAGS.groundingFactualityRevision),
    llm(STAGE_TAGS.intrinsicDifficulty),
    llm(STAGE_TAGS.nodeEmbedding),
    llm(STAGE_TAGS.nodeMergeAdjudication),
    nonLlm(NON_LLM_STAGES.symbolicDisposal),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  study_items: [
    nonLlm(NON_LLM_STAGES.load),
    llm(STAGE_TAGS.layerPurposeGeneration),
    llm(STAGE_TAGS.conceptLessonGeneration),
    llm(STAGE_TAGS.lessonRedundancyJudgment),
    llm(STAGE_TAGS.studyItemBlueprint),
    llm(STAGE_TAGS.studyItemGeneration),
    llm(STAGE_TAGS.matchingGeneration),
    llm(STAGE_TAGS.impostorGeneration),
    llm(STAGE_TAGS.sourceMaterialClaimSupport),
    llm(STAGE_TAGS.optionSelectKeyVerification),
    llm(STAGE_TAGS.impostorKeyVerification),
    llm(STAGE_TAGS.matchingAssignmentVerification),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  // Learner-Scoped Scaffold generation (plan 2026-07-12-002 U3, KTD7). Spend attribution stays
  // exact through the (operation_id, stage) join when this operation reuses a descriptor.
  scaffold: [
    llm(STAGE_TAGS.scaffoldOutlineGeneration),
    llm(STAGE_TAGS.knowledgeBoundaryProbe),
    llm(STAGE_TAGS.groundingGeneration),
    llm(STAGE_TAGS.groundingVerificationQuestionPlanning),
    llm(STAGE_TAGS.groundingVerificationAnswering),
    llm(STAGE_TAGS.groundingFactualityRevision),
    // The probe's K-answer agreement embeds through the embedding client, which tags spend
    // `node-embedding` under the ambient scaffold operation id (plan 2026-07-16-004 U3): before
    // this claim, that real spend was silently dropped from the scaffold cost report.
    llm(STAGE_TAGS.nodeEmbedding),
    llm(STAGE_TAGS.scaffoldContentGeneration),
    // Label↔content congruence judge (plan 2026-07-16-001). Two call sites share ONE descriptor:
    // the scaffold operation runs it as a generation-time re-pick (KTD4b) — those calls carry this
    // operation_id and DO aggregate under the scaffold cost report — while the standing
    // `audit-scaffold-content` command K-samples the same descriptor with NO operation_id, so
    // audit runs never touch any operation's cost report.
    llm(STAGE_TAGS.scaffoldContentCongruence),
    llm(STAGE_TAGS.optionSelectKeyVerification),
    nonLlm(NON_LLM_STAGES.persist)
  ]
} as const;

const knownNonLlmStages = new Set<string>(Object.values(NON_LLM_STAGES));
const ownedStagesByOperation = new Map<OperationType, ReadonlySet<string>>(
  Object.entries(OPERATION_TIMELINE_CATALOG).map(([operationType, stages]) => [
    operationType as OperationType,
    new Set(stages.map((descriptor) => descriptor.stage))
  ])
);
const ownedNeuralStagesByOperation = new Map<OperationType, ReadonlySet<StageTag>>(
  Object.entries(OPERATION_TIMELINE_CATALOG).map(([operationType, stages]) => [
    operationType as OperationType,
    new Set(stages.flatMap((descriptor) =>
      descriptor.kind === "llm" && isStageTag(descriptor.stage) ? [descriptor.stage] : []
    ))
  ])
);

export const isLlmStage = isStageTag;

export function operationTimelineStageKind(stage: string): OperationTimelineStageKind {
  if (isLlmStage(stage)) return "llm";
  if (knownNonLlmStages.has(stage)) return "non_llm";
  return "unknown";
}

export function stageBelongsToOperation(stage: string, operationType: OperationType): boolean {
  return ownedStagesByOperation.get(operationType)?.has(stage) ?? false;
}

export function operationTimelineAllowedStages(operationType: OperationType): ReadonlySet<string> {
  return ownedStagesByOperation.get(operationType) ?? new Set<string>();
}

export function spendStageBelongsToOperation(stage: string, operationType: OperationType): boolean {
  return isLlmStage(stage) && stageBelongsToOperation(stage, operationType);
}

export function operationTimelineAllowedNeuralStages(operationType: OperationType): ReadonlySet<StageTag> {
  return ownedNeuralStagesByOperation.get(operationType) ?? new Set<StageTag>();
}

export function operationTimelineLlmSpendStageTags(): readonly StageTag[] {
  return [...new Set(
    Object.values(OPERATION_TIMELINE_CATALOG)
      .flatMap((stages) => stages)
      .flatMap((descriptor) =>
        descriptor.kind === "llm" && isStageTag(descriptor.stage) ? [descriptor.stage] : []
      )
  )];
}
