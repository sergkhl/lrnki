import { STAGE_TAGS, type ConceptLessonRedundancyJudgment, type ConceptLessonSectionKind } from "@lrnki/domain-core";
import type { ConceptLessonRedundancyJudgmentPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { conceptLessonRedundancyJudgmentSchema, conceptLessonRedundancyJudgmentValidator } from "./toolSchemas";

type ConceptLessonRedundancyInput = Parameters<ConceptLessonRedundancyJudgmentPort["judge"]>[0];
type ConceptLessonRedundancyArgs = z.infer<typeof conceptLessonRedundancyJudgmentValidator>;

export const conceptLessonRedundancyJudgmentDescriptor: NeuralStageDescriptor<
  ConceptLessonRedundancyInput,
  ConceptLessonRedundancyArgs,
  ConceptLessonRedundancyJudgment[]
> = {
  promptPath: "concept-lesson-redundancy-judgment.prompt",
  stageTag: STAGE_TAGS.lessonRedundancyJudgment,
  schema: conceptLessonRedundancyJudgmentSchema,
  validator: conceptLessonRedundancyJudgmentValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    node: { derivedNodeId: "sentinel_node", canonicalLabel: "Sentinel node", aliases: ["Sentinel alias"] },
    sections: [
      { kind: "gist", text: "A sentinel gist." },
      { kind: "definition", text: "A sentinel definition.", items: ["A sentinel item."] }
    ]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    nodeLabel: input.node.canonicalLabel,
    aliasText: input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "",
    sections: input.sections.map((section) => [
      `- ${section.kind}: ${section.text}`,
      ...(section.items?.length ? section.items.map((item) => `  * ${item}`) : [])
    ].join("\n")).join("\n")
  }),
  mapResult: (result) => result.judgments.map((judgment) => ({
    sectionKind: judgment.sectionKind,
    verdict: judgment.verdict,
    ...(isSectionKind(judgment.redundantWith) ? { redundantWith: judgment.redundantWith } : {}),
    reason: judgment.reason
  }))
};

export function createConceptLessonRedundancyJudgmentPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): ConceptLessonRedundancyJudgmentPort {
  const descriptor = withModelOverride(conceptLessonRedundancyJudgmentDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(conceptLessonRedundancyJudgmentDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

function isSectionKind(value: string | null): value is ConceptLessonSectionKind {
  return value === "gist" || value === "intuition" || value === "definition" || value === "examples" || value === "applications" || value === "formulas";
}
