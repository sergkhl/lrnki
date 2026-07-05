import type { ConceptLesson, ImpostorItemDraft, ImpostorLieValidityJudgment, MatchingItemDraft, OptionSelectItemDraft, StudyItemBlueprint, StudyItemOptionDraft, StudyItemType } from "@lrnki/domain-core";
import type { ImpostorLieValidityJudgmentPort, StudyItemBlueprintPort, StudyItemGenerationPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import {
  impostorLieValidityJudgmentSchema,
  impostorLieValidityJudgmentValidator,
  impostorSchema,
  impostorValidator,
  matchingSchema,
  matchingValidator,
  optionSelectSchema,
  optionSelectValidator,
  studyItemBlueprintSchema,
  studyItemBlueprintValidator
} from "./toolSchemas";

// Study item generation stays DeepSeek-family (AGENTS rule 5): the option-select correct
// answer is generated here and deterministic auto-grading handles the learner answer.
// The prompt uses domain-neutral rubric language (rule 17) and validates tool arguments
// fail-closed (rule 6); semantic acceptance is the guard's job (U2/U5).
export const STUDY_ITEM_GENERATION_MODEL = EVIDENCE_PROFILE_MODEL;
export const IMPOSTOR_LIE_VALIDITY_JUDGE_MODEL = "kg-independent-judge";

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

function renderPassages(passages: GroundingPassage[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

function renderSiblings(siblings: { label: string; snippet: string }[]): string {
  return siblings.length
    ? siblings.map((sibling) => `- ${sibling.label}${sibling.snippet ? `: "${sibling.snippet}"` : ""}`).join("\n")
    : "(no same-domain neighbors provided)";
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
    facet?: string;
    retryFeedback?: string;
  }): Promise<OptionSelectItemDraft> {
    const system = [
      "You write ONE four-option multiple-choice study item for a single learning node, conditioned ONLY on the provided grounding passages.",
      "Produce exactly one CORRECT answer, grounded strictly in the provided passages, plus exactly THREE distractors.",
      "Also write a short explanation of why the correct answer is right, grounded in the provided passages.",
      "Cite the passage your correct answer derives from by its exact passageId, quoting a substring of the passage text. For source-grounded passages, the quote must be verbatim; for generated grounding, quote only the generated grounding passage text.",
      "The correctAnswer field must be an object with text and citation. The citation evidenceQuote must be copied exactly from one listed grounding passage; do not paraphrase the citation quote.",
      "Write three plausible but INCORRECT distractors in the same domain register as the provided neighbor concepts, so wrong answers read like real domain answers. Each distractor must be clearly wrong for this question and never a paraphrase of the correct answer.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in the question."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const siblingText = renderSiblings(input.siblings);
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite the correct answer by passageId):",
      renderPassages(input.groundingPassages),
      "",
      "Same-domain neighbor concepts (flavor distractors after these; do NOT make a neighbor the correct answer):",
      siblingText,
      ...(input.facet ? ["", `Assessed facet for this item: ${input.facet}.`] : []),
      ...(input.retryFeedback ? ["", "Retry feedback from the previous rejected draft:", input.retryFeedback] : []),
      "",
      "Call submit_option_select_item with a question, explanation, a correctAnswer (text + citation), and exactly three distractors."
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
    return { itemType: "option_select", question: args.question, explanation: args.explanation, options };
  }

  async generateImpostor(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: GroundingPassage[];
    siblings: { label: string; snippet: string }[];
    facet?: string;
    retryFeedback?: string;
  }): Promise<ImpostorItemDraft> {
    const system = [
      "You write ONE 'spot the lie' study item for a single learning node, conditioned ONLY on the provided grounding passages and neighbor concepts.",
      "Produce exactly THREE true statements about the node, each grounded strictly in the provided passages, plus exactly ONE planted lie object.",
      "Each TRUE statement must cite the passage it restates by its exact passageId, quoting a substring of the passage text. For source-grounded passages, the quote must be verbatim; for generated grounding, quote only the generated grounding passage text. Multiple true statements may cite the same passage with different substrings.",
      "For the impostor: PREFER a true fact about ONE of the provided neighbor concepts, rewritten so that it contradicts or is impossible for this node; set lieSource='sibling' and siblingLabel to that neighbor's exact label. Only when no provided neighbor yields a clean lie, mint a fresh plausible misconception about this node and set lieSource='generated' with siblingLabel null.",
      "The lie object must be clearly false for this node, never a paraphrase of a true statement, and must carry the reveal and lieSource metadata. Do not use a statement that is true in the target node's context merely because it more directly belongs to a neighbor.",
      "Write a reveal that explains why the lie is false; for a sibling lie, state that it is actually true of the named neighbor.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in any statement."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const siblingText = renderSiblings(input.siblings);
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite each true statement by passageId):",
      renderPassages(input.groundingPassages),
      "",
      "Same-domain neighbor concepts (prefer drawing the lie from one of these as a mis-attributed fact):",
      siblingText,
      ...(input.facet ? ["", `Assessed facet for this item: ${input.facet}.`] : []),
      ...(input.retryFeedback ? ["", "Retry feedback from the previous rejected draft:", input.retryFeedback] : []),
      "",
      "Call submit_impostor_item with a question, exactly three truths, and one lie object."
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

    // Carry the model's citation claim onto truths; the guard re-derives provenance
    // from whether the quote verifies. The lie is a single bound object by construction.
    const truths = args.truths.map((truth) => ({
      text: truth.text,
      citation: { passageId: truth.citationPassageId, evidenceQuote: truth.citationEvidenceQuote }
    })) as ImpostorItemDraft["truths"];
    return {
      itemType: "impostor",
      question: args.question,
      truths,
      lie: {
        text: args.lieText,
        reveal: args.reveal,
        lieSource: args.lieSource,
        ...(args.siblingLabel ? { siblingLabel: args.siblingLabel } : {})
      }
    };
  }

  async generateMatching(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: GroundingPassage[];
    siblings: { label: string; snippet: string }[];
    facet?: string;
    retryFeedback?: string;
  }): Promise<MatchingItemDraft> {
    const system = [
      "You write ONE matching-pairs study item for a single learning node, conditioned ONLY on the provided grounding passages.",
      "Produce three or four prompt-match pairs. The prompt side should be a concise concept-side clue or situation; the match side should be the corresponding example, scenario, description, or application from the lesson grounding.",
      "Each pair must cite the passage it derives from by exact passageId and a copied evidenceQuote. For source-grounded passages, the quote must be verbatim.",
      "Do not make a pair answerable by simply matching repeated words between the prompt text and match text. Use meaning, examples, scenarios, or descriptions.",
      "Stay within the Declared Domain. Write learner-facing language; never reference 'the passage' or 'the source'."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite each pair by passageId):",
      renderPassages(input.groundingPassages),
      ...(input.facet ? ["", `Assessed facet for this item: ${input.facet}.`] : []),
      ...(input.retryFeedback ? ["", "Retry feedback from the previous rejected draft:", input.retryFeedback] : []),
      "",
      "Call submit_matching_item with a question and three or four grounded pairs."
    ].join("\n");
    const args = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_matching_item",
      toolDescription: "Submit one matching-pairs study item with three or four grounded pairs.",
      parameters: matchingSchema,
      validator: matchingValidator,
      tags: [STAGE_TAGS.matchingGeneration],
      maxRetries: 4
    });
    return { itemType: "matching", question: args.question, pairs: args.pairs };
  }
}

export class LiteLlmStudyItemBlueprintAdapter implements StudyItemBlueprintPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = STUDY_ITEM_GENERATION_MODEL) {
    this.model = model;
  }

  async plan(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    lesson: ConceptLesson;
    siblings: { label: string; snippet: string }[];
    supportedItemTypes: StudyItemType[];
  }): Promise<StudyItemBlueprint> {
    const system = [
      "You plan which study item types are worth generating for one learning node.",
      "For each supported item type, decide whether the lesson grounding can support a non-duplicative, non-label-cued item.",
      "When generating, assign a short distinct assessed facet. When skipping, give a short reason.",
      "Do not use domain-specific examples beyond the provided lesson and neighbor labels. Do not add deterministic lexical rules; judge askability from meaning."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : ""}.`,
      `Supported item types: ${input.supportedItemTypes.join(", ")}.`,
      "Lesson sections:",
      ...input.lesson.sections.map((section) => `- ${section.kind}: ${section.text}`),
      "Same-domain neighbors:",
      renderSiblings(input.siblings),
      "",
      "Call submit_study_item_blueprint with exactly one plan for each supported item type."
    ].join("\n");
    const args = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_study_item_blueprint",
      toolDescription: "Submit a per-item-type study item blueprint for one learning node.",
      parameters: studyItemBlueprintSchema,
      validator: studyItemBlueprintValidator,
      tags: [STAGE_TAGS.studyItemBlueprint],
      maxRetries: 2
    });
    return {
      derivedNodeId: input.node.derivedNodeId,
      typePlans: args.typePlans.map((plan) => plan.generate
        ? { itemType: plan.itemType, generate: true, facet: plan.facet ?? "" }
        : { itemType: plan.itemType, generate: false, reason: plan.reason ?? "blueprint declined this item type" })
    };
  }
}

export class LiteLlmImpostorLieValidityJudgmentAdapter implements ImpostorLieValidityJudgmentPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = IMPOSTOR_LIE_VALIDITY_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    lie: { text: string; reveal: string };
    groundingPassages: GroundingPassage[];
    siblings: { label: string; snippet: string }[];
  }): Promise<ImpostorLieValidityJudgment> {
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const passages = renderPassages(input.groundingPassages);
    const siblingText = renderSiblings(input.siblings);
    const system = [
      "You judge one planted lie in a learner-facing study item.",
      "Decide whether the planted statement is actually false for the learning node, given the node label, aliases, grounding passages, sibling concepts, and reveal.",
      "Return lie_is_false only when the statement is clearly false for the learning node because it contradicts or is impossible for that node. Return lie_is_true_of_node when it is true, materially true, ambiguous, merely better categorized under a sibling, or not clearly false for the learning node.",
      "Judge meaning, not surface wording. Stay within the Declared Domain."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Planted lie: "${input.lie.text}"`,
      `Reveal: "${input.lie.reveal}"`,
      "Grounding passages:",
      passages,
      "",
      "Sibling concepts:",
      siblingText,
      "",
      "Call submit_impostor_lie_validity_judgment with whether the planted lie is false for this learning node."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_impostor_lie_validity_judgment",
      toolDescription: "Submit whether the planted lie is false for the learning node.",
      parameters: impostorLieValidityJudgmentSchema,
      validator: impostorLieValidityJudgmentValidator,
      tags: [STAGE_TAGS.impostorLieValidityJudgment]
    });

    return { verdict: result.verdict, reason: result.reason };
  }
}
