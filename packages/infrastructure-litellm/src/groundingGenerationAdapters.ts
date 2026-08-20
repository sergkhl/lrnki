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
  regeneratedGroundingBundleSchema,
  regeneratedGroundingBundleValidator,
  buildClaimFactualityJudgmentSchema,
  buildClaimFactualityJudgmentValidator,
  buildClaimVerificationAnsweringSchema,
  buildClaimVerificationAnsweringValidator,
  buildClaimVerificationQuestionPlanningSchema,
  buildClaimVerificationQuestionPlanningValidator,
  MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET
} from "./toolSchemas";

type GroundingGenerationInput = Parameters<GroundingGenerationPort["generate"]>[0];
type InitialGroundingGenerationInput = Omit<GroundingGenerationInput, "rejectionFeedback" | "verificationEvidence">;
type GroundingRegenerationInput = Extract<GroundingGenerationInput, { rejectionFeedback: string }>;
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
    strongestLiteralClaim: string;
    scopeAudit: string;
    materialObjection: string | null;
    disposition: "accepted" | "rejected";
    rationale: string;
  }>;
};
type ClaimJudgmentOutput = Awaited<ReturnType<ClaimFactualityJudgmentPort["judge"]>>;

export const groundingGenerationDescriptor: NeuralStageDescriptor<
  InitialGroundingGenerationInput,
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
    contextLines: formatGroundingAdmissionContext(input.context)
  }),
  mapResult: (result, input) => generatedBundleFromResult(
    result,
    input.context,
    readPromptFile(groundingGenerationDescriptor.promptPath).model
  )
};

export const groundingRegenerationDescriptor: NeuralStageDescriptor<
  GroundingRegenerationInput,
  GroundingGenerationArgs,
  GeneratedGroundingBundle
> = {
  promptPath: "grounding-regeneration.prompt",
  stageTag: STAGE_TAGS.groundingGeneration,
  schema: regeneratedGroundingBundleSchema,
  validator: regeneratedGroundingBundleValidator,
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
    },
    rejectionFeedback: "The prior definition asserted an unsupported implementation detail.",
    verificationEvidence: [{
      targetKey: "definition:0:claim:0",
      sampleIndex: 0,
      question: "What minimally defines the sentinel concept?",
      answer: "The sentinel concept is defined by its sentinel relationship."
    }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    rejectionFeedback: input.rejectionFeedback,
    verificationEvidence: input.verificationEvidence.map((entry) => JSON.stringify({
      sample: entry.sampleIndex + 1,
      targetKey: entry.targetKey,
      question: entry.question,
      answer: entry.answer
    })).join("\n")
  }),
  mapResult: (result, input) => generatedBundleFromResult(
    result,
    input.context,
    readPromptFile(groundingRegenerationDescriptor.promptPath).model
  )
};

export function createGroundingGenerationPort(client: LiteLlmForcedToolClient): GroundingGenerationPort {
  const generationModel = readPromptFile(groundingGenerationDescriptor.promptPath).model;
  const regenerationModel = readPromptFile(groundingRegenerationDescriptor.promptPath).model;
  if (generationModel !== regenerationModel) {
    throw new Error("Grounding Generation and its bounded replacement must use the same model alias.");
  }
  return {
    model: generationModel,
    generate: (input) => input.rejectionFeedback === undefined
      ? executeForcedToolStage(client, groundingGenerationDescriptor, input)
      : executeForcedToolStage(client, groundingRegenerationDescriptor, input)
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
    const hierarchyQuestion = scopeHierarchyQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const mechanismQuestion = mechanismRelationQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const processQuestion = processRoleQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const required = [
      { targetKey: firstTarget.targetKey, question: identityQuestion },
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: applicationQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: hierarchyQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: mechanismQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: processQuestion }))
    ];
    return appendPlannerQuestionsWithinTargetCap(required, result.questions);
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
  ClaimJudgmentOutput
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
  mapResult: (result) => result.judgments.map(({ targetKey, disposition, rationale }) => ({
    targetKey,
    disposition,
    rationale
  }))
};

// A second model family evaluates the same evidence packet through the same forced-tool schema but
// an intentionally adversarial prompt. The primary establishes factual support; this challenger
// tries to falsify literal scope and definition adequacy so familiar common-case wording cannot
// outvote a material objection. Both descriptors remain explicit config-hash identities.
export const claimFactualityChallengeDescriptor: NeuralStageDescriptor<
  ClaimJudgmentInput,
  ClaimJudgmentArgs,
  ClaimJudgmentOutput
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
  return `Independent code-owned concept-identity check: What are the necessary defining features of "${canonicalLabel}" in ${declaredDomain}, and how does it differ from the closest commonly confused concepts? State each concept separately rather than using a shared summary.`;
}

function contextApplicationQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned context-application check: Within ${owningContext}, how does "${canonicalLabel}" in ${declaredDomain} apply? State its mechanism or behavior, required conditions, material outputs or effects, and limits. Identify commonly attributed consequences that do not actually follow in this context, and separate any named senses, entities, or implementations that behave differently.`;
}

function scopeHierarchyQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned hierarchy check: Across the established systems, types, implementations, populations, or cases relevant to ${owningContext} in ${declaredDomain}, enumerate the subtype hierarchy of "${canonicalLabel}" far enough to include nested or uncommon variants with different mechanisms, inputs, outputs, or classifications. State the membership criterion and keep related, homologous, derived, analogous, precursor, component, inactive, and nonfunctional entities outside the hierarchy unless they satisfy that criterion. Which features are invariant and which vary? Name a concrete counterexample that actually belongs to the category for any familiar classification or mechanism that is not universal, and state the explicit scope qualifiers an unqualified explanation requires. Say so rather than inventing a hierarchy when none is established.`;
}

function mechanismRelationQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned mechanism-role check: For each actual subtype or implementation of "${canonicalLabel}" relevant to ${owningContext} in ${declaredDomain}, identify the actor, object acted on or moved, reference object, direction, path, and resulting change. Explicitly distinguish whether a separate entity passes through a boundary, a broken or attached part rotates around another part, an entity slides along a reference, ownership is transferred, a structure deforms, or entities associate or dissociate. Which exact relation applies to each subtype? Do not collapse distinct participant-role or spatial relations under one umbrella verb, and do not invent a mechanism when none applies.`;
}

function processRoleQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned process-role check: If "${canonicalLabel}" names or participates in a process relevant to ${owningContext} in ${declaredDomain}, separate the bulk path from initiation, completion, maintenance, repair, and alternative paths, and state what owns each. Which prominent auxiliary or boundary-case mechanism must not be described as owning the whole process? If no such process decomposition is established, say so rather than inventing one.`;
}

function appendPlannerQuestionsWithinTargetCap(
  required: readonly ClaimVerificationQuestion[],
  planned: readonly ClaimVerificationQuestion[]
): ClaimVerificationQuestion[] {
  const combined = [...required];
  const countByTarget = new Map<string, number>();
  for (const question of required) {
    const count = (countByTarget.get(question.targetKey) ?? 0) + 1;
    if (count > MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET) {
      throw new Error(`Code-owned verification questions exceed the per-target cap for ${question.targetKey}.`);
    }
    countByTarget.set(question.targetKey, count);
  }
  for (const question of planned) {
    const count = countByTarget.get(question.targetKey);
    if (count === undefined) {
      throw new Error(`Verification question planner returned unknown targetKey ${question.targetKey}.`);
    }
    if (required.some(
      (codeOwned) => codeOwned.targetKey === question.targetKey && codeOwned.question === question.question
    )) continue;
    if (count >= MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET) continue;
    combined.push(question);
    countByTarget.set(question.targetKey, count + 1);
  }
  return combined;
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
