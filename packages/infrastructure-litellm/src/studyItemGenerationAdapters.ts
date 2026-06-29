import type { OptionSelectItemDraft, StudyItemOptionDraft } from "@lrnki/domain-core";
import type { StudyItemGenerationPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { optionSelectSchema, optionSelectValidator } from "./toolSchemas";

// Study item generation stays DeepSeek-family (AGENTS rule 5): the option-select correct
// answer is generated here and deterministic auto-grading handles the learner answer.
// The prompt uses domain-neutral rubric language (rule 17) and validates tool arguments
// fail-closed (rule 6); semantic acceptance is the guard's job (U2/U5).
export const STUDY_ITEM_GENERATION_MODEL = EVIDENCE_PROFILE_MODEL;

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

function renderPassages(passages: GroundingPassage[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

export class LiteLlmStudyItemGenerationAdapter implements StudyItemGenerationPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = STUDY_ITEM_GENERATION_MODEL) {
    this.model = model;
  }

  async generateOptionSelect(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: GroundingPassage[];
    siblings: { label: string; snippet: string }[];
  }): Promise<OptionSelectItemDraft> {
    const system = [
      "You write ONE four-option multiple-choice study item for a single learning node, conditioned ONLY on the provided grounding passages.",
      "Produce exactly one CORRECT answer, grounded strictly in the provided passages, plus exactly THREE distractors.",
      "Cite the passage your correct answer derives from by its exact passageId, quoting a substring of the passage text. For source-grounded passages, the quote must be verbatim; for generated grounding, quote only the generated grounding passage text.",
      "Write three plausible but INCORRECT distractors in the same domain register as the provided neighbor concepts, so wrong answers read like real domain answers. Each distractor must be clearly wrong for this question and never a paraphrase of the correct answer.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in the question."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const siblingText = input.siblings.length
      ? input.siblings.map((sibling) => `- ${sibling.label}${sibling.snippet ? `: "${sibling.snippet}"` : ""}`).join("\n")
      : "(no same-domain neighbors provided)";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite the correct answer by passageId):",
      renderPassages(input.groundingPassages),
      "",
      "Same-domain neighbor concepts (flavor distractors after these; do NOT make a neighbor the correct answer):",
      siblingText,
      "",
      "Call submit_option_select_item with a question, a correctAnswer (text + citation), and exactly three distractors."
    ].join("\n");

    const args = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_option_select_item",
      toolDescription: "Submit one four-option study item: a grounded correct answer plus three sibling-flavored distractors.",
      parameters: optionSelectSchema,
      validator: optionSelectValidator,
      tags: [STAGE_TAGS.studyItemGeneration]
    });

    // The correct option's provenance reflects the grounding contract; distractors are
    // always generated. The guard (U2) re-derives the correct provenance from the matched
    // passage authoritatively, so this is the draft's best-effort label only.
    const correctProvenance: StudyItemOptionDraft["provenance"] = input.groundingProvenance === "generated" ? "generated" : "source";
    const options: StudyItemOptionDraft[] = [
      { text: args.correctAnswer.text, isCorrect: true, provenance: correctProvenance, citation: args.correctAnswer.citation },
      ...args.distractors.map((text) => ({ text, isCorrect: false, provenance: "generated" as const }))
    ];
    return { itemType: "option_select", question: args.question, options };
  }
}
