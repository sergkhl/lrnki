import { STAGE_TAGS, type GeneratedGroundingBundle, type GroundingAdmissionContext } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestion,
  ClaimVerificationQuestionPlanningPort,
  GroundingGenerationPort
} from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  generatedGroundingBundleSchema,
  generatedGroundingBundleValidator,
  buildClaimFactualityJudgmentSchema,
  buildClaimFactualityJudgmentValidator,
  buildClaimVerificationAnsweringSchema,
  buildClaimVerificationAnsweringValidator,
  buildClaimVerificationQuestionPlanningSchema,
  buildClaimVerificationQuestionPlanningValidator,
  MAX_CLAIM_VERIFICATION_QUESTIONS_PER_TARGET
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
type ClaimAnsweringArgs = { answers: Readonly<Record<string, string>> };
type ClaimAnsweringOutput = Awaited<ReturnType<ClaimVerificationAnsweringPort["answer"]>>;
type ClaimJudgmentInput = Parameters<ClaimFactualityJudgmentPort["judge"]>[0];
type ClaimJudgmentArgs = {
  judgments: Array<{
    targetKey: string;
    strongestLiteralClaim: string;
    categoryBoundaryAudit: string;
    scopeAudit: string;
    materialObjection: string | null;
    disposition: "accepted" | "rejected";
    rationale: string;
  }>;
};
type ClaimJudgmentOutput = Awaited<ReturnType<ClaimFactualityJudgmentPort["judge"]>>;

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
    identityContext: {
      aliases: ["Sentinel alternate name"],
      peerConcepts: [{ canonicalLabel: "Nearby sentinel concept", aliases: ["Nearby sentinel alias"] }]
    },
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
    identityLines: formatGroundingIdentityContext(input.identityContext),
    contextLines: formatGroundingAdmissionContext(input.context)
  }),
  mapResult: (result, input, model) => generatedBundleFromResult(
    result,
    input.context,
    model
  )
};

export function createGroundingGenerationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): GroundingGenerationPort {
  const descriptor = withModelOverride(groundingGenerationDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(groundingGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, descriptor, input)
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
    const categoryQuestion = categoryBoundaryQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const relationAndProcessQuestion = relationAndProcessAuditQuestion(
      input.canonicalLabel,
      input.declaredDomain,
      input.context
    );
    const required = [
      { targetKey: firstTarget.targetKey, question: identityQuestion },
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: applicationQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: categoryQuestion })),
      ...input.targets.map((target) => ({ targetKey: target.targetKey, question: relationAndProcessQuestion }))
    ];
    return appendPlannerQuestionsWithinTargetCap(required, result.questions);
  }
};

export function createClaimVerificationQuestionPlanningPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): ClaimVerificationQuestionPlanningPort {
  const descriptor = withModelOverride(claimVerificationQuestionPlanningDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(claimVerificationQuestionPlanningDescriptor.promptPath).model,
    plan: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

export const claimVerificationAnsweringDescriptor: NeuralStageDescriptor<
  ClaimAnsweringInput,
  ClaimAnsweringArgs,
  ClaimAnsweringOutput
> = {
  promptPath: "claim-verification-answering.prompt",
  stageTag: STAGE_TAGS.groundingVerificationAnswering,
  schema: (input) => buildClaimVerificationAnsweringSchema(input.questions.map((question) => question.questionKey)),
  validator: (input) => buildClaimVerificationAnsweringValidator(input.questions.map((question) => question.questionKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    canonicalLabel: "Sentinel concept",
    context: { kind: "originating_topic", topic: "Sentinel topic" },
    questions: [
      { questionKey: "sentinel:verification:0:question:0", question: "What is the established meaning of a sentinel concept?" },
      { questionKey: "sentinel:verification:0:question:1", question: "What is the nearest category boundary?" },
      { questionKey: "sentinel:verification:0:question:2", question: "What conditions limit the concept?" },
      { questionKey: "sentinel:verification:0:question:3", question: "What material variations are established?" },
      { questionKey: "sentinel:verification:0:question:4", question: "What process roles must stay distinct?" },
      {
        questionKey: "sentinel-candidate:definition:0:claim:0:verification:2:question:5",
        question: "What counterexample tests the strongest universal interpretation?"
      }
    ]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.canonicalLabel,
    contextLines: formatGroundingAdmissionContext(input.context),
    questions: input.questions.map((question) => `[${question.questionKey}] ${question.question}`).join("\n")
  }),
  mapResult: (result, input) => input.questions.map(({ questionKey }) => ({
    questionKey,
    answer: result.answers[questionKey]!
  }))
};

export function createClaimVerificationAnsweringPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): ClaimVerificationAnsweringPort {
  const descriptor = withModelOverride(claimVerificationAnsweringDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(claimVerificationAnsweringDescriptor.promptPath).model,
    answer: (input) => executeForcedToolStage(client, descriptor, input)
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
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): ClaimFactualityJudgmentPort {
  const descriptor = withModelOverride(claimFactualityJudgmentDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(claimFactualityJudgmentDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

export function createClaimFactualityChallengePort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): ClaimFactualityJudgmentPort {
  const descriptor = withModelOverride(claimFactualityChallengeDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(claimFactualityChallengeDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, descriptor, input)
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

function formatGroundingIdentityContext(identity: GroundingGenerationInput["identityContext"]): string {
  const aliases = identity.aliases.length === 0
    ? "Candidate alternate names: none supplied."
    : `Candidate alternate names for the same identity: ${identity.aliases.map((alias) => JSON.stringify(alias)).join(", ")}.`;
  if (identity.peerConcepts.length === 0) {
    return `${aliases}\nSame-context peer concepts: none.`;
  }
  const peers = identity.peerConcepts.map((peer) => {
    const peerAliases = peer.aliases.length === 0
      ? "no alternate names supplied"
      : `alternate names ${peer.aliases.map((alias) => JSON.stringify(alias)).join(", ")}`;
    return `- ${JSON.stringify(peer.canonicalLabel)} (${peerAliases})`;
  });
  return [
    aliases,
    "Same-context peer concepts are nearby but distinct identities; do not absorb or substitute them:",
    ...peers
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

function categoryBoundaryQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned category-boundary check: Across the established cases relevant to ${owningContext} in ${declaredDomain}, state the defining membership criterion of "${canonicalLabel}". Enumerate materially different valid member forms, constituents or participant roles, holders or containers, representations, cardinalities, subtypes, and implementations; distinguish exhaustive requirements from common examples. Keep related, analogous, precursor, component, inactive, and nonfunctional entities outside the category unless they meet its criterion. Name an actual member that a familiar narrowed definition would exclude or misclassify, and state any qualifier an unqualified explanation requires. Say that no such variation is established rather than inventing one.`;
}

function relationAndProcessAuditQuestion(
  canonicalLabel: string,
  declaredDomain: string,
  context: GroundingAdmissionContext
): string {
  const owningContext = context.kind === "originating_topic"
    ? `the originating topic "${context.topic}"`
    : `the exact scaffolded anchor "${context.anchor.canonicalLabel}"`;
  return `Independent code-owned relation-and-process check: If "${canonicalLabel}" has a material mechanism or process role relevant to ${owningContext} in ${declaredDomain}, compare its actual variants by actor, object acted on or moved, reference object, direction, path, and resulting change; do not collapse passage, rotation, sliding, transfer, deformation, association, or dissociation under one umbrella relation. Separate the bulk path from initiation, completion, maintenance, repair, and alternatives, and state what owns each. Name any prominent auxiliary or boundary-case mechanism that must not be described as the whole process. Say that no such mechanism or process decomposition is established rather than inventing one.`;
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
