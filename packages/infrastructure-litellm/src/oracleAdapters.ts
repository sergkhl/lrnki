import type {
  OracleAdmissionReferenceDraft,
  OracleAdmissionTier,
  OracleAuditVerdict,
  SourceBlock
} from "@lrnki/domain-core";
import { extractableBlocks, normalizeConceptLabel } from "@lrnki/domain-core";
import type { OracleAdmissionAuditPort, OracleAdmissionReferencePort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { renderBlocks } from "./extractionAdapters";
import {
  oracleAdmissionAuditSchema,
  oracleAdmissionAuditValidator,
  oracleAdmissionReferenceSchema,
  oracleAdmissionReferenceValidator
} from "./toolSchemas";

// Gate 2 oracle triangle aliases (ADR-0013, AGENTS rule 11). Disjoint from the
// production extraction alias (`kg-concept-admission` = DeepSeek) so no model
// grades its own homework. Aliases are resolved by LiteLLM, not pinned here.
export const ORACLE_REFERENCE_MODEL = "kg-oracle-reference"; // MiniMax M3
export const ORACLE_AUDIT_MODEL = "kg-oracle-judge"; // Mistral Small

// Bumped whenever the prompt/rubric below changes; frozen into every oracle so a
// reference can be tied back to exactly how it was authored (rule 11).
export const ORACLE_PROMPT_VERSION = "oracle-admission/2026-06-14";
export const ORACLE_RUBRIC_VERSION = "admission-core-set/2026-06-14";

export class LiteLlmOracleAdmissionReferenceAdapter implements OracleAdmissionReferencePort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ORACLE_REFERENCE_MODEL) {
    this.model = model;
  }

  async author(input: {
    declaredDomain: string;
    title: string;
    sourceBlocks: SourceBlock[];
  }): Promise<OracleAdmissionReferenceDraft> {
    const blocks = extractableBlocks(input.sourceBlocks);
    const system = [
      "You author an independent ADMISSION REFERENCE for a learner-neutral concept graph: the durable domain concepts a curated source teaches that a graph should admit.",
      "Concept Admission is precision-first but the reference must also have recall: list every concept the source genuinely TEACHES as a standalone learning objective, not just the few most central ones.",
      "A Concept is a NOUN PHRASE naming a durable unit of domain knowledge (e.g. 'Monte Carlo Tree Search', 'Overfitting'). Never list a full proposition/claim (subject + relation + object) as a concept.",
      "Tier: 'core' = a standalone learning objective with established domain meaning that carries the source's principal learning structure. 'optional' = a genuine but supporting concept (a mechanism, application, or finer-grained variant).",
      "Exclude: incidental mentions, examples used only to illustrate another concept, author names, document metadata, bibliography entries, and source-local variable/code identifiers.",
      "Every label needs at least one verbatim evidence quote copied EXACTLY from a provided block.",
      "Decide from meaning, never from a fixed list of words."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Source title: ${input.title}.`,
      "",
      "Source blocks:",
      renderBlocks(blocks),
      "",
      "Call submit_admission_reference with the concepts this source should admit."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_admission_reference",
      toolDescription: "Submit the reference set of admit-worthy concepts for this source, each with a tier and verbatim evidence.",
      parameters: oracleAdmissionReferenceSchema,
      validator: oracleAdmissionReferenceValidator
    });

    return {
      labels: result.labels.map((entry) => ({
        label: entry.label,
        normalizedLabel: normalizeConceptLabel(entry.label),
        expectedTier: entry.expectedTier,
        evidenceQuotes: entry.evidenceQuotes,
        rationale: entry.rationale
      }))
    };
  }
}

export class LiteLlmOracleAdmissionAuditAdapter implements OracleAdmissionAuditPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ORACLE_AUDIT_MODEL) {
    this.model = model;
  }

  async audit(input: {
    declaredDomain: string;
    label: string;
    expectedTier: OracleAdmissionTier;
    evidenceQuotes: string[];
    sourceBlocks: SourceBlock[];
  }): Promise<OracleAuditVerdict> {
    const blocks = extractableBlocks(input.sourceBlocks);
    const system = [
      "You are an independent second judge auditing ONE proposed reference concept for a learner-neutral concept graph.",
      "Question: does this source genuinely TEACH this as an admit-worthy standalone domain concept, at (or close to) the claimed tier?",
      "Agree when it names a durable domain concept the source teaches. Disagree (quarantine) when it is not a concept (a proposition/claim, an incidental mention, an example used only to illustrate, author/metadata), or the source does not actually teach it.",
      "'core' = principal learning structure; 'optional' = supporting concept. If admit-worthy but at a different tier, agree and set correctedTier.",
      "Judge from the source meaning, not a fixed list of words."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Proposed reference concept: "${input.label}" at tier "${input.expectedTier}".`,
      "",
      "Cited evidence quotes:",
      ...input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`),
      "",
      "Source blocks:",
      renderBlocks(blocks),
      "",
      "Call submit_admission_audit: does the source teach this as an admit-worthy concept at the claimed tier?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_admission_audit",
      toolDescription: "Submit whether the source teaches this reference concept as admit-worthy at the claimed tier.",
      parameters: oracleAdmissionAuditSchema,
      validator: oracleAdmissionAuditValidator
    });

    return {
      agrees: result.agrees,
      correctedTier: result.correctedTier ?? undefined,
      rationale: result.rationale
    };
  }
}
