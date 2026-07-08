import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { GroundingGenerationPort } from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { generatedGroundingBundleSchema, generatedGroundingBundleValidator } from "./toolSchemas";

type GroundingGenerationInput = {
  derivedNodeId: string;
  declaredDomain: string;
  nodeLabel: string;
  scaffoldedAnchors: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] }[];
  topic?: string;
};

type GroundingGenerationArgs = { definitions: { text: string }[]; mentions: { text: string }[]; rationale: string };

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
    derivedNodeId: "sentinel_node",
    declaredDomain: "sentinel domain",
    nodeLabel: "Sentinel node",
    scaffoldedAnchors: [{ conceptId: "sentinel_anchor", canonicalLabel: "Sentinel anchor", definitionQuotes: ["Sentinel definition."] }]
  },
  templateData: (input) => {
    const anchorLess = input.scaffoldedAnchors.length === 0;
    const anchorText = input.scaffoldedAnchors
      .map((anchor) => [
        `- ${anchor.canonicalLabel} (${anchor.conceptId})`,
        ...anchor.definitionQuotes.map((quote) => `  definition quote: "${quote}"`)
      ].join("\n"))
      .join("\n");
    return {
      declaredDomain: input.declaredDomain,
      contextLines: anchorLess
        ? `${input.topic ? `Originating topic: "${input.topic}".\n` : ""}`
        : `Generated prerequisite node: "${input.nodeLabel}".\nScaffolded anchors:\n${anchorText || "(none)"}`,
      nodeLine: anchorLess ? `Concept node: "${input.nodeLabel}".` : ""
    };
  },
  mapResult: (result, input) => {
    const notApplicable = {
      disposition: "not_applicable_by_grounding" as const,
      rationale: "llm_grounded generated passage has no cited source block"
    };
    const model = readPromptFile(groundingGenerationDescriptor.promptPath).model;
    return {
      derivedNodeId: input.derivedNodeId,
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
      scaffoldedAnchorConceptIds: input.scaffoldedAnchors.map((anchor) => anchor.conceptId),
      generatingModel: model,
      rationale: result.rationale
    };
  }
};

export function createGroundingGenerationPort(client: LiteLlmForcedToolClient): GroundingGenerationPort {
  return {
    model: readPromptFile(groundingGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, groundingGenerationDescriptor, input)
  };
}
