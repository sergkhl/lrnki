import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { GroundingFactualityRevisionPort, GroundingGenerationPort } from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  generatedGroundingBundleSchema,
  generatedGroundingBundleValidator,
  buildGroundingFactualityRevisionSchema,
  buildGroundingFactualityRevisionValidator
} from "./toolSchemas";

type GroundingGenerationInput = {
  derivedNodeId: string;
  declaredDomain: string;
  nodeLabel: string;
  scaffoldedAnchors: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] }[];
  topic?: string;
};

type GroundingGenerationArgs = { definitions: { text: string }[]; mentions: { text: string }[]; rationale: string };
type GroundingFactualityRevisionInput = {
  declaredDomain: string;
  topic: string;
  nodeLabel: string;
  draft: GeneratedGroundingBundle;
  independentProbeAnswers: string[];
};
type GroundingFactualityRevisionArgs = {
  judgments: Array<{ index: number; factual: boolean; problematicSpan: string; rationale: string }>;
};

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
    return generatedBundleFromResult(
      result,
      input.derivedNodeId,
      input.scaffoldedAnchors.map((anchor) => anchor.conceptId),
      readPromptFile(groundingGenerationDescriptor.promptPath).model
    );
  }
};

export function createGroundingGenerationPort(client: LiteLlmForcedToolClient): GroundingGenerationPort {
  return {
    model: readPromptFile(groundingGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, groundingGenerationDescriptor, input)
  };
}

export const groundingFactualityRevisionDescriptor: NeuralStageDescriptor<
  GroundingFactualityRevisionInput,
  GroundingFactualityRevisionArgs,
  GeneratedGroundingBundle
> = {
  promptPath: "grounding-factuality-revision.prompt",
  stageTag: STAGE_TAGS.groundingFactualityRevision,
  schema: (input) => buildGroundingFactualityRevisionSchema(passageTexts(input.draft).length),
  validator: (input) => buildGroundingFactualityRevisionValidator(passageTexts(input.draft).length),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    topic: "Sentinel topic",
    nodeLabel: "Sentinel node",
    draft: {
      derivedNodeId: "sentinel_node",
      groundingOrigin: "llm_grounded",
      definitions: [{
        passageType: "definition",
        text: "A sentinel node is a placeholder.",
        groundingOrigin: "llm_grounded",
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" }
      }],
      mentions: [],
      scaffoldedAnchorConceptIds: [],
      generatingModel: "sentinel-generator",
      rationale: "sentinel draft"
    },
    independentProbeAnswers: ["A sentinel node is a placeholder used for validation."]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    topic: input.topic,
    nodeLabel: input.nodeLabel,
    independentChecks: input.independentProbeAnswers
      .map((answer, index) => `[${index + 1}] ${answer}`)
      .join("\n"),
    draftPassages: passageTexts(input.draft)
      .map((passage, index) => `[${index}] ${passage.passageType}: ${passage.text}`)
      .join("\n")
  }),
  mapResult: (result, input) => applyGroundedFactualityVetoes(input.draft, result)
};

export function createGroundingFactualityRevisionPort(
  client: LiteLlmForcedToolClient
): GroundingFactualityRevisionPort {
  return {
    model: readPromptFile(groundingFactualityRevisionDescriptor.promptPath).model,
    revise: (input) => executeForcedToolStage(client, groundingFactualityRevisionDescriptor, input)
  };
}

function passageTexts(bundle: GeneratedGroundingBundle) {
  return [...bundle.definitions, ...bundle.mentions];
}

// Monotonic correction boundary: the independent judge can remove a complete passage
// only when its false verdict copies an exact span from that passage. It cannot rewrite
// or add learner-facing facts. An ungrounded/missing veto keeps the original passage.
function applyGroundedFactualityVetoes(
  draft: GeneratedGroundingBundle,
  result: GroundingFactualityRevisionArgs
): GeneratedGroundingBundle {
  const passages = passageTexts(draft);
  const judgments = new Map(result.judgments.map((judgment) => [judgment.index, judgment] as const));
  const dropped = new Set<number>();
  const reasons: string[] = [];
  passages.forEach((passage, index) => {
    const judgment = judgments.get(index);
    if (!judgment || judgment.factual) return;
    const span = judgment.problematicSpan.trim();
    if (!span || !passage.text.includes(span)) return;
    dropped.add(index);
    reasons.push(`[${index}] ${judgment.rationale}`);
  });
  const definitions = draft.definitions.filter((_, index) => !dropped.has(index));
  if (definitions.length === 0) {
    throw new Error(`Grounding factuality revision rejected every definition for ${draft.derivedNodeId}.`);
  }
  const mentionOffset = draft.definitions.length;
  const mentions = draft.mentions.filter((_, index) => !dropped.has(mentionOffset + index));
  return {
    ...draft,
    definitions,
    mentions,
    rationale: dropped.size === 0
      ? `${draft.rationale} [independent factuality review preserved every passage]`
      : `${draft.rationale} [independent factuality review dropped ${dropped.size} passage(s): ${reasons.join(" ")}]`
  };
}

function generatedBundleFromResult(
  result: GroundingGenerationArgs,
  derivedNodeId: string,
  scaffoldedAnchorConceptIds: string[],
  generatingModel: string
): GeneratedGroundingBundle {
  const notApplicable = {
    disposition: "not_applicable_by_grounding" as const,
    rationale: "llm_grounded generated passage has no cited source block"
  };
  return {
    derivedNodeId,
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
    scaffoldedAnchorConceptIds,
    generatingModel,
    rationale: result.rationale
  };
}
