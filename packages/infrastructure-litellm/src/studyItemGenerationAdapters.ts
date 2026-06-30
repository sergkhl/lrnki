import type { ImpostorItemDraft, ImpostorStatementDraft, OptionSelectItemDraft, StudyItemOptionDraft } from "@lrnki/domain-core";
import type { StudyItemGenerationPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { impostorSchema, impostorValidator, optionSelectSchema, optionSelectValidator } from "./toolSchemas";

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
      "The correctAnswer field must be an object with text and citation. The citation evidenceQuote must be copied exactly from one listed grounding passage; do not paraphrase the citation quote.",
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
      tags: [STAGE_TAGS.studyItemGeneration],
      maxRetries: 4
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

  async generateImpostor(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: GroundingPassage[];
    siblings: { label: string; snippet: string }[];
  }): Promise<ImpostorItemDraft> {
    const system = [
      "You write ONE 'spot the lie' study item for a single learning node, conditioned ONLY on the provided grounding passages and neighbor concepts.",
      "Produce exactly four statements about the node: THREE true statements, each grounded strictly in the provided passages, and exactly ONE planted lie (the impostor).",
      "Each TRUE statement must cite the passage it restates by its exact passageId, quoting a substring of the passage text. For source-grounded passages, the quote must be verbatim; for generated grounding, quote only the generated grounding passage text. Multiple true statements may cite the same passage with different substrings.",
      "For the impostor: PREFER a true fact about ONE of the provided neighbor concepts, rewritten as if it were about this node, so it reads as plausibly-but-falsely true here; set lieSource='sibling' and siblingLabel to that neighbor's exact label. Only when no provided neighbor yields a clean lie, mint a fresh plausible misconception about this node and set lieSource='generated' with siblingLabel null.",
      "The impostor must carry NO citation (both citation fields null) and must be clearly false for this node, never a paraphrase of a true statement.",
      "Write a reveal that names which statement is the lie and why it is false; for a sibling lie, state that it is actually true of the named neighbor.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in any statement."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const siblingText = input.siblings.length
      ? input.siblings.map((sibling) => `- ${sibling.label}${sibling.snippet ? `: "${sibling.snippet}"` : ""}`).join("\n")
      : "(no same-domain neighbors provided)";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite each true statement by passageId):",
      renderPassages(input.groundingPassages),
      "",
      "Same-domain neighbor concepts (prefer drawing the lie from one of these as a mis-attributed fact):",
      siblingText,
      "",
      "Call submit_impostor_item with a question, exactly four statements (three true + one impostor), a reveal, lieSource, and siblingLabel."
    ].join("\n");

    const args = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_impostor_item",
      toolDescription: "Submit one 'spot the lie' study item: three grounded true statements and one planted lie, with a reveal.",
      parameters: impostorSchema,
      validator: impostorValidator,
      tags: [STAGE_TAGS.impostorGeneration],
      maxRetries: 4
    });

    // Carry the model's citation claim onto truths; the guard (U4) re-derives provenance
    // from whether the quote verifies. The impostor carries no citation by construction.
    const statements: ImpostorStatementDraft[] = args.statements.map((statement) => ({
      text: statement.text,
      isImpostor: statement.isImpostor,
      ...(statement.citationPassageId && statement.citationEvidenceQuote
        ? { citation: { passageId: statement.citationPassageId, evidenceQuote: statement.citationEvidenceQuote } }
        : {})
    }));
    return {
      itemType: "impostor",
      question: args.question,
      statements,
      reveal: args.reveal,
      lieSource: args.lieSource,
      ...(args.siblingLabel ? { siblingLabel: args.siblingLabel } : {})
    };
  }
}
