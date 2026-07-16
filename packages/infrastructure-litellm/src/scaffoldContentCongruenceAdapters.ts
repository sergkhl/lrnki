import { STAGE_TAGS, type ScaffoldContentCongruenceVerdict } from "@lrnki/domain-core";
import type { ScaffoldContentCongruencePort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { scaffoldContentCongruenceSchema, scaffoldContentCongruenceValidator } from "./toolSchemas";

// Scaffold-content congruence descriptor (plan 2026-07-16-001 U3, KTD3). Runs on the cross-family
// independent judge (kg-independent-judge) so the scaffold generator never grades its own output.
// A MEASUREMENT stage: it joins no operation config hash and its calls carry no operation_id; the
// catalog claim under `scaffold` only satisfies stage-tag set-equality.

type ScaffoldContentCongruenceInput = Parameters<ScaffoldContentCongruencePort["judge"]>[0];
type ScaffoldContentCongruenceArgs = z.infer<typeof scaffoldContentCongruenceValidator>;

export const scaffoldContentCongruenceDescriptor: NeuralStageDescriptor<
  ScaffoldContentCongruenceInput,
  ScaffoldContentCongruenceArgs,
  ScaffoldContentCongruenceVerdict
> = {
  promptPath: "scaffold-content-congruence.prompt",
  stageTag: STAGE_TAGS.scaffoldContentCongruence,
  schema: scaffoldContentCongruenceSchema,
  validator: scaffoldContentCongruenceValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    term: "sentinel term",
    parentLabel: "Sentinel parent",
    stepLabel: "Sentinel step",
    microLesson: "A sentinel micro-lesson.",
    question: "A sentinel question?",
    explanation: "A sentinel explanation.",
    options: ["Option one", "Option two", "Option three", "Option four"]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    term: input.term,
    parentLabel: input.parentLabel,
    stepLabel: input.stepLabel,
    microLesson: input.microLesson,
    question: input.question,
    explanation: input.explanation,
    options: input.options.map((option) => `- ${option}`).join("\n")
  }),
  mapResult: (result) => result
};

export function createScaffoldContentCongruencePort(client: LiteLlmForcedToolClient): ScaffoldContentCongruencePort {
  return {
    model: readPromptFile(scaffoldContentCongruenceDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, scaffoldContentCongruenceDescriptor, input)
  };
}
