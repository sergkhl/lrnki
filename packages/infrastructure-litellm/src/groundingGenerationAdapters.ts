import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import type { GroundingGenerationPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { generatedGroundingBundleSchema, generatedGroundingBundleValidator } from "./toolSchemas";

export const GROUNDING_GENERATION_MODEL = EVIDENCE_PROFILE_MODEL;

export class LiteLlmGroundingGenerationAdapter implements GroundingGenerationPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = GROUNDING_GENERATION_MODEL) {
    this.model = model;
  }

  async generate(input: {
    derivedNodeId: string;
    declaredDomain: string;
    nodeLabel: string;
    scaffoldedAnchors: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] }[];
  }): Promise<GeneratedGroundingBundle> {
    const system = [
      "You generate a CEP-shaped grounding bundle for an LLM-grounded prerequisite node in a learner-neutral derived graph layer.",
      "The bundle is NOT source-quoted evidence and must never pretend to be verbatim from the curated source.",
      "Write concise generated definition and mention-like passages that explain the prerequisite concept using the vocabulary of the provided anchor concepts.",
      "Condition the explanation on the scaffolded anchors: the generated prerequisite should be useful because it helps a learner understand those anchors.",
      "Do not introduce unrelated curriculum breadth. Stay within the Declared Domain and the provided anchors."
    ].join(" ");
    const anchorText = input.scaffoldedAnchors
      .map((anchor) => [
        `- ${anchor.canonicalLabel} (${anchor.conceptId})`,
        ...anchor.definitionQuotes.map((quote) => `  definition quote: "${quote}"`)
      ].join("\n"))
      .join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Generated prerequisite node: "${input.nodeLabel}".`,
      "Scaffolded anchors:",
      anchorText || "(none)",
      "",
      "Call submit_generated_grounding_bundle with at least one generated definition passage, optional mention-like passages, and a rationale."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_generated_grounding_bundle",
      toolDescription: "Submit generated grounding passages for one LLM-grounded prerequisite node.",
      parameters: generatedGroundingBundleSchema,
      validator: generatedGroundingBundleValidator,
      tags: [STAGE_TAGS.groundingGeneration]
    });

    const notApplicable = {
      disposition: "not_applicable_by_grounding" as const,
      rationale: "llm_grounded generated passage has no cited source block"
    };
    return {
      derivedNodeId: input.derivedNodeId,
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
      scaffoldedAnchorConceptIds: input.scaffoldedAnchors.map((anchor) => anchor.conceptId),
      generatingModel: this.model,
      rationale: result.rationale
    };
  }
}
