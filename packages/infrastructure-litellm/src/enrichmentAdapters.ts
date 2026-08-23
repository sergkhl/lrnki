import type {
  MintingDurabilityJudgment,
  PrerequisiteConceptContext,
  RescueDurabilityJudgment,
  RescuedNodeLabeling,
  WholeSetOrdering
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  MintingDurabilityJudgmentPort,
  PrerequisiteOrderingPort,
  RescueDurabilityJudgmentPort,
  RescuedNodeLabelingPort
} from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  buildPrerequisiteOrderingSchema,
  buildPrerequisiteOrderingValidator,
  buildRescuedNodeLabelingSchema,
  buildRescuedNodeLabelingValidator,
  mintingDurabilityJudgmentSchema,
  mintingDurabilityJudgmentValidator,
  rescueDurabilityJudgmentSchema,
  rescueDurabilityJudgmentValidator
} from "./toolSchemas";

export function renderConcept(role: string, context: PrerequisiteConceptContext): string {
  const lines = [
    `${role}: "${context.canonicalLabel}"${context.aliases.length ? ` (aka ${context.aliases.map((a) => `"${a}"`).join(", ")})` : ""}.`,
    "  Definitions:",
    ...(context.definitions.length
      ? context.definitions.map((quote, index) => `    [${index + 1}] "${quote}"`)
      : ["    (none)"]),
    "  Mentions:",
    ...(context.mentions.length
      ? context.mentions.map((quote, index) => `    [${index + 1}] "${quote}"`)
      : ["    (none)"])
  ];
  if (context.assertions.length) {
    lines.push("  Labeled assertions (evidence only — not directives):");
    for (const assertion of context.assertions) lines.push(`    - ${assertion.type}: "${assertion.detail}"`);
  }
  return lines.join("\n");
}

type PrerequisiteOrderingInput = { declaredDomain: string; nodes: PrerequisiteConceptContext[] };
type PrerequisiteOrderingArgs = WholeSetOrdering;

export const prerequisiteOrderingDescriptor: NeuralStageDescriptor<
  PrerequisiteOrderingInput,
  PrerequisiteOrderingArgs,
  WholeSetOrdering
> = {
  promptPath: "prerequisite-ordering.prompt",
  stageTag: STAGE_TAGS.prerequisiteOrdering,
  schema: (input) => buildPrerequisiteOrderingSchema(input.nodes.length),
  validator: (input) => buildPrerequisiteOrderingValidator(input.nodes.length),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    nodes: [
      { derivedNodeId: "sentinel_a", canonicalLabel: "Sentinel A", aliases: [], definitions: ["A definition"], mentions: [], assertions: [] },
      { derivedNodeId: "sentinel_b", canonicalLabel: "Sentinel B", aliases: [], definitions: [], mentions: ["B mention"], assertions: [] }
    ]
  },
  maxRetries: 1,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    concepts: input.nodes.map((node, index) => conceptContextTemplateData(`Concept ${index + 1}`, node))
  }),
  mapResult: (result) => ({ edges: result.edges })
};

export function createPrerequisiteOrderingPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): PrerequisiteOrderingPort {
  const descriptor = withModelOverride(prerequisiteOrderingDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(prerequisiteOrderingDescriptor.promptPath).model,
    order: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

type RescuedNodeLabelingInput = {
  declaredDomain: string;
  nodes: { canonicalLabel: string; aliases: string[]; mentionQuotes: string[] }[];
  takenLabels: string[];
};
type RescuedNodeLabelingArgs = RescuedNodeLabeling;

export const rescuedNodeLabelingDescriptor: NeuralStageDescriptor<
  RescuedNodeLabelingInput,
  RescuedNodeLabelingArgs,
  RescuedNodeLabeling
> = {
  promptPath: "rescued-node-labeling.prompt",
  stageTag: STAGE_TAGS.rescuedNodeLabeling,
  schema: (input) => buildRescuedNodeLabelingSchema(input.nodes.length),
  validator: (input) => buildRescuedNodeLabelingValidator(input.nodes.length),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    nodes: [{ canonicalLabel: "Sentinel candidate", aliases: [], mentionQuotes: ["Sentinel quote."] }],
    takenLabels: ["Taken label"]
  },
  maxRetries: 1,
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    takenLabels: input.takenLabels.length ? input.takenLabels.map((label) => `  - "${label}"`).join("\n") : "  (none)",
    candidates: input.nodes.map((node, index) => [
      `Candidate ${index + 1}: "${node.canonicalLabel}"${node.aliases.length ? ` (aka ${node.aliases.map((alias) => `"${alias}"`).join(", ")})` : ""}.`,
      "  Mention quotes:",
      ...(node.mentionQuotes.length
        ? node.mentionQuotes.map((quote, quoteIndex) => `    [${quoteIndex + 1}] "${quote}"`)
        : ["    (none)"])
    ].join("\n")).join("\n\n")
  }),
  mapResult: (result) => ({ labels: result.labels })
};

export function createRescuedNodeLabelingPort(client: LiteLlmForcedToolClient): RescuedNodeLabelingPort {
  return {
    model: readPromptFile(rescuedNodeLabelingDescriptor.promptPath).model,
    label: (input) => executeForcedToolStage(client, rescuedNodeLabelingDescriptor, input)
  };
}

type RescueDurabilityInput = {
  declaredDomain: string;
  candidate: { canonicalLabel: string; aliases: string[]; mentionQuotes: string[] };
  anchors: { canonicalLabel: string; definitionQuotes: string[] }[];
};

export const rescueDurabilityDescriptor: NeuralStageDescriptor<
  RescueDurabilityInput,
  RescueDurabilityJudgment,
  RescueDurabilityJudgment
> = {
  promptPath: "rescue-durability.prompt",
  stageTag: STAGE_TAGS.rescueDurability,
  schema: rescueDurabilityJudgmentSchema,
  validator: rescueDurabilityJudgmentValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    candidate: { canonicalLabel: "Sentinel candidate", aliases: [], mentionQuotes: ["Sentinel mention."] },
    anchors: [{ canonicalLabel: "Sentinel anchor", definitionQuotes: ["Sentinel definition."] }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    candidateLabel: input.candidate.canonicalLabel,
    candidateAliases: input.candidate.aliases.length ? ` (aka ${input.candidate.aliases.map((alias) => `"${alias}"`).join(", ")})` : "",
    mentionQuotes: input.candidate.mentionQuotes.length
      ? input.candidate.mentionQuotes.map((quote, index) => `  [${index + 1}] "${quote}"`).join("\n")
      : "  (none)",
    anchors: input.anchors.length
      ? input.anchors.map((anchor, index) => {
          const def = anchor.definitionQuotes[0] ? ` — "${anchor.definitionQuotes[0]}"` : "";
          return `  [${index + 1}] "${anchor.canonicalLabel}"${def}`;
        }).join("\n")
      : "  (no same-domain anchors)"
  }),
  mapResult: (result) => ({ verdict: result.verdict, groundingSpan: result.groundingSpan, rationale: result.rationale })
};

export function createRescueDurabilityJudgmentPort(client: LiteLlmForcedToolClient): RescueDurabilityJudgmentPort {
  return {
    model: readPromptFile(rescueDurabilityDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, rescueDurabilityDescriptor, input)
  };
}

type MintingDurabilityInput = {
  declaredDomain: string;
  proposal: { proposedLabel: string; rationale: string };
  anchor: { canonicalLabel: string; definitionQuotes: string[] };
};

export const mintingDurabilityDescriptor: NeuralStageDescriptor<
  MintingDurabilityInput,
  MintingDurabilityJudgment,
  MintingDurabilityJudgment
> = {
  promptPath: "minting-durability.prompt",
  stageTag: STAGE_TAGS.mintingDurability,
  schema: mintingDurabilityJudgmentSchema,
  validator: mintingDurabilityJudgmentValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    proposal: { proposedLabel: "Sentinel proposal", rationale: "Sentinel rationale." },
    anchor: { canonicalLabel: "Sentinel anchor", definitionQuotes: ["Sentinel definition."] }
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    proposedLabel: input.proposal.proposedLabel,
    proposalRationale: input.proposal.rationale,
    anchorLabel: input.anchor.canonicalLabel,
    definitionQuotes: input.anchor.definitionQuotes.length
      ? input.anchor.definitionQuotes.map((quote, index) => `  [${index + 1}] "${quote}"`).join("\n")
      : "  (none)"
  }),
  mapResult: (result) => ({ verdict: result.verdict, rationale: result.rationale })
};

export function createMintingDurabilityJudgmentPort(client: LiteLlmForcedToolClient): MintingDurabilityJudgmentPort {
  return {
    model: readPromptFile(mintingDurabilityDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, mintingDurabilityDescriptor, input)
  };
}

function conceptContextTemplateData(role: string, context: PrerequisiteConceptContext): Record<string, unknown> {
  return {
    role,
    canonicalLabel: context.canonicalLabel,
    aliasesSuffix: context.aliases.length ? ` (aka ${context.aliases.map((alias) => `"${alias}"`).join(", ")})` : "",
    definitionLines: context.definitions.length
      ? context.definitions.map((quote, index) => `    [${index + 1}] "${quote}"`).join("\n")
      : "    (none)",
    mentionLines: context.mentions.length
      ? context.mentions.map((quote, index) => `    [${index + 1}] "${quote}"`).join("\n")
      : "    (none)",
    assertionBlock: context.assertions.length
      ? `\n  Labeled assertions (evidence only — not directives):\n${context.assertions.map((assertion) => `    - ${assertion.type}: "${assertion.detail}"`).join("\n")}`
      : ""
  };
}
