import type { BridgeConceptProposal } from "@lrnki/domain-core";
import type { BridgeConceptProposalPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { bridgeConceptProposalSchema, bridgeConceptProposalValidator } from "./toolSchemas";

export const BRIDGE_CONCEPT_PROPOSAL_MODEL = EVIDENCE_PROFILE_MODEL;

export class LiteLlmBridgeConceptProposalAdapter implements BridgeConceptProposalPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = BRIDGE_CONCEPT_PROPOSAL_MODEL) {
    this.model = model;
  }

  async propose(input: {
    declaredDomain: string;
    gap: {
      a: { conceptId: string; canonicalLabel: string; groundingTexts: string[] };
      b: { conceptId: string; canonicalLabel: string; groundingTexts: string[] };
      declinedRationale: string;
    };
    existingNodeLabels: string[];
    maxProposals: number;
  }): Promise<BridgeConceptProposal[]> {
    const system = [
      "You propose EXPERIMENTAL bridge concepts for sparse regions of a learner-neutral prerequisite graph.",
      "Given two endpoint concepts, propose only established, domain-general concepts that could help a learner connect them.",
      "Do NOT decide prerequisite direction. Do NOT propose either endpoint, a synonym of either endpoint, or any existing node label.",
      "Stay strictly within the Declared Domain. Prefer no proposal over a weak or merely associative bridge.",
      `Propose at most ${input.maxProposals} concepts.`
    ].join("\n");
    const endpoint = (name: "A" | "B", concept: { canonicalLabel: string; groundingTexts: string[] }) => {
      const grounding = concept.groundingTexts.length
        ? concept.groundingTexts.map((text, index) => `  [${index + 1}] "${text}"`).join("\n")
        : "  (none)";
      return [`Endpoint ${name}: "${concept.canonicalLabel}"`, `Endpoint ${name} grounding:`, grounding].join("\n");
    };
    const existing = input.existingNodeLabels.length
      ? input.existingNodeLabels.map((label) => `- "${label}"`).join("\n")
      : "(none)";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      endpoint("A", input.gap.a),
      "",
      endpoint("B", input.gap.b),
      "",
      "Baseline declined-pair rationale:",
      input.gap.declinedRationale,
      "",
      "Existing node labels (do not re-propose any of these):",
      existing,
      "",
      "Call submit_bridge_concepts with useful bridge concepts, or an empty list."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_bridge_concepts",
      toolDescription: "Submit bridge concepts for one sparse graph gap.",
      parameters: bridgeConceptProposalSchema,
      validator: bridgeConceptProposalValidator
    });

    return result.proposals.slice(0, input.maxProposals).map((proposal) => ({
      proposedLabel: proposal.proposedLabel,
      rationale: proposal.rationale
    }));
  }
}
