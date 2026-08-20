import { STAGE_TAGS } from "@lrnki/domain-core";
import type { ScaffoldContentDraft, ScaffoldContentPort, ScaffoldOutline, ScaffoldOutlinePort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { formatGroundingAdmissionContext } from "./groundingGenerationAdapters";
import { readPromptFile } from "./promptFile";
import { scaffoldContentSchema, scaffoldContentValidator, scaffoldOutlineSchema, scaffoldOutlineValidator } from "./toolSchemas";

// Learner-Scoped Scaffold generation adapters (plan 2026-07-12-002 U3, KTD10). Two small
// forced named tools on the existing kg-claim-extraction alias. Domain-neutral prompts; the
// descriptors join the mechanical config-hash roster and the MiMo trailing-nullable congruence
// test. Content is always labeled generated and citation-free — the adapter maps the wire args
// straight through, and the application module attaches the generated identity and options.

type ScaffoldOutlineInput = {
  declaredDomain: string;
  parentLabel: string;
  term: string;
  existingLabels: string[];
  retryFeedback?: string;
};

type ScaffoldContentInput = {
  declaredDomain: string;
  label: string;
  groundingContext: Parameters<ScaffoldContentPort["generate"]>[0]["groundingContext"];
  groundingText: string;
  retryFeedback?: string;
};

type ScaffoldOutlineArgs = z.infer<typeof scaffoldOutlineValidator>;
type ScaffoldContentArgs = z.infer<typeof scaffoldContentValidator>;

export const scaffoldOutlineGenerationDescriptor: NeuralStageDescriptor<ScaffoldOutlineInput, ScaffoldOutlineArgs, ScaffoldOutline> = {
  promptPath: "learner-scaffold-outline-generation.prompt",
  stageTag: STAGE_TAGS.scaffoldOutlineGeneration,
  schema: scaffoldOutlineSchema,
  validator: scaffoldOutlineValidator,
  sentinelInput: { declaredDomain: "sentinel domain", parentLabel: "Sentinel parent", term: "sentinel term", existingLabels: ["Sentinel existing"], retryFeedback: "sentinel retry feedback" },
  maxRetries: 2,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    parentLabel: input.parentLabel,
    term: input.term,
    existingLabels: input.existingLabels.length ? input.existingLabels.map((label) => `- ${label}`).join("\n") : "(none)",
    retryFeedbackBlock: input.retryFeedback ? `\n\nRetry feedback from the previous rejected outline:\n${input.retryFeedback}` : ""
  }),
  mapResult: (args) => ({ steps: args.steps.map((step) => ({ label: step.label, rationale: step.rationale })) })
};

export const scaffoldContentGenerationDescriptor: NeuralStageDescriptor<ScaffoldContentInput, ScaffoldContentArgs, ScaffoldContentDraft> = {
  promptPath: "learner-scaffold-content-generation.prompt",
  stageTag: STAGE_TAGS.scaffoldContentGeneration,
  schema: scaffoldContentSchema,
  validator: scaffoldContentValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    label: "Sentinel sub-concept",
    groundingContext: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "sentinel_anchor",
        canonicalLabel: "Sentinel anchor",
        definitionPassages: ["A sentinel anchor definition."]
      }
    },
    groundingText: "A sentinel grounding paragraph.",
    retryFeedback: "A sentinel rejected-draft reason."
  },
  maxRetries: 2,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    label: input.label,
    contextLines: formatGroundingAdmissionContext(input.groundingContext),
    groundingText: input.groundingText,
    retryFeedbackBlock: input.retryFeedback
      ? `\n\nRetry feedback from the previous rejected complete draft:\n${input.retryFeedback}`
      : ""
  }),
  mapResult: (args) => ({
    microLesson: args.microLesson,
    question: args.question,
    explanation: args.explanation,
    correctAnswer: args.correctAnswer,
    distractors: args.distractors
  })
};

export function createScaffoldOutlinePort(client: LiteLlmForcedToolClient): ScaffoldOutlinePort {
  return {
    model: readPromptFile(scaffoldOutlineGenerationDescriptor.promptPath).model,
    propose: (input) => executeForcedToolStage(client, scaffoldOutlineGenerationDescriptor, input)
  };
}

export function createScaffoldContentPort(client: LiteLlmForcedToolClient): ScaffoldContentPort {
  return {
    model: readPromptFile(scaffoldContentGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, scaffoldContentGenerationDescriptor, input)
  };
}
