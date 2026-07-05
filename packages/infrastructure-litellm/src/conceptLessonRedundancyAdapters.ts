import { STAGE_TAGS, type ConceptLessonRedundancyJudgment, type ConceptLessonSectionKind } from "@lrnki/domain-core";
import type { ConceptLessonRedundancyJudgmentPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { IMPOSTOR_LIE_VALIDITY_JUDGE_MODEL } from "./studyItemGenerationAdapters";
import { conceptLessonRedundancyJudgmentSchema, conceptLessonRedundancyJudgmentValidator } from "./toolSchemas";

export const CONCEPT_LESSON_REDUNDANCY_JUDGE_MODEL = IMPOSTOR_LIE_VALIDITY_JUDGE_MODEL;

export class LiteLlmConceptLessonRedundancyJudgmentAdapter implements ConceptLessonRedundancyJudgmentPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = CONCEPT_LESSON_REDUNDANCY_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: Parameters<ConceptLessonRedundancyJudgmentPort["judge"]>[0]): Promise<ConceptLessonRedundancyJudgment[]> {
    const system = [
      "You judge whether learner-facing lesson sections carry distinct instructional information.",
      "Mark a non-substantive section redundant only when it merely rephrases another section and adds no new hook, mental model, example, application, or method.",
      "Never mark definition, examples, or formulas redundant; those substantive sections are preserved by the application.",
      "Judge meaning, not exact wording. Stay within the Declared Domain."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : ""}.`,
      "Lesson sections:",
      ...input.sections.map((section) => [
        `- ${section.kind}: ${section.text}`,
        ...(section.items?.length ? section.items.map((item) => `  * ${item}`) : [])
      ].join("\n")),
      "",
      "Call submit_concept_lesson_redundancy_judgment with one judgment for each section."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_concept_lesson_redundancy_judgment",
      toolDescription: "Submit per-section distinctness judgments for one concept lesson.",
      parameters: conceptLessonRedundancyJudgmentSchema,
      validator: conceptLessonRedundancyJudgmentValidator,
      tags: [STAGE_TAGS.lessonRedundancyJudgment]
    });

    return result.judgments.map((judgment) => ({
      sectionKind: judgment.sectionKind,
      verdict: judgment.verdict,
      ...(isSectionKind(judgment.redundantWith) ? { redundantWith: judgment.redundantWith } : {}),
      reason: judgment.reason
    }));
  }
}

function isSectionKind(value: string | null): value is ConceptLessonSectionKind {
  return value === "gist" || value === "intuition" || value === "definition" || value === "examples" || value === "applications" || value === "formulas";
}
