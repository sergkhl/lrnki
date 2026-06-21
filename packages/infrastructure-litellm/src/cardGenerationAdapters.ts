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
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: (
      | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
      | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string }
    )[];
    definesLiteral: string | null;
  }): Promise<CardDraft> {
    const system = [
      "You write ONE anki-style recall card for a single learning node, conditioned ONLY on the provided grounding passages.",
      "The card has a question, a concise answer-key a grader can check a free-form learner answer against, and a short first-person self-report confidence prompt.",
      "Ground the answer-key strictly in the provided passages: introduce no facts that are not supported by them.",
      "Cite the passages your answer-key derives from by their exact passageId, quoting a substring of the passage text. For source-grounded passages, the quote must be verbatim. For generated grounding, quote only the generated grounding passage text.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing language; never reference 'the passage' or 'the source' in the question."
    ].join(" ");
    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const passageText = input.groundingPassages
      .map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`)
      .join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      input.definesLiteral ? `Definition literal (hint): "${input.definesLiteral}".` : "",
      "Grounding passages (cite by passageId):",
      passageText || "(none)",
      "",
      "Call submit_recall_card with a question, answerKey, selfReportPrompt, and at least one citation quoting a provided passage."
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
