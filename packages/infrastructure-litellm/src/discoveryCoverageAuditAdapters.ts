import { STAGE_TAGS, type DiscoveryCoverageMiss } from "@lrnki/domain-core";
import type { DiscoveryCoverageAuditPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { discoveryCoverageAuditSchema, discoveryCoverageAuditValidator } from "./toolSchemas";

// Discovery-coverage audit descriptor (plan 2026-07-10-004 U1, KTD1/KTD2). Runs on the
// cross-family independent judge (kg-independent-judge) so the extractor under audit
// never grades its own recall. A MEASUREMENT stage: it joins no operation config hash
// and its calls carry no operation_id; the catalog claims its stage tag under
// `extraction` purely for set-equality.

type DiscoveryCoverageAuditInput = Parameters<DiscoveryCoverageAuditPort["audit"]>[0];
type DiscoveryCoverageAuditArgs = z.infer<typeof discoveryCoverageAuditValidator>;

export const discoveryCoverageAuditDescriptor: NeuralStageDescriptor<
  DiscoveryCoverageAuditInput,
  DiscoveryCoverageAuditArgs,
  DiscoveryCoverageMiss[]
> = {
  promptPath: "discovery-coverage-audit.prompt",
  stageTag: STAGE_TAGS.discoveryCoverageAudit,
  schema: discoveryCoverageAuditSchema,
  validator: discoveryCoverageAuditValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    blocks: [{ blockType: "paragraph", headingPath: ["Sentinel heading"], text: "Sentinel body text." }],
    admittedConcepts: [{ label: "Sentinel concept", gist: "A sentinel gist." }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    sourceBlocks: input.blocks
      .map((block) => {
        const path = block.headingPath.length ? ` heading="${block.headingPath.join(" › ")}"` : "";
        return `[${block.blockType}${path}] ${block.text}`;
      })
      .join("\n"),
    admittedConcepts: input.admittedConcepts
      .map((concept) => `- ${concept.label}${concept.gist ? ` — ${concept.gist}` : ""}`)
      .join("\n")
  }),
  mapResult: (result) => result.misses
};

export function createDiscoveryCoverageAuditPort(client: LiteLlmForcedToolClient): DiscoveryCoverageAuditPort {
  return {
    model: readPromptFile(discoveryCoverageAuditDescriptor.promptPath).model,
    audit: (input) => executeForcedToolStage(client, discoveryCoverageAuditDescriptor, input)
  };
}
