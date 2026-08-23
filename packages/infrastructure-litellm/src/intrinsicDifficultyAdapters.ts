import type { DifficultyBandEntry, DifficultyNodeContext } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { renderConcept } from "./enrichmentAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile, renderPromptFile } from "./promptFile";
import { buildDifficultyBandsSchema, buildDifficultyBandsValidator, difficultyComparisonSchema, difficultyComparisonValidator } from "./toolSchemas";

type DifficultyBandingInput = { declaredDomain: string; nodes: DifficultyNodeContext[] };
type DifficultyBandingArgs = { bands: DifficultyBandEntry[] };

export const intrinsicDifficultyBandingDescriptor: NeuralStageDescriptor<
  DifficultyBandingInput,
  DifficultyBandingArgs,
  DifficultyBandEntry[]
> = {
  promptPath: "intrinsic-difficulty-bands.prompt",
  stageTag: STAGE_TAGS.intrinsicDifficulty,
  schema: (input) => buildDifficultyBandsSchema(input.nodes.length),
  validator: (input) => buildDifficultyBandsValidator(input.nodes.length),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    nodes: [
      { derivedNodeId: "sentinel_a", canonicalLabel: "Sentinel A", aliases: [], declaredDomain: "sentinel domain", groundingOrigin: "document_anchored", definitions: ["A definition"], mentions: [] },
      { derivedNodeId: "sentinel_b", canonicalLabel: "Sentinel B", aliases: [], declaredDomain: "sentinel domain", groundingOrigin: "document_anchored", definitions: [], mentions: ["B mention"] }
    ]
  },
  maxRetries: 2,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    concepts: input.nodes.map((node, index) => renderNode(`Concept ${index + 1}`, node)).join("\n\n")
  }),
  mapResult: (result) => result.bands
};

type DifficultyComparisonInput = { declaredDomain: string; first: DifficultyNodeContext; second: DifficultyNodeContext };
type DifficultyComparisonArgs = { harder: "first" | "second"; rationale: string };

export const intrinsicDifficultyComparisonDescriptor: NeuralStageDescriptor<
  DifficultyComparisonInput,
  DifficultyComparisonArgs,
  { harder: "first" | "second" }
> = {
  promptPath: "intrinsic-difficulty-comparison.prompt",
  stageTag: STAGE_TAGS.intrinsicDifficulty,
  schema: difficultyComparisonSchema,
  validator: difficultyComparisonValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    first: { derivedNodeId: "sentinel_a", canonicalLabel: "Sentinel A", aliases: [], declaredDomain: "sentinel domain", groundingOrigin: "document_anchored", definitions: ["A definition"], mentions: [] },
    second: { derivedNodeId: "sentinel_b", canonicalLabel: "Sentinel B", aliases: [], declaredDomain: "sentinel domain", groundingOrigin: "document_anchored", definitions: [], mentions: ["B mention"] }
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    firstConcept: renderNode("First concept", input.first),
    secondConcept: renderNode("Second concept", input.second)
  }),
  mapResult: (result) => ({ harder: result.harder })
};

export function createIntrinsicDifficultyJudgmentPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): IntrinsicDifficultyJudgmentPort {
  const bandingDescriptor = withModelOverride(intrinsicDifficultyBandingDescriptor, modelOverride);
  const comparisonDescriptor = withModelOverride(intrinsicDifficultyComparisonDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(intrinsicDifficultyBandingDescriptor.promptPath).model,
    bandDomainSet: (input) => executeForcedToolStage(client, bandingDescriptor, input),
    compareHarder: (input) => executeForcedToolStage(client, comparisonDescriptor, input)
  };
}

export function intrinsicDifficultyModelFacingText(): string {
  return [
    renderPromptFile(intrinsicDifficultyBandingDescriptor.promptPath, intrinsicDifficultyBandingDescriptor.templateData(intrinsicDifficultyBandingDescriptor.sentinelInput)).messages[0]?.content ?? "",
    renderPromptFile(intrinsicDifficultyComparisonDescriptor.promptPath, intrinsicDifficultyComparisonDescriptor.templateData(intrinsicDifficultyComparisonDescriptor.sentinelInput)).messages[0]?.content ?? ""
  ].join("\n");
}

function renderNode(role: string, node: DifficultyNodeContext): string {
  return renderConcept(role, { ...node, assertions: [] });
}
