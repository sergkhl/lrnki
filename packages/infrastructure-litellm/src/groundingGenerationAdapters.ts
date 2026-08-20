import { STAGE_TAGS, type GeneratedGroundingBundle, type GroundingAdmissionContext } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestion,
  ClaimVerificationQuestionPlanningPort,
  GroundingGenerationPort
} from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  generatedGroundingBundleSchema,
  generatedGroundingBundleValidator,
  buildClaimFactualityJudgmentSchema,
  buildClaimFactualityJudgmentValidator,
  buildClaimVerificationAnsweringSchema,
  buildClaimVerificationAnsweringValidator,
  buildClaimVerificationQuestionPlanningSchema,
  buildClaimVerificationQuestionPlanningValidator
} from "./toolSchemas";

type GroundingGenerationInput = Parameters<GroundingGenerationPort["generate"]>[0];
type GroundingGenerationArgs = {
  definitions: { text: string }[];
  mentions: { text: string }[];
  rationale: string;
};
type ClaimQuestionPlanningInput = Parameters<ClaimVerificationQuestionPlanningPort["plan"]>[0];
type ClaimQuestionPlanningArgs = { questions: ClaimVerificationQuestion[] };
type ClaimAnsweringInput = Parameters<ClaimVerificationAnsweringPort["answer"]>[0];
type ClaimAnsweringArgs = { answers: Array<{ questionKey: string; answer: string }> };
type ClaimJudgmentInput = Parameters<ClaimFactualityJudgmentPort["judge"]>[0];
type ClaimJudgmentArgs = {
  judgments: Array<{
    targetKey: string;
    disposition: "accepted" | "rejected";
    rationale: string;
  }>;
};

export const groundingGenerationDescriptor: NeuralStageDescriptor<
  GroundingGenerationInput,
  GroundingGenerationArgs,
  GeneratedGroundingBundle
> = {
  promptPath: "grounding-generation.prompt",
  stageTag: STAGE_TAGS.groundingGeneration,
  schema: generatedGroundingBundleSchema,
  validator: generatedGroundingBundleValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    canonicalLabel: "Sentinel concept",
    context: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "sentinel_anchor",
        canonicalLabel: "Sentinel anchor",
        definitionPassages: ["Sentinel definition."]
      }
    }
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    rejectionContext: input.rejectionFeedback
      ? `A previous draft was rejected after independent factual verification. Generate a fresh bundle that resolves this bounded feedback, then rely on the later verifier for admission:\n${input.rejectionFeedback}`
      : ""
  }),
  mapResult: (result, input) => generatedBundleFromResult(
    result,
    input.context,
    readPromptFile(groundingGenerationDescriptor.promptPath).model
  )
};

export function createGroundingGenerationPort(client: LiteLlmForcedToolClient): GroundingGenerationPort {
  return {
    model: readPromptFile(groundingGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, groundingGenerationDescriptor, input)
  };
}

export const claimVerificationQuestionPlanningDescriptor: NeuralStageDescriptor<
  ClaimQuestionPlanningInput,
  ClaimQuestionPlanningArgs,
  ClaimVerificationQuestion[]
> = {
  promptPath: "claim-verification-question-planning.prompt",
  stageTag: STAGE_TAGS.groundingVerificationQuestionPlanning,
  schema: (input) => buildClaimVerificationQuestionPlanningSchema(input.targets.map((target) => target.targetKey)),
  validator: (input) => buildClaimVerificationQuestionPlanningValidator(input.targets.map((target) => target.targetKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    canonicalLabel: "Sentinel concept",
    context: { kind: "originating_topic", topic: "Sentinel topic" },
    targets: [{ targetKey: "sentinel:definition", targetPurpose: "definition", text: "A sentinel concept is a validation placeholder." }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    claimTargets: formatTargets(input.targets)
  }),
  mapResult: (result, input) => {
    const firstTarget = input.targets[0];
    if (!firstTarget) return result.questions;
    const identityQuestion = conceptIdentityQuestion(input.canonicalLabel, input.declaredDomain);
    const applicationQuestion = contextApplicationQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const variationQuestion = scopeVariationQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const required = [
      { targetKey: firstTarget.targetKey, question: identityQuestion },
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: applicationQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: variationQuestion }))
    ];
    return [
      ...required,
      ...result.questions.filter((question) => !required.some(
        (codeOwned) => codeOwned.targetKey === question.targetKey && codeOwned.question === question.question
      ))
    ];
  }
};

export function createClaimVerificationQuestionPlanningPort(
  client: LiteLlmForcedToolClient
): ClaimVerificationQuestionPlanningPort {
  return {
    model: readPromptFile(claimVerificationQuestionPlanningDescriptor.promptPath).model,
    plan: (input) => executeForcedToolStage(client, claimVerificationQuestionPlanningDescriptor, input)
  };
}

export const claimVerificationAnsweringDescriptor: NeuralStageDescriptor<
  ClaimAnsweringInput,
  ClaimAnsweringArgs,
  ClaimAnsweringArgs["answers"]
> = {
  promptPath: "claim-verification-answering.prompt",
  stageTag: STAGE_TAGS.groundingVerificationAnswering,
  schema: (input) => buildClaimVerificationAnsweringSchema(input.questions.map((question) => question.questionKey)),
  validator: (input) => buildClaimVerificationAnsweringValidator(input.questions.map((question) => question.questionKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    canonicalLabel: "Sentinel concept",
    context: { kind: "originating_topic", topic: "Sentinel topic" },
    questions: [{ questionKey: "sentinel:q:0", question: "What is the established meaning of a sentinel concept?" }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    questions: input.questions.map((question) => `[${question.questionKey}] ${question.question}`).join("\n")
  }),
  mapResult: (result) => result.answers
};

export function createClaimVerificationAnsweringPort(
  client: LiteLlmForcedToolClient
): ClaimVerificationAnsweringPort {
  return {
    model: readPromptFile(claimVerificationAnsweringDescriptor.promptPath).model,
    answer: (input) => executeForcedToolStage(client, claimVerificationAnsweringDescriptor, input)
  };
}

export const claimFactualityJudgmentDescriptor: NeuralStageDescriptor<
  ClaimJudgmentInput,
  ClaimJudgmentArgs,
  ClaimJudgmentArgs["judgments"]
> = {
  promptPath: "claim-factuality-judgment.prompt",
  stageTag: STAGE_TAGS.groundingFactualityRevision,
  schema: (input) => buildClaimFactualityJudgmentSchema(input.targets.map((target) => target.targetKey)),
  validator: (input) => buildClaimFactualityJudgmentValidator(input.targets.map((target) => target.targetKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    canonicalLabel: "Sentinel concept",
    context: { kind: "originating_topic", topic: "Sentinel topic" },
    targets: [{ targetKey: "sentinel:definition", targetPurpose: "definition", text: "A sentinel concept is a validation placeholder." }],
    verificationAnswers: [{
      targetKey: "sentinel:definition",
      questionKey: "sentinel:q:0",
      question: "What is the established meaning of a sentinel concept?",
      answer: "A sentinel is a known placeholder used to exercise validation."
    }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    claimTargets: formatTargets(input.targets),
    verificationChecks: input.verificationAnswers
      .map((check) => `[target ${check.targetKey}; question ${check.questionKey}] ${check.question}\nAnswer: ${check.answer}`)
      .join("\n")
  }),
  mapResult: (result) => result.judgments
};

// A second model family evaluates the same evidence packet through the same forced-tool schema but
// an intentionally adversarial prompt. The primary establishes factual support; this challenger
// tries to falsify literal scope and definition adequacy so familiar common-case wording cannot
// outvote a material objection. Both descriptors remain explicit config-hash identities.
export const claimFactualityChallengeDescriptor: NeuralStageDescriptor<
  ClaimJudgmentInput,
  ClaimJudgmentArgs,
  ClaimJudgmentArgs["judgments"]
> = {
  ...claimFactualityJudgmentDescriptor,
  promptPath: "claim-factuality-challenge.prompt"
};

export function createClaimFactualityJudgmentPort(
  client: LiteLlmForcedToolClient
): ClaimFactualityJudgmentPort {
  return {
    model: readPromptFile(claimFactualityJudgmentDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, claimFactualityJudgmentDescriptor, input)
  };
}

export function createClaimFactualityChallengePort(
  client: LiteLlmForcedToolClient
): ClaimFactualityJudgmentPort {
  return {
    model: readPromptFile(claimFactualityChallengeDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, claimFactualityChallengeDescriptor, input)
  };
}

export function formatGroundingAdmissionContext(context: GroundingAdmissionContext): string {
  if (context.kind === "originating_topic") {
    return `Originating topic: "${context.topic}".`;
  }
  return [
    `Scaffolded anchor: "${context.anchor.canonicalLabel}" (${context.anchor.reference}).`,
    "The anchor's named or structurally identified scope is a hard limit on every generated claim.",
    ...context.anchor.definitionPassages.map((passage) => `Anchor Definition Passage: "${passage}"`)
  ].join("\n");
}

function formatTargets(targets: readonly { targetKey: string; targetPurpose: "definition" | "support"; text: string }[]): string {
  return targets.map((target) => JSON.stringify(target)).join("\n");
}

function conceptIdentityQuestion(canonicalLabel: string, declaredDomain: string): string {
  return `What are the necessary defining features of "${canonicalLabel}" in ${declaredDomain}, and how does it differ from the closest commonly confused concepts? State each concept separately rather than using a shared summary.`;
}

function contextApplicationQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Within ${owningContext}, how does "${canonicalLabel}" in ${declaredDomain} apply? State its mechanism or behavior, required conditions, material outputs or effects, and limits. Identify commonly attributed consequences that do not actually follow in this context, and separate any named senses, entities, or implementations that behave differently.`;
}

function scopeVariationQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Across the systems, types, implementations, populations, or cases relevant to ${owningContext} in ${declaredDomain}, which features of "${canonicalLabel}" are invariant, which vary, and what explicit scope qualifiers are required before stating a classification, mechanism, or effect as an unqualified explanation?`;
}

function generatedBundleFromResult(
  result: GroundingGenerationArgs,
  context: GroundingAdmissionContext,
  generatingModel: string
): GeneratedGroundingBundle {
  const notApplicable = {
    disposition: "not_applicable_by_grounding" as const,
    rationale: "llm_grounded generated passage has no cited source block"
  };
  return {
    groundingOrigin: "llm_grounded",
    definitions: result.definitions.map((passage) => ({
      passageType: "definition",
      text: passage.text,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: notApplicable
    })),
    mentions: result.mentions.map((passage) => ({
      passageType: "mention",
      text: passage.text,
      groundingOrigin: "llm_grounded",
      headingPath: [],
      locator: {},
      verbatimCheck: notApplicable
    })),
    groundingAnchorReferences: context.kind === "scaffolded_anchor" ? [context.anchor.reference] : [],
    generatingModel,
    rationale: result.rationale
  };
}
