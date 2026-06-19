import type { CardDraft } from "@lrnki/domain-core";
import type { CardGenerationPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { cardGenerationSchema, cardGenerationValidator } from "./toolSchemas";

// Card generation stays DeepSeek-family (AGENTS rule 5): the answer-key is generated
// here; a DIFFERENT family grades a learner answer against it (U5, ADR-0023), so the
// generator never grades its own homework.
export const CARD_GENERATION_MODEL = EVIDENCE_PROFILE_MODEL;

export class LiteLlmCardGenerationAdapter implements CardGenerationPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = CARD_GENERATION_MODEL) {
    this.model = model;
  }

  async generate(input: {
    declaredDomain: string;
    concept: { conceptId: string; canonicalLabel: string; aliases: string[] };
    cepPassages: { sourceBlockId: string; kind: "definition" | "mention"; evidenceQuote: string }[];
    definesLiteral: string | null;
  }): Promise<CardDraft> {
    const system = [
      "You write ONE anki-style recall card for a single concept, conditioned ONLY on the provided Concept Evidence Profile (CEP) passages.",
      "The card has a question, a concise answer-key a grader can check a free-form learner answer against, and a short first-person self-report confidence prompt.",
      "Ground the answer-key strictly in the provided passages: introduce no facts that are not supported by them.",
      "Cite the passages your answer-key derives from by their exact blockId, quoting a verbatim substring of the passage text. Every citation quote MUST be copied exactly from a provided passage.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in the question."
    ].join(" ");
    const aliasText = input.concept.aliases.length ? ` (aliases: ${input.concept.aliases.join(", ")})` : "";
    const passageText = input.cepPassages
      .map((passage) => `- [${passage.sourceBlockId}] (${passage.kind}) "${passage.evidenceQuote}"`)
      .join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Concept: "${input.concept.canonicalLabel}"${aliasText}.`,
      input.definesLiteral ? `Definition literal (hint): "${input.definesLiteral}".` : "",
      "CEP passages (cite by blockId):",
      passageText || "(none)",
      "",
      "Call submit_recall_card with a question, answerKey, selfReportPrompt, and at least one citation quoting a provided passage verbatim."
    ].filter(Boolean).join("\n");

    return this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_recall_card",
      toolDescription: "Submit one anki-style recall card grounded in the provided CEP passages.",
      parameters: cardGenerationSchema,
      validator: cardGenerationValidator
    });
  }
}
