import type {
  OracleAdmissionReferenceDraft,
  OracleAdmissionTier,
  OracleAuditVerdict,
  OracleLabelAlignmentDraft,
  SourceBlock
} from "@lrnki/domain-core";
import { extractableBlocks, normalizeConceptLabel } from "@lrnki/domain-core";
import type { OracleAdmissionAuditPort, OracleAdmissionReferencePort, OracleLabelAlignmentPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { renderBlocks } from "./extractionAdapters";
import {
  oracleAdmissionAuditSchema,
  oracleAdmissionAuditValidator,
  oracleAdmissionReferenceSchema,
  oracleAdmissionReferenceValidator,
  oracleLabelAlignmentSchema,
  oracleLabelAlignmentValidator
} from "./toolSchemas";

// Gate 2 oracle triangle aliases (ADR-0013, AGENTS rule 11). Disjoint from the
// production extraction alias (`kg-concept-admission` = DeepSeek) so no model
// grades its own homework. Aliases are resolved by LiteLLM, not pinned here.
export const ORACLE_REFERENCE_MODEL = "kg-oracle-reference"; // MiniMax M3
export const ORACLE_AUDIT_MODEL = "kg-oracle-judge"; // Mistral Small
// The scoring-side label-aligner (TODO #1) reuses the independent judge family;
// it compares two label sets, so it needs no model of its own.
export const ORACLE_ALIGNMENT_MODEL = "kg-oracle-judge";

// Bumped whenever the prompt/rubric below changes; frozen into every oracle so a
// reference can be tied back to exactly how it was authored (rule 11).
export const ORACLE_PROMPT_VERSION = "oracle-admission/2026-06-14";
export const ORACLE_RUBRIC_VERSION = "admission-core-set/2026-06-14";
export const ORACLE_ALIGNMENT_PROMPT_VERSION = "oracle-label-alignment/2026-06-14";

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

export class LiteLlmOracleLabelAlignmentAdapter implements OracleLabelAlignmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ORACLE_ALIGNMENT_MODEL) {
    this.model = model;
  }

  async align(input: {
    declaredDomain: string;
    referenceLabels: { label: string; tier: OracleAdmissionTier; rationale: string }[];
    productionLabels: string[];
  }): Promise<OracleLabelAlignmentDraft> {
    const system = [
      "You align two lists of concept labels for the SAME curated source: a REFERENCE list (authored independently) and a PRODUCTION list (the system under test).",
      "Task: return each PRODUCTION label that denotes the SAME concept as exactly one REFERENCE label, only differing in SURFACE FORM.",
      "Surface-form differences that ARE the same concept: singular/plural ('operator'/'operators'), hyphenation/spacing ('trade-off'/'tradeoff'), casing, an acronym written out or added in parentheses ('Monte Carlo Tree Search'/'Monte Carlo Tree Search (MCTS)'), or a redundant domain qualifier on an otherwise identical term.",
      "Do NOT align genuinely DISTINCT concepts that merely share words: 'Operator' is not 'Operator set' is not 'Operator policy' is not 'Draft operator'; a whole is not its part; a general concept is not a specific variant.",
      "When unsure, do NOT align — leaving a true variant unaligned only under-counts agreement, but a wrong alignment fabricates agreement.",
      "Copy both labels EXACTLY from the provided lists. Each production label may align to at most one reference label."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "",
      "REFERENCE labels:",
      ...input.referenceLabels.map((entry, index) => `[R${index + 1}] (${entry.tier}) "${entry.label}" — ${entry.rationale}`),
      "",
      "PRODUCTION labels:",
      ...input.productionLabels.map((label, index) => `[P${index + 1}] "${label}"`),
      "",
      "Call submit_label_alignment with the same-concept surface-form pairs."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_label_alignment",
      toolDescription: "Submit the production labels that are the same concept as a reference label under a different surface form.",
      parameters: oracleLabelAlignmentSchema,
      validator: oracleLabelAlignmentValidator
    });

    // Fail-closed membership + one-reference-per-production-label (AGENTS rule 6).
    // The model is instructed to copy labels exactly; we drop any pair whose labels
    // are not in the provided sets rather than trust an invented label, and keep the
    // first reference a production label is matched to.
    const referenceByLabel = new Map(input.referenceLabels.map((entry) => [entry.label, entry.label]));
    const productionSet = new Set(input.productionLabels);
    const claimedProduction = new Set<string>();
    const pairs: OracleLabelAlignmentDraft["pairs"] = [];
    for (const pair of result.pairs) {
      if (!productionSet.has(pair.productionLabel)) continue;
      if (!referenceByLabel.has(pair.referenceLabel)) continue;
      if (claimedProduction.has(pair.productionLabel)) continue;
      claimedProduction.add(pair.productionLabel);
      pairs.push({
        productionLabel: pair.productionLabel,
        productionNormalizedLabel: normalizeConceptLabel(pair.productionLabel),
        referenceLabel: pair.referenceLabel,
        referenceNormalizedLabel: normalizeConceptLabel(pair.referenceLabel),
        rationale: pair.rationale
      });
    }
    return { pairs };
  }
}
