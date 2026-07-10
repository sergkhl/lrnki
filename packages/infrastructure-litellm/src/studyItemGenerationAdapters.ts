import type {
  ConceptLesson,
  ImpostorItemDraft,
  ImpostorLieValidityJudgment,
  MatchingItemDraft,
  OptionSelectItemDraft,
  StudyItemBlueprint,
  StudyItemOptionDraft,
  StudyItemType
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { ImpostorLieValidityJudgmentPort, StudyItemBlueprintPort, StudyItemGenerationPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  impostorLieValidityJudgmentSchema,
  impostorLieValidityJudgmentValidator,
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

type StudyItemBlueprintInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  lesson: ConceptLesson;
  siblings: { label: string; snippet: string }[];
  supportedItemTypes: StudyItemType[];
};

type ImpostorLieValidityInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  lie: { text: string; reveal: string };
  groundingPassages: GroundingPassage[];
  siblings: { label: string; snippet: string }[];
};

type OptionSelectArgs = z.infer<typeof optionSelectValidator>;
type ImpostorArgs = z.infer<typeof impostorValidator>;
type MatchingArgs = z.infer<typeof matchingValidator>;
type StudyItemBlueprintArgs = z.infer<typeof studyItemBlueprintValidator>;
type ImpostorLieValidityArgs = z.infer<typeof impostorLieValidityJudgmentValidator>;

export const studyOptionSelectGenerationDescriptor: NeuralStageDescriptor<
  StudyItemGenerationInput,
  OptionSelectArgs,
  OptionSelectItemDraft
> = {
  promptPath: "study-option-select-generation.prompt",
  stageTag: STAGE_TAGS.studyItemGeneration,
  schema: optionSelectSchema,
  validator: optionSelectValidator,
  sentinelInput: sentinelStudyItemInput(),
  maxRetries: 4,
  templateData: studyItemTemplateData,
  mapResult: (args, input) => {
    const correctProvenance: StudyItemOptionDraft["provenance"] = input.groundingProvenance === "generated" ? "generated" : "source";
    const options: StudyItemOptionDraft[] = [
      { text: args.correctAnswer.text, isCorrect: true, provenance: correctProvenance, citation: args.correctAnswer.citation },
      ...args.distractors.map((text) => ({ text, isCorrect: false, provenance: "generated" as const }))
    ];
    return { itemType: "option_select", question: args.question, explanation: args.explanation, options };
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
    }
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
  mapResult: (args) => ({ itemType: "matching", question: args.question, pairs: args.pairs })
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
      derivedNodeId: "sentinel_node",
      graphVersionId: null,
      enrichmentId: "sentinel_enrichment",
      generatingModel: "sentinel_model",
      configHash: "sentinel_config",
      canonicalLabel: "Sentinel node",
      sections: [{ kind: "definition", text: "A sentinel definition.", groundingProvenance: "generated" }]
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

export const impostorLieValidityJudgmentDescriptor: NeuralStageDescriptor<
  ImpostorLieValidityInput,
  ImpostorLieValidityArgs,
  ImpostorLieValidityJudgment
> = {
  promptPath: "impostor-lie-validity-judgment.prompt",
  stageTag: STAGE_TAGS.impostorLieValidityJudgment,
  schema: impostorLieValidityJudgmentSchema,
  validator: impostorLieValidityJudgmentValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    lie: { text: "A false sentinel statement.", reveal: "The statement is false." },
    groundingPassages: [{ passageId: "sentinel_passage", kind: "definition", text: "A sentinel passage.", derivedNodeId: "sentinel_node" }],
    siblings: [{ label: "Sentinel sibling", snippet: "A nearby concept." }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: aliasText(input.node.aliases),
    lieText: input.lie.text,
    reveal: input.lie.reveal,
    passages: renderPassages(input.groundingPassages),
    siblings: renderSiblings(input.siblings)
  }),
  mapResult: (result) => ({ verdict: result.verdict, reason: result.reason })
};

export function createStudyItemGenerationPort(client: LiteLlmForcedToolClient): StudyItemGenerationPort {
  return {
    model: readPromptFile(studyOptionSelectGenerationDescriptor.promptPath).model,
    generateOptionSelect: (input) => executeForcedToolStage(client, studyOptionSelectGenerationDescriptor, input),
    generateImpostor: (input) => executeForcedToolStage(client, studyImpostorGenerationDescriptor, input),
    generateMatching: (input) => executeForcedToolStage(client, studyMatchingGenerationDescriptor, input)
  };
}

export function createStudyItemBlueprintPort(client: LiteLlmForcedToolClient): StudyItemBlueprintPort {
  return {
    model: readPromptFile(studyItemBlueprintDescriptor.promptPath).model,
    plan: (input) => executeForcedToolStage(client, studyItemBlueprintDescriptor, input)
  };
}

export function createImpostorLieValidityJudgmentPort(client: LiteLlmForcedToolClient): ImpostorLieValidityJudgmentPort {
  return {
    model: readPromptFile(impostorLieValidityJudgmentDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, impostorLieValidityJudgmentDescriptor, input)
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

function renderPassages(passages: GroundingPassage[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

function renderSiblings(siblings: { label: string; snippet: string }[]): string {
  return siblings.length
    ? siblings.map((sibling) => `- ${sibling.label}${sibling.snippet ? `: "${sibling.snippet}"` : ""}`).join("\n")
    : "(no same-domain neighbors provided)";
}
