import type {
  ConceptLesson,
  ImpostorItemDraft,
  MatchingAssignmentVerdict,
  MatchingItemDraft,
  OptionSelectItemDraft,
  StageTag,
  StudyItemBlueprint,
  StudyItemCandidateVerdict,
  StudyItemOptionDraft,
  StudyItemType
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  MatchingAssignmentVerificationPort,
  StudyItemBlueprintPort,
  StudyItemGenerationPort
} from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  answerKeyVerificationSchema,
  answerKeyVerificationValidator,
  matchingAssignmentVerificationSchema,
  matchingAssignmentVerificationValidator,
  impostorSchema,
  impostorValidator,
  matchingSchema,
  matchingValidator,
  optionSelectSchema,
  optionSelectValidator,
  studyItemBlueprintSchema,
  studyItemBlueprintValidator
} from "./toolSchemas";

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

type StudyItemGenerationInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  groundingProvenance: "source_cep" | "source_mentioned" | "generated";
  groundingPassages: GroundingPassage[];
  siblings: { label: string; snippet: string }[];
  facet?: string;
  retryFeedback?: string;
};

type OptionSelectGenerationInput = StudyItemGenerationInput & {
  correctAnswer: { text: string; citation: { passageId: string; evidenceQuote: string } };
};

type StudyItemBlueprintInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  lesson: ConceptLesson;
  siblings: { label: string; snippet: string }[];
  supportedItemTypes: StudyItemType[];
};

type AnswerKeyVerificationInput = Parameters<AnswerKeyVerificationPort["verify"]>[0];

type MatchingAssignmentVerificationInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  question: string;
  prompts: { ordinal: number; text: string }[];
  matches: { ordinal: number; text: string }[];
  groundingPassages: GroundingPassage[];
  siblings: { label: string; snippet: string }[];
};

type OptionSelectArgs = z.infer<typeof optionSelectValidator>;
type ImpostorArgs = z.infer<typeof impostorValidator>;
type MatchingArgs = z.infer<typeof matchingValidator>;
type StudyItemBlueprintArgs = z.infer<typeof studyItemBlueprintValidator>;
type AnswerKeyVerificationArgs = z.infer<typeof answerKeyVerificationValidator>;
type MatchingAssignmentVerificationArgs = z.infer<typeof matchingAssignmentVerificationValidator>;

export const studyOptionSelectGenerationDescriptor: NeuralStageDescriptor<
  OptionSelectGenerationInput,
  OptionSelectArgs,
  OptionSelectItemDraft
> = {
  promptPath: "study-option-select-generation.prompt",
  stageTag: STAGE_TAGS.studyItemGeneration,
  schema: optionSelectSchema,
  validator: optionSelectValidator,
  sentinelInput: {
    ...sentinelStudyItemInput(),
    correctAnswer: { text: "A sentinel passage.", citation: { passageId: "sentinel_passage", evidenceQuote: "A sentinel passage." } }
  },
  maxRetries: 4,
  templateData: (input) => ({
    ...studyItemTemplateData(input),
    correctAnswerText: input.correctAnswer.text,
    correctAnswerPassageId: input.correctAnswer.citation.passageId,
    correctAnswerEvidenceQuote: input.correctAnswer.citation.evidenceQuote
  }),
  mapResult: (args, input) => {
    const correctProvenance: StudyItemOptionDraft["provenance"] = input.groundingProvenance === "generated" ? "generated" : "source";
    const options: StudyItemOptionDraft[] = [
      {
        text: input.correctAnswer.text,
        isCorrect: true,
        provenance: correctProvenance,
        citation: input.correctAnswer.citation
      },
      ...args.distractors.map((text) => ({ text, isCorrect: false, provenance: "generated" as const }))
    ];
    return {
      itemType: "option_select",
      question: `Which statement accurately describes ${input.node.canonicalLabel}?`,
      explanation: input.correctAnswer.text,
      options,
      explorableTerms: []
    };
  }
};

export const studyImpostorGenerationDescriptor: NeuralStageDescriptor<
  StudyItemGenerationInput,
  ImpostorArgs,
  ImpostorItemDraft
> = {
  promptPath: "study-impostor-generation.prompt",
  stageTag: STAGE_TAGS.impostorGeneration,
  schema: impostorSchema,
  validator: impostorValidator,
  sentinelInput: sentinelStudyItemInput(),
  maxRetries: 4,
  templateData: studyItemTemplateData,
  mapResult: (args) => ({
    itemType: "impostor",
    question: args.question,
    // Rebind the flat wire fields (see the impostor schema note in toolSchemas.ts)
    // into the domain truths array; the persisted contract is unchanged.
    truths: [
      { text: args.truth1Text, citation: { passageId: args.truth1PassageId, evidenceQuote: args.truth1Quote } },
      { text: args.truth2Text, citation: { passageId: args.truth2PassageId, evidenceQuote: args.truth2Quote } },
      { text: args.truth3Text, citation: { passageId: args.truth3PassageId, evidenceQuote: args.truth3Quote } }
    ] as ImpostorItemDraft["truths"],
    lie: {
      text: args.lieText,
      reveal: args.reveal,
      lieSource: args.lieSource,
      ...(args.siblingLabel ? { siblingLabel: args.siblingLabel } : {})
    },
    explorableTerms: args.explorableTerms
  })
};

export const studyMatchingGenerationDescriptor: NeuralStageDescriptor<
  StudyItemGenerationInput,
  MatchingArgs,
  MatchingItemDraft
> = {
  promptPath: "study-matching-generation.prompt",
  stageTag: STAGE_TAGS.matchingGeneration,
  schema: matchingSchema,
  validator: matchingValidator,
  sentinelInput: sentinelStudyItemInput(),
  maxRetries: 4,
  templateData: studyItemTemplateData,
  mapResult: (args) => ({ itemType: "matching", question: args.question, pairs: args.pairs, explorableTerms: args.explorableTerms })
};

export const studyItemBlueprintDescriptor: NeuralStageDescriptor<
  StudyItemBlueprintInput,
  StudyItemBlueprintArgs,
  StudyItemBlueprint
> = {
  promptPath: "study-item-blueprint.prompt",
  stageTag: STAGE_TAGS.studyItemBlueprint,
  schema: studyItemBlueprintSchema,
  validator: studyItemBlueprintValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    lesson: {
      conceptLessonId: "sentinel_lesson",
      derivedNodeId: "sentinel_node",
      graphVersionId: null,
      enrichmentId: "sentinel_enrichment",
      generatingModel: "sentinel_model",
      configHash: "sentinel_config",
      canonicalLabel: "Sentinel node",
      sections: [{ kind: "definition", text: "A sentinel definition.", groundingProvenance: "generated" }],
      explorableTerms: []
    },
    siblings: [{ label: "Sentinel sibling", snippet: "A nearby concept." }],
    supportedItemTypes: ["option_select", "impostor", "matching"]
  },
  maxRetries: 2,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: aliasText(input.node.aliases),
    supportedItemTypes: input.supportedItemTypes.join(", "),
    lessonSections: input.lesson.sections.map((section) => `- ${section.kind}: ${section.text}`).join("\n"),
    siblings: renderSiblings(input.siblings)
  }),
  mapResult: (args, input) => ({
    derivedNodeId: input.node.derivedNodeId,
    typePlans: args.typePlans.map((plan) => plan.generate
      ? { itemType: plan.itemType, generate: true, facet: plan.facet ?? "" }
      : { itemType: plan.itemType, generate: false, reason: plan.reason ?? "blueprint declined this item type" })
  })
};

// ONE prompt file behind TWO Neural Stage Descriptors (plan 2026-08-05-001 D8). The stage
// split is not decoration: `stageTag` is a hashed descriptor field, so two separately
// attributable brackets over one prompt necessarily mean two descriptor instances. The
// factory keeps the prompt, schema, and rendering single-sourced across both.
function answerKeyVerificationDescriptor(stageTag: StageTag): NeuralStageDescriptor<
  AnswerKeyVerificationInput,
  AnswerKeyVerificationArgs,
  StudyItemCandidateVerdict[]
> {
  return {
    promptPath: "answer-key-verification.prompt",
    stageTag,
    schema: answerKeyVerificationSchema,
    validator: answerKeyVerificationValidator,
    sentinelInput: {
      itemType: "option_select",
      declaredDomain: "sentinel domain",
      subject: { canonicalLabel: "Sentinel subject", aliases: ["Sentinel alias"] },
      question: "A sentinel question?",
      candidates: [{ ordinal: 0, text: "A sentinel candidate claim." }],
      groundingPassages: [{ passageId: "sentinel_passage", kind: "definition", text: "A sentinel passage." }],
      relatedConcepts: [{ label: "Sentinel neighbor", snippet: "A related concept." }]
    },
    templateData: (input) => ({
      declaredDomain: input.declaredDomain,
      subjectLabel: input.subject.canonicalLabel,
      aliasText: aliasText(input.subject.aliases),
      // Rendered only for option-select, where the question frames each candidate as a
      // proposed answer. An impostor question is a meta-form ("which is FALSE?") that would
      // invert per-statement judging, so its block renders empty (D8).
      questionBlock: input.question ? `\nThe item asks: "${input.question}" Judge each candidate as a proposed answer to it.` : "",
      candidates: renderCandidates(input.candidates),
      passages: renderPassages(input.groundingPassages),
      relatedConcepts: renderSiblings(input.relatedConcepts)
    }),
    mapResult: (args) => args.verdicts.map((entry) => ({ ordinal: entry.ordinal, verdict: entry.verdict, reason: entry.reason }))
  };
}

export const optionSelectKeyVerificationDescriptor = answerKeyVerificationDescriptor(STAGE_TAGS.optionSelectKeyVerification);
export const impostorKeyVerificationDescriptor = answerKeyVerificationDescriptor(STAGE_TAGS.impostorKeyVerification);

// Matching Assignment Verification (plan 2026-08-07-001 D5). A third judge stage on the SAME
// cross-family `kg-independent-judge` alias, so no litellm/config.yaml change — but its own
// prompt file, because it asks a different question: fit across a pair set, not claim truth per
// candidate. Prompts and matches are rendered by the SAME numbered renderer the key-verification
// candidates use (rule 18); the application decides what order and what numbers they carry, which
// is what keeps the answer key out of the rendering.
export const matchingAssignmentVerificationDescriptor: NeuralStageDescriptor<
  MatchingAssignmentVerificationInput,
  MatchingAssignmentVerificationArgs,
  MatchingAssignmentVerdict[]
> = {
  promptPath: "study-matching-assignment-verification.prompt",
  stageTag: STAGE_TAGS.matchingAssignmentVerification,
  schema: matchingAssignmentVerificationSchema,
  validator: matchingAssignmentVerificationValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    question: "A sentinel pairing question?",
    prompts: [{ ordinal: 0, text: "A sentinel aspect." }],
    matches: [{ ordinal: 0, text: "A sentinel answer." }],
    groundingPassages: [{ passageId: "sentinel_passage", kind: "definition", text: "A sentinel passage.", derivedNodeId: "sentinel_node" }],
    siblings: [{ label: "Sentinel sibling", snippet: "A nearby concept." }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: aliasText(input.node.aliases),
    question: input.question,
    prompts: renderCandidates(input.prompts),
    matches: renderCandidates(input.matches),
    passages: renderPassages(input.groundingPassages),
    siblings: renderSiblings(input.siblings)
  }),
  mapResult: (args) => args.verdicts.map((entry) => ({
    promptOrdinal: entry.promptOrdinal,
    matchOrdinal: entry.matchOrdinal,
    verdict: entry.verdict,
    reason: entry.reason
  }))
};

export function createStudyItemGenerationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): StudyItemGenerationPort {
  const optionSelectDescriptor = withModelOverride(studyOptionSelectGenerationDescriptor, modelOverride);
  const impostorDescriptor = withModelOverride(studyImpostorGenerationDescriptor, modelOverride);
  const matchingDescriptor = withModelOverride(studyMatchingGenerationDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(studyOptionSelectGenerationDescriptor.promptPath).model,
    generateOptionSelect: (input) => executeForcedToolStage(client, optionSelectDescriptor, input),
    generateImpostor: (input) => executeForcedToolStage(client, impostorDescriptor, input),
    generateMatching: (input) => executeForcedToolStage(client, matchingDescriptor, input)
  };
}

export function createStudyItemBlueprintPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): StudyItemBlueprintPort {
  const descriptor = withModelOverride(studyItemBlueprintDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(studyItemBlueprintDescriptor.promptPath).model,
    plan: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

// One port, two stages: the item type selects which descriptor — and therefore which
// STAGE_TAG the call's spend and wall-clock attribute to — while the prompt and schema are
// identical. The application never names a stage tag; it names an item type.
export function createAnswerKeyVerificationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): AnswerKeyVerificationPort {
  const optionSelectDescriptor = withModelOverride(optionSelectKeyVerificationDescriptor, modelOverride);
  const impostorDescriptor = withModelOverride(impostorKeyVerificationDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(optionSelectKeyVerificationDescriptor.promptPath).model,
    verify: (input) => executeForcedToolStage(
      client,
      input.itemType === "impostor" ? impostorDescriptor : optionSelectDescriptor,
      input
    )
  };
}

export function createMatchingAssignmentVerificationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): MatchingAssignmentVerificationPort {
  const descriptor = withModelOverride(matchingAssignmentVerificationDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(matchingAssignmentVerificationDescriptor.promptPath).model,
    verify: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

function studyItemTemplateData(input: StudyItemGenerationInput): Record<string, unknown> {
  return {
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: aliasText(input.node.aliases),
    groundingProvenance: input.groundingProvenance,
    passages: renderPassages(input.groundingPassages),
    siblings: renderSiblings(input.siblings),
    facetBlock: input.facet ? `\n\nAssessed facet for this item: ${input.facet}.` : "",
    retryFeedbackBlock: input.retryFeedback ? `\n\nRetry feedback from the previous rejected draft:\n${input.retryFeedback}` : ""
  };
}

function sentinelStudyItemInput(): StudyItemGenerationInput {
  return {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "sentinel_passage", kind: "definition", text: "A sentinel passage.", derivedNodeId: "sentinel_node" }],
    siblings: [{ label: "Sentinel sibling", snippet: "A nearby concept." }],
    facet: "sentinel facet",
    retryFeedback: "sentinel retry feedback"
  };
}

function aliasText(aliases: string[]): string {
  return aliases.length ? ` (aliases: ${aliases.join(", ")})` : "";
}

// Numbered by the candidate's own ordinal, which the judge echoes back — so a response that
// reorders or omits entries stays alignable without trusting array position.
function renderCandidates(candidates: { ordinal: number; text: string }[]): string {
  return candidates.map((candidate) => `${candidate.ordinal}. "${candidate.text}"`).join("\n") || "(none)";
}

function renderPassages(passages: readonly { passageId: string; kind: "definition" | "mention"; text: string }[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

function renderSiblings(siblings: { label: string; snippet: string }[]): string {
  return siblings.length
    ? siblings.map((sibling) => `- ${sibling.label}${sibling.snippet ? `: "${sibling.snippet}"` : ""}`).join("\n")
    : "(no same-domain neighbors provided)";
}
