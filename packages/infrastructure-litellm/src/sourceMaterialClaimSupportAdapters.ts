import { classifyEvidenceMatch, STAGE_TAGS } from "@lrnki/domain-core";
import type { SourceMaterialClaimSupportVerificationPort } from "@lrnki/ports";
import type { z } from "zod";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  sourceMaterialClaimSupportSchema,
  sourceMaterialClaimSupportValidator
} from "./toolSchemas";

type SourceMaterialClaimSupportInput = Parameters<SourceMaterialClaimSupportVerificationPort["verify"]>[0];
type SourceMaterialClaimSupportArgs = z.infer<typeof sourceMaterialClaimSupportValidator>;

export const sourceMaterialClaimSupportDescriptor: NeuralStageDescriptor<
  SourceMaterialClaimSupportInput,
  SourceMaterialClaimSupportArgs,
  SourceMaterialClaimSupportArgs
> = {
  promptPath: "source-material-claim-support.prompt",
  stageTag: STAGE_TAGS.sourceMaterialClaimSupport,
  schema: sourceMaterialClaimSupportSchema,
  validator: sourceMaterialClaimSupportValidator,
  // Provider rate-limit recovery is transport-only: a valid semantic verdict is never rerolled.
  // One extra attempt gives the 15s/30s/60s 429 policy enough time to cross a minute window.
  maxRetries: 3,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    subject: { canonicalLabel: "Sentinel subject", aliases: ["Sentinel alias"] },
    claim: {
      claimKey: "sentinel:claim",
      statement: "A sentinel material claim.",
      evaluationKind: "assertion"
    },
    evidence: [{
      evidenceKey: "sentinel:evidence",
      passageKind: "definition",
      blockText: "A sentinel source block establishes one bounded material fact.",
      citedQuote: "establishes one bounded material fact",
      direct: true
    }]
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    subjectLabel: input.subject.canonicalLabel,
    aliasText: input.subject.aliases.length ? ` (aliases: ${input.subject.aliases.join(", ")})` : "",
    claimKey: input.claim.claimKey,
    claimStatement: input.claim.statement,
    claimEvaluationKind: input.claim.evaluationKind,
    claimEvaluationGuidance: renderClaimEvaluationGuidance(input.claim.evaluationKind),
    occurrenceAudit: renderOccurrenceAudit(input.claim.statement, input.evidence),
    evidence: renderEvidence(input.evidence)
  }),
  mapResult: (args) => args
};

export function createSourceMaterialClaimSupportVerificationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): SourceMaterialClaimSupportVerificationPort {
  const descriptor = withModelOverride(sourceMaterialClaimSupportDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(sourceMaterialClaimSupportDescriptor.promptPath).model,
    verify: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

function renderEvidence(input: SourceMaterialClaimSupportInput["evidence"]): string {
  return input.map((evidence, index) => [
    `Evidence ${index + 1} (${evidence.passageKind}; ${evidence.direct ? "directly cited" : "broader subject evidence"}; key ${JSON.stringify(evidence.evidenceKey)}):`,
    "<cited_quote>",
    evidence.citedQuote,
    "</cited_quote>",
    "<source_block>",
    evidence.blockText,
    "</source_block>"
  ].join("\n")).join("\n\n");
}

function renderOccurrenceAudit(
  claimStatement: string,
  evidence: SourceMaterialClaimSupportInput["evidence"]
): string {
  const rows = evidence.map((row, index) => {
    const matchKind = classifyEvidenceMatch(row.blockText, claimStatement);
    return `Evidence ${index + 1}: ${matchKind === "none" ? "absent" : `${matchKind} substring`}`;
  });
  return rows.join("\n");
}

function renderClaimEvaluationGuidance(
  evaluationKind: SourceMaterialClaimSupportInput["claim"]["evaluationKind"]
): string {
  return evaluationKind === "matching_relationship"
    ? "This is an assessment transformation. Judge whether the source entails the semantic prompt-to-match relationship. The source need not contain a matching exercise, instruction, prompt wording, or match label verbatim; absence of that presentation form is not a refusal reason. Do not use outside domain knowledge or forgive any added, omitted, reversed, or weakened material content."
    : "This is a plain assertion. Judge every truth-evaluable material part of the exact claim against the supplied evidence.";
}
