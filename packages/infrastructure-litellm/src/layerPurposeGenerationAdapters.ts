import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LayerPurposeGenerationPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { layerPurposeSchema, layerPurposeValidator } from "./toolSchemas";

type LayerPurposeGenerationInput = {
  declaredDomain: string;
  conceptLabels: string[];
};

type LayerPurposeArgs = z.infer<typeof layerPurposeValidator>;

// The rim caps the purpose at ~240 chars (2 short sentences); the prompt asks for the
// budget, the cap enforces it deterministically so no over-long statement reaches a row.
const PURPOSE_MAX_CHARS = 240;

export const layerPurposeGenerationDescriptor: NeuralStageDescriptor<
  LayerPurposeGenerationInput,
  LayerPurposeArgs,
  string
> = {
  promptPath: "layer-purpose.prompt",
  stageTag: STAGE_TAGS.layerPurposeGeneration,
  schema: layerPurposeSchema,
  validator: layerPurposeValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    conceptLabels: ["Sentinel concept A", "Sentinel concept B"]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    conceptLabels: input.conceptLabels.map((label) => `- ${label}`).join("\n") || "(none)"
  }),
  mapResult: (args) => {
    const purpose = args.purpose.trim();
    return purpose.length > PURPOSE_MAX_CHARS ? `${purpose.slice(0, PURPOSE_MAX_CHARS - 1).trimEnd()}…` : purpose;
  }
};

export function createLayerPurposeGenerationPort(client: LiteLlmForcedToolClient): LayerPurposeGenerationPort {
  return {
    model: readPromptFile(layerPurposeGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, layerPurposeGenerationDescriptor, input)
  };
}
