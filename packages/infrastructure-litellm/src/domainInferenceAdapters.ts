import { STAGE_TAGS } from "@lrnki/domain-core";
import type { DeclaredDomainInferencePort } from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { declaredDomainInferenceSchema, declaredDomainInferenceValidator } from "./toolSchemas";

type DeclaredDomainInferenceInput = { topic: string };
type DeclaredDomainInferenceArgs = { declaredDomain: string };

export const declaredDomainInferenceDescriptor: NeuralStageDescriptor<
  DeclaredDomainInferenceInput,
  DeclaredDomainInferenceArgs,
  { declaredDomain: string }
> = {
  promptPath: "declared-domain-inference.prompt",
  stageTag: STAGE_TAGS.declaredDomainInference,
  schema: declaredDomainInferenceSchema,
  validator: declaredDomainInferenceValidator,
  sentinelInput: { topic: "sentinel topic" },
  templateData: (input) => ({ topic: input.topic.trim() }),
  mapResult: (result) => ({ declaredDomain: result.declaredDomain })
};

export function createDeclaredDomainInferencePort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): DeclaredDomainInferencePort {
  const descriptor = withModelOverride(declaredDomainInferenceDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(declaredDomainInferenceDescriptor.promptPath).model,
    infer: (input) => executeForcedToolStage(client, descriptor, input)
  };
}
