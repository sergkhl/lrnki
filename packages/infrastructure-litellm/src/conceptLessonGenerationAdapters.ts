import type { ConceptLessonDraft, ConceptLessonSectionDraft } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { ConceptLessonGenerationPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { conceptLessonSchema, conceptLessonValidator } from "./toolSchemas";

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

type NeighborGroup = { label: string; snippet: string }[];

type ConceptLessonGenerationInput = {
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  groundingProvenance: "source_cep" | "source_mentioned" | "generated";
  groundingPassages: GroundingPassage[];
  neighbors: { parents: NeighborGroup; children: NeighborGroup; siblings: NeighborGroup };
  retryFeedback?: string;
};

type ConceptLessonArgs = z.infer<typeof conceptLessonValidator>;

export const conceptLessonGenerationDescriptor: NeuralStageDescriptor<
  ConceptLessonGenerationInput,
  ConceptLessonArgs,
  ConceptLessonDraft
> = {
  promptPath: "concept-lesson-generation.prompt",
  stageTag: STAGE_TAGS.conceptLessonGeneration,
  schema: conceptLessonSchema,
  validator: conceptLessonValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "sentinel_passage", kind: "definition", text: "A sentinel passage.", derivedNodeId: "sentinel_node" }],
    neighbors: {
      parents: [{ label: "Sentinel parent", snippet: "A prerequisite." }],
      children: [{ label: "Sentinel child", snippet: "A dependent." }],
      siblings: [{ label: "Sentinel sibling", snippet: "A nearby concept." }]
    },
    retryFeedback: "sentinel retry feedback"
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "",
    groundingProvenance: input.groundingProvenance,
    passages: renderPassages(input.groundingPassages),
    parents: renderNeighbors(input.neighbors.parents),
    children: renderNeighbors(input.neighbors.children),
    siblings: renderNeighbors(input.neighbors.siblings),
    retryFeedbackBlock: input.retryFeedback ? `\n\nRetry feedback from the previous rejected draft:\n${input.retryFeedback}` : ""
  }),
  mapResult: (args) => {
    const sections: ConceptLessonSectionDraft[] = args.sections.map((section) => {
      const draft: ConceptLessonSectionDraft = { kind: section.kind, text: section.text };
      if (section.items?.length) draft.items = section.items;
      if (section.citationPassageId && section.citationEvidenceQuote) {
        draft.citation = { passageId: section.citationPassageId, evidenceQuote: section.citationEvidenceQuote };
      }
      if (section.diagramCaption && section.diagramSpec) {
        draft.diagram = { caption: section.diagramCaption, spec: section.diagramSpec };
      }
      return draft;
    });
    return { sections };
  }
};

export function createConceptLessonGenerationPort(client: LiteLlmForcedToolClient): ConceptLessonGenerationPort {
  return {
    model: readPromptFile(conceptLessonGenerationDescriptor.promptPath).model,
    generate: (input) => executeForcedToolStage(client, conceptLessonGenerationDescriptor, input)
  };
}

function renderPassages(passages: GroundingPassage[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

function renderNeighbors(neighbors: NeighborGroup): string {
  return neighbors.length
    ? neighbors.map((neighbor) => `- ${neighbor.label}${neighbor.snippet ? `: "${neighbor.snippet}"` : ""}`).join("\n")
    : "(none provided)";
}
