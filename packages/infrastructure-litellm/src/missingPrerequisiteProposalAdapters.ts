import type { MissingPrerequisiteProposal } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { MissingPrerequisiteProposalPort } from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { missingPrerequisiteProposalSchema, missingPrerequisiteProposalValidator } from "./toolSchemas";

type MissingPrerequisiteProposalInput = {
  declaredDomain: string;
  anchor: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] };
  existingNodeLabels: string[];
  maxProposals: number;
};

type MissingPrerequisiteProposalArgs = { proposals: MissingPrerequisiteProposal[] };

export const missingPrerequisiteProposalDescriptor: NeuralStageDescriptor<
  MissingPrerequisiteProposalInput,
  MissingPrerequisiteProposalArgs,
  MissingPrerequisiteProposal[]
> = {
  promptPath: "missing-prerequisite-proposal.prompt",
  stageTag: STAGE_TAGS.missingPrerequisiteProposal,
  schema: missingPrerequisiteProposalSchema,
  validator: missingPrerequisiteProposalValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    anchor: { conceptId: "sentinel_anchor", canonicalLabel: "Sentinel anchor", definitionQuotes: ["Sentinel definition."] },
    existingNodeLabels: ["Sentinel anchor"],
    maxProposals: 2
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    anchorLabel: input.anchor.canonicalLabel,
    anchorDefinitions: input.anchor.definitionQuotes.length
      ? input.anchor.definitionQuotes.map((quote, index) => `  [${index + 1}] "${quote}"`).join("\n")
      : "  (none)",
    existingLabels: input.existingNodeLabels.length
      ? input.existingNodeLabels.map((label) => `- "${label}"`).join("\n")
      : "(none)",
    maxProposals: input.maxProposals
  }),
  mapResult: (result, input) => result.proposals.slice(0, input.maxProposals).map((proposal) => ({
    proposedLabel: proposal.proposedLabel,
    rationale: proposal.rationale
  }))
};

export function createMissingPrerequisiteProposalPort(client: LiteLlmForcedToolClient): MissingPrerequisiteProposalPort {
  return {
    model: readPromptFile(missingPrerequisiteProposalDescriptor.promptPath).model,
    propose: (input) => executeForcedToolStage(client, missingPrerequisiteProposalDescriptor, input)
  };
}
