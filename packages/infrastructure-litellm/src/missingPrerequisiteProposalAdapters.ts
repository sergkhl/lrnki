import type { MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type { MissingPrerequisiteProposalPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { missingPrerequisiteProposalSchema, missingPrerequisiteProposalValidator } from "./toolSchemas";

// The proposer is DeepSeek-family (AGENTS rule 5), routed through the same extraction
// alias as grounding generation — which is precisely why the generated-node ordering
// judge (U7) must be a different family (KTD7). It NAMES missing prerequisite
// concepts; their grounding is generated separately by GroundingGenerationPort.
export const MISSING_PREREQUISITE_PROPOSAL_MODEL = EVIDENCE_PROFILE_MODEL;

export class LiteLlmMissingPrerequisiteProposalAdapter implements MissingPrerequisiteProposalPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = MISSING_PREREQUISITE_PROPOSAL_MODEL) {
    this.model = model;
  }

  async propose(input: {
    declaredDomain: string;
    anchor: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] };
    existingNodeLabels: string[];
    maxProposals: number;
  }): Promise<MissingPrerequisiteProposal[]> {
    const system = [
      "You propose PREREQUISITE concepts a learner must understand before a given anchor concept, in a learner-neutral concept graph.",
      "Propose ONLY established, domain-general concepts that the source ASSUMES the learner already knows but does not itself teach.",
      "Do NOT propose the anchor itself, broader topics that merely contain it, downstream applications, or anything the anchor's own definition already explains.",
      "Do NOT propose a concept already present in the provided existing node labels.",
      "Stay strictly within the Declared Domain. Prefer fewer, genuinely-assumed prerequisites over breadth; return an empty list when the source assumes nothing.",
      `Propose at most ${input.maxProposals} concepts.`
    ].join("\n");
    const anchorDefinitions = input.anchor.definitionQuotes.length
      ? input.anchor.definitionQuotes.map((quote, index) => `  [${index + 1}] "${quote}"`).join("\n")
      : "  (none)";
    const existing = input.existingNodeLabels.length
      ? input.existingNodeLabels.map((label) => `- "${label}"`).join("\n")
      : "(none)";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Anchor concept: "${input.anchor.canonicalLabel}".`,
      "Anchor definition evidence:",
      anchorDefinitions,
      "",
      "Existing node labels (do not re-propose any of these):",
      existing,
      "",
      "Call submit_missing_prerequisites with the assumed-prior concepts (or an empty list)."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_missing_prerequisites",
      toolDescription: "Submit the prerequisite concepts the source assumes but does not teach for one anchor.",
      parameters: missingPrerequisiteProposalSchema,
      validator: missingPrerequisiteProposalValidator,
      tags: [STAGE_TAGS.missingPrerequisiteProposal]
    });

    // The model is asked to honor the cap, but the bound is enforced deterministically
    // here too so a non-compliant response cannot exceed the per-anchor budget.
    return result.proposals.slice(0, input.maxProposals).map((proposal) => ({
      proposedLabel: proposal.proposedLabel,
      rationale: proposal.rationale
    }));
  }
}
