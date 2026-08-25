import type {
  AdmissionLabelJudgment,
  AdmissionProposal,
  AssertionEntailmentJudgment,
  BlockEvidence,
  DefinitionPassageQualityJudgment,
  DefinitionPassageVetoCategory,
  DiscoveredCandidate,
  ExtractedEvidenceProfile,
  ExtractedTypedAssertion,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";
import { evidenceQuoteMatches, extractableBlocks, STAGE_TAGS } from "@lrnki/domain-core";
import type { CoreSelectionReasonCode, StageTag } from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  ConceptDiscoveryPort,
  DefinitionPassageQualityJudgmentPort
} from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  admissionLabelJudgmentSchema,
  admissionLabelJudgmentValidator,
  conceptAdmissionSchemaForCandidateKeys,
  conceptAdmissionValidatorForCandidateKeys,
  conceptCoreSelectionSchemaForCandidateKeys,
  conceptCoreSelectionValidatorForCandidateKeys,
  conceptEvidenceProfileSchema,
  conceptEvidenceProfileValidator,
  conceptDiscoverySchema,
  conceptDiscoveryValidator,
  definitionEntailmentJudgmentSchema,
  definitionEntailmentJudgmentValidator,
  definitionPassageQualityJudgmentSchema,
  definitionPassageQualityJudgmentValidator
} from "./toolSchemas";

export function renderBlocks(blocks: SourceBlock[], options: { adjacencyBlocks?: SourceBlock[] } = {}): string {
  const adjacency = new Map<string, { previous?: string; next?: string }>();
  const adjacencyBlocks = options.adjacencyBlocks ?? blocks;
  adjacencyBlocks.forEach((block, index) => {
    adjacency.set(block.blockId, {
      previous: adjacencyBlocks[index - 1]?.blockId,
      next: adjacencyBlocks[index + 1]?.blockId
    });
  });

  return blocks
    .map((block) => {
      const path = block.headingPath.length ? ` heading="${block.headingPath.join(" › ")}"` : "";
      const adjacent = adjacency.get(block.blockId);
      const previous = adjacent?.previous ? ` prev=${adjacent.previous}` : "";
      const next = adjacent?.next ? ` next=${adjacent.next}` : "";
      return `[${block.blockId} type=${block.blockType}${path}${previous}${next}] ${block.text}`;
    })
    .join("\n");
}

type ConceptDiscoveryInput = { document: StructuredDocument; declaredDomain: string };
type ConceptDiscoveryArgs = { candidates: DiscoveredCandidate[] };

export const conceptDiscoveryDescriptor: NeuralStageDescriptor<
  ConceptDiscoveryInput,
  ConceptDiscoveryArgs,
  DiscoveredCandidate[]
> = {
  promptPath: "concept-discovery.prompt",
  stageTag: STAGE_TAGS.conceptDiscovery,
  schema: conceptDiscoverySchema,
  validator: conceptDiscoveryValidator,
  sentinelInput: { declaredDomain: "sentinel domain", document: sentinelDocument() },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    sourceBlocks: renderBlocks(extractableBlocks(input.document.blocks))
  }),
  mapResult: (result) => result.candidates
};

export function createConceptDiscoveryPort(client: LiteLlmForcedToolClient): ConceptDiscoveryPort {
  return {
    discover: (input) => executeForcedToolStage(client, conceptDiscoveryDescriptor, input)
  };
}

const ADMISSION_BATCH_SIZE = 5;
type ToolAdmissionProposal = Omit<AdmissionProposal, "coreSelected" | "selectionReasonCode">;
type AdmissionDecisionInput = ConceptDiscoveryInput & {
  batch: DiscoveredCandidate[];
  allCandidateLabels: string;
  candidateList: string;
};
type AdmissionDecisionArgs = { decisions: ToolAdmissionProposal[] };

export const admissionDecisionsDescriptor: NeuralStageDescriptor<
  AdmissionDecisionInput,
  AdmissionDecisionArgs,
  ToolAdmissionProposal[]
> = {
  promptPath: "admission-decisions.prompt",
  stageTag: STAGE_TAGS.admission,
  schema: (input) => conceptAdmissionSchemaForCandidateKeys(input.batch.map((candidate) => candidate.candidateKey)),
  validator: (input) => conceptAdmissionValidatorForCandidateKeys(input.batch.map((candidate) => candidate.candidateKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    document: sentinelDocument(),
    batch: [{ candidateKey: "sentinel_a", canonicalLabel: "Sentinel A", mentions: [] }],
    allCandidateLabels: '- sentinel_a: "Sentinel A"',
    candidateList: '- sentinel_a: "Sentinel A"; evidence: '
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    allCandidateLabels: input.allCandidateLabels,
    candidateList: input.candidateList,
    sourceBlocks: renderBlocks(extractableBlocks(input.document.blocks))
  }),
  mapResult: (result, input) => {
    const batchKeys = new Set(input.batch.map((candidate) => candidate.candidateKey));
    return result.decisions.filter((decision) => batchKeys.has(decision.parentCandidateKey));
  }
};

type CoreSelectionInput = {
  declaredDomain: string;
  candidates: DiscoveredCandidate[];
  decisions: ToolAdmissionProposal[];
  individuallyEligible: ToolAdmissionProposal[];
  blockHeading: Map<string, string[]>;
};
type CoreSelectionArgs = {
  selections: Array<{ candidateKey: string; selected: boolean; canonicalLabel: string; reasonCode: CoreSelectionReasonCode }>;
};

export const coreSelectionDescriptor: NeuralStageDescriptor<CoreSelectionInput, CoreSelectionArgs, CoreSelectionArgs> = {
  promptPath: "core-selection.prompt",
  stageTag: STAGE_TAGS.admission,
  schema: (input) => conceptCoreSelectionSchemaForCandidateKeys(input.individuallyEligible.map((decision) => decision.atomicKey)),
  validator: (input) => conceptCoreSelectionValidatorForCandidateKeys(input.individuallyEligible.map((decision) => decision.atomicKey)),
  sentinelInput: {
    declaredDomain: "sentinel domain",
    candidates: [{ candidateKey: "sentinel_a", canonicalLabel: "Sentinel A", mentions: [] }],
    decisions: [],
    individuallyEligible: [],
    blockHeading: new Map()
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    eligibleConcepts: input.individuallyEligible.map((decision) => renderEligibleConcept(input, decision)).join("\n")
  }),
  mapResult: (result) => result
};

export function createConceptAdmissionPort(client: LiteLlmForcedToolClient): ConceptAdmissionPort {
  return {
    async admit(input) {
      const allCandidateLabels = input.candidates
        .map((candidate) => `- ${candidate.candidateKey}: "${candidate.canonicalLabel}"`)
        .join("\n");
      const decisions: ToolAdmissionProposal[] = [];
      for (let start = 0; start < input.candidates.length; start += ADMISSION_BATCH_SIZE) {
        const batch = input.candidates.slice(start, start + ADMISSION_BATCH_SIZE);
        const candidateList = batch
          .map((candidate) => `- ${candidate.candidateKey}: "${candidate.canonicalLabel}"; evidence: ${candidate.mentions.map((mention) => `"${mention.evidenceQuote}"`).slice(0, 3).join(" | ")}`)
          .join("\n");
        decisions.push(...await executeForcedToolStage(client, admissionDecisionsDescriptor, {
          document: input.document,
          declaredDomain: input.declaredDomain,
          batch,
          allCandidateLabels,
          candidateList
        }));
      }

      const individuallyEligible = decisions.filter((decision) =>
        decision.tier !== "quarantine" &&
        decision.sourceRole === "declared_domain_concept" &&
        decision.standaloneLearningObjective.passed &&
        decision.establishedDomainMeaning.passed &&
        decision.definitionBearingTreatment.passed &&
        decision.organizingPower.passed
      );
      if (individuallyEligible.length === 0) {
        return decisions.map((decision) => ({
          ...decision,
          coreSelected: false,
          selectionReasonCode: "failed_model_eligibility"
        }));
      }

      const blockHeading = new Map(input.document.blocks.map((block) => [block.blockId, block.headingPath] as const));
      const selectionResult = await executeForcedToolStage(client, coreSelectionDescriptor, {
        declaredDomain: input.declaredDomain,
        candidates: input.candidates,
        decisions,
        individuallyEligible,
        blockHeading
      });
      const selectionCounts = new Map<string, number>();
      for (const selection of selectionResult.selections) {
        selectionCounts.set(selection.candidateKey, (selectionCounts.get(selection.candidateKey) ?? 0) + 1);
      }
      const selectionByKey = new Map(
        selectionResult.selections
          .filter((selection) => selectionCounts.get(selection.candidateKey) === 1)
          .map((selection) => [selection.candidateKey, selection] as const)
      );
      const individuallyEligibleKeys = new Set(individuallyEligible.map((decision) => decision.atomicKey));

      return decisions.map((decision) => {
        if (!individuallyEligibleKeys.has(decision.atomicKey)) {
          return { ...decision, coreSelected: false, selectionReasonCode: "failed_model_eligibility" as const };
        }
        const selection = selectionByKey.get(decision.atomicKey);
        return {
          ...decision,
          proposedCanonicalLabel: selection?.canonicalLabel ?? decision.proposedCanonicalLabel,
          coreSelected: selection?.selected ?? false,
          selectionReasonCode: (selection?.reasonCode ?? "missing_core_selection") as CoreSelectionReasonCode
        };
      });
    }
  };
}

type EvidenceProfileInput = {
  document: StructuredDocument;
  declaredDomain: string;
  subject: { candidateKey: string; canonicalLabel: string; aliases: string[] };
  admittedConcepts: { candidateKey: string; canonicalLabel: string; aliases: string[] }[];
  evidenceNeighborhood: SourceBlock[];
  definitionBearingEvidence: BlockEvidence[];
};
type EvidenceProfileArgs = {
  definitions: BlockEvidence[];
  mentions: BlockEvidence[];
  assertions: Array<{ type: "defines"; objectKind: "literal"; literalValue: string | null; evidence: BlockEvidence[] }>;
};

export const evidenceProfileExtractionDescriptor: NeuralStageDescriptor<
  EvidenceProfileInput,
  EvidenceProfileArgs,
  ExtractedEvidenceProfile
> = {
  promptPath: "cep-extraction.prompt",
  stageTag: STAGE_TAGS.cepExtraction,
  schema: conceptEvidenceProfileSchema,
  validator: conceptEvidenceProfileValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    document: sentinelDocument(),
    subject: { candidateKey: "sentinel_a", canonicalLabel: "Sentinel A", aliases: [] },
    admittedConcepts: [],
    evidenceNeighborhood: [],
    definitionBearingEvidence: []
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    subjectLine: `${input.subject.candidateKey} = "${input.subject.canonicalLabel}"`,
    aliases: renderAliases(input.subject.aliases),
    evidenceBlocks: renderBlocks(input.evidenceNeighborhood, { adjacencyBlocks: extractableBlocks(input.document.blocks) }),
    definitionHint: input.definitionBearingEvidence.length > 0
      ? `\nAdmission already found that this source establishes the subject concept's meaning here (use as a hint; you must still quote a verbatim definition passage from the evidence blocks above):\n${input.definitionBearingEvidence.map((evidence) => `- "${evidence.evidenceQuote}"`).join("\n")}\n\n`
      : "\n"
  }),
  mapResult: (result) => {
    const assertions: ExtractedTypedAssertion[] = [];
    for (const assertion of result.assertions) {
      if (assertion.type === "defines") {
        if (assertion.literalValue === null || assertion.literalValue.trim() === "") continue;
        assertions.push({ type: "defines", literalValue: assertion.literalValue, evidence: assertion.evidence });
      }
    }
    return { definitions: result.definitions, mentions: result.mentions, assertions };
  }
};

export function createEvidenceProfileExtractionPort(client: LiteLlmForcedToolClient): ConceptConditionedEvidenceProfileExtractionPort {
  return {
    extract: (input) => executeForcedToolStage(client, evidenceProfileExtractionDescriptor, input)
  };
}

type DefinitionEntailmentInput = {
  declaredDomain: string;
  subject: { canonicalLabel: string; aliases: string[] };
  definition: string;
  evidenceQuotes: string[];
};
type DefinitionEntailmentArgs = {
  subjectMatch: "exact_or_interchangeable" | "qualified_variant" | "different_or_absent";
  subjectSpan: string;
  definitionEntailed: boolean;
  entailingSpan: string;
  rationale: string;
};

export const definitionEntailmentDescriptor: NeuralStageDescriptor<
  DefinitionEntailmentInput,
  DefinitionEntailmentArgs,
  AssertionEntailmentJudgment
> = {
  promptPath: "definition-entailment.prompt",
  stageTag: STAGE_TAGS.assertionEntailment,
  schema: definitionEntailmentJudgmentSchema,
  validator: definitionEntailmentJudgmentValidator,
  sentinelInput: { declaredDomain: "sentinel domain", subject: { canonicalLabel: "Sentinel", aliases: [] }, definition: "sentinel definition", evidenceQuotes: ["sentinel quote"] },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    canonicalLabel: input.subject.canonicalLabel,
    aliases: renderAliases(input.subject.aliases),
    definition: input.definition,
    evidenceQuotes: input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`).join("\n")
  }),
  mapResult: (result, input) => {
    const subjectSpan = result.subjectSpan.trim();
    const entailingSpan = result.entailingSpan.trim();
    const subjectGrounded = subjectSpan.length > 0 &&
      input.evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, subjectSpan));
    const definitionGrounded = entailingSpan.length > 0 &&
      input.evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, entailingSpan));
    const entailed =
      result.subjectMatch === "exact_or_interchangeable" &&
      subjectGrounded &&
      result.definitionEntailed &&
      definitionGrounded;
    return {
      entailed,
      entailingSpan: entailed ? entailingSpan : "",
      rationale: `${result.rationale} [subjectMatch=${result.subjectMatch}; subjectSpan=${JSON.stringify(subjectSpan)}; subjectGrounded=${subjectGrounded}; definitionEntailed=${result.definitionEntailed}; entailingSpan=${JSON.stringify(entailingSpan)}; definitionGrounded=${definitionGrounded}]`
    };
  }
};

export function createAssertionEntailmentJudgmentPort(client: LiteLlmForcedToolClient): AssertionEntailmentJudgmentPort {
  return {
    model: readPromptFile(definitionEntailmentDescriptor.promptPath).model,
    judgeDefinition: (input) => executeForcedToolStage(client, definitionEntailmentDescriptor, input)
  };
}

type DefinitionPassageQualityInput = {
  declaredDomain: string;
  subject: { canonicalLabel: string; aliases: string[] };
  passages: { sourceBlockId: string; evidenceQuote: string; blockType: string; headingPath: string[] }[];
};
type DefinitionPassageQualityArgs = {
  judgments: Array<{
    index: number;
    establishesMeaning: boolean;
    category: "establishes_meaning" | "bare_name_repetition" | "heading_or_title" | "citation_or_bibliographic";
    judgedSpan: string;
    rationale: string;
  }>;
};

export function definitionPassageQualityDescriptor(stageTag: StageTag = STAGE_TAGS.definitionPassageQuality): NeuralStageDescriptor<
  DefinitionPassageQualityInput,
  DefinitionPassageQualityArgs,
  DefinitionPassageQualityJudgment[]
> {
  return {
    promptPath: "definition-passage-quality.prompt",
    stageTag,
    schema: definitionPassageQualityJudgmentSchema,
    validator: definitionPassageQualityJudgmentValidator,
    sentinelInput: {
      declaredDomain: "sentinel domain",
      subject: { canonicalLabel: "Sentinel", aliases: [] },
      passages: [{ sourceBlockId: "b1", evidenceQuote: "Sentinel means a placeholder.", blockType: "paragraph", headingPath: [] }]
    },
    templateData: (input) => ({
      declaredDomain: input.declaredDomain,
      canonicalLabel: input.subject.canonicalLabel,
      aliases: renderAliases(input.subject.aliases),
      passages: input.passages.map((passage, index) =>
        `[${index}] blockType=${passage.blockType}; headingPath=${renderHeadingPath(passage.headingPath)}; quote="${passage.evidenceQuote}"`
      ).join("\n")
    }),
    mapResult: (result, input) => mapDefinitionPassageQuality(result, input)
  };
}

export function createDefinitionPassageQualityJudgmentPort(
  client: LiteLlmForcedToolClient,
  stageTag: StageTag = STAGE_TAGS.definitionPassageQuality
): DefinitionPassageQualityJudgmentPort {
  const descriptor = definitionPassageQualityDescriptor(stageTag);
  return {
    model: readPromptFile(descriptor.promptPath).model,
    judgeDefinitions(input) {
      if (input.passages.length === 0) return Promise.resolve([]);
      return executeForcedToolStage(client, descriptor, input);
    }
  };
}

type AdmissionLabelInput = {
  declaredDomain: string;
  label: string;
  aliases: string[];
  evidenceQuotes: string[];
};

export const admissionLabelJudgmentDescriptor: NeuralStageDescriptor<
  AdmissionLabelInput,
  AdmissionLabelJudgment,
  AdmissionLabelJudgment
> = {
  promptPath: "admission-label-judgment.prompt",
  stageTag: STAGE_TAGS.admissionLabelJudge,
  schema: admissionLabelJudgmentSchema,
  validator: admissionLabelJudgmentValidator,
  sentinelInput: { declaredDomain: "sentinel domain", label: "Sentinel", aliases: [], evidenceQuotes: ["Sentinel evidence."] },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    label: input.label,
    aliases: renderAliases(input.aliases),
    evidenceQuotes: input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`).join("\n")
  }),
  mapResult: (result, input) => groundedAdmissionLabelJudgment(result, input.evidenceQuotes)
};

export function createAdmissionLabelJudgmentPort(client: LiteLlmForcedToolClient): AdmissionLabelJudgmentPort {
  return {
    model: readPromptFile(admissionLabelJudgmentDescriptor.promptPath).model,
    judge: (input) => executeForcedToolStage(client, admissionLabelJudgmentDescriptor, input)
  };
}

function renderEligibleConcept(input: CoreSelectionInput, decision: ToolAdmissionProposal): string {
  const headingFor = (blockId: string): string => {
    const path = input.blockHeading.get(blockId);
    return path && path.length ? path.join(" › ") : "(no heading)";
  };
  return [
    `- ${decision.atomicKey}: parent="${input.candidates.find((candidate) => candidate.candidateKey === decision.parentCandidateKey)?.canonicalLabel ?? decision.parentCandidateKey}", proposed="${decision.proposedCanonicalLabel}"`,
    `  standalone: ${decision.standaloneLearningObjective.rationale}`,
    ...decision.standaloneLearningObjective.evidence.map((evidence) => `  standalone evidence [${headingFor(evidence.blockId)}]: "${evidence.evidenceQuote}"`),
    ...decision.organizingPower.aspects.map((aspect) => `  aspect (${aspect.nature}) [${headingFor(aspect.evidence.blockId)}]: ${aspect.summary} — "${aspect.evidence.evidenceQuote}"`)
  ].join("\n");
}

function mapDefinitionPassageQuality(
  result: DefinitionPassageQualityArgs,
  input: DefinitionPassageQualityInput
): DefinitionPassageQualityJudgment[] {
  const keep = (rationale: string): DefinitionPassageQualityJudgment => ({
    establishesMeaning: true,
    category: "establishes_meaning",
    judgedSpan: "",
    rationale
  });
  const byIndex = new Map(result.judgments.map((judgment) => [judgment.index, judgment] as const));
  return input.passages.map((passage, index) => {
    const judgment = byIndex.get(index);
    if (!judgment) return keep(`[no verdict for index ${index}: kept]`);
    if (judgment.establishesMeaning) {
      return { establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: judgment.rationale };
    }
    const span = judgment.judgedSpan.trim();
    const grounded = span.length > 0 && evidenceQuoteMatches(passage.evidenceQuote, span);
    if (!grounded) {
      return keep(`${judgment.rationale} [ungrounded veto kept: judgedSpan=${JSON.stringify(span)}]`);
    }
    const category: DefinitionPassageVetoCategory =
      judgment.category === "establishes_meaning" ? "bare_name_repetition" : judgment.category;
    return { establishesMeaning: false, category, judgedSpan: span, rationale: judgment.rationale };
  });
}

function groundedAdmissionLabelJudgment(
  result: AdmissionLabelJudgment,
  evidenceQuotes: string[]
): AdmissionLabelJudgment {
  if (result.labelKind === "concept") {
    return { labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: result.rationale };
  }
  const span = result.groundingSpan.trim();
  const spanGrounded = span.length > 0 && evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, span));
  if (result.labelKind === "source_artifact" && spanGrounded) {
    return {
      labelKind: "source_artifact",
      underlyingNounPhrase: "",
      groundingSpan: span,
      rationale: result.rationale
    };
  }
  const nounPhrase = result.underlyingNounPhrase.trim();
  const nounPhraseGrounded = nounPhrase.length > 0 && evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, nounPhrase));
  if (result.labelKind === "proposition_or_claim" && spanGrounded && nounPhraseGrounded) {
    return { labelKind: "proposition_or_claim", underlyingNounPhrase: nounPhrase, groundingSpan: span, rationale: result.rationale };
  }
  return {
    labelKind: "concept",
    underlyingNounPhrase: "",
    groundingSpan: "",
    rationale: `${result.rationale} [ungrounded ${result.labelKind} verdict kept core: spanGrounded=${spanGrounded}; nounPhraseGrounded=${nounPhraseGrounded}]`
  };
}

function renderAliases(aliases: string[]): string {
  return aliases.length > 0 ? aliases.map((alias) => `"${alias}"`).join(", ") : "none";
}

function renderHeadingPath(headingPath: string[]): string {
  return headingPath.length > 0 ? headingPath.map((heading) => `"${heading}"`).join(" › ") : "none";
}

function sentinelDocument(): StructuredDocument {
  return {
    sourceResourceId: "sentinel",
    parserName: "sentinel-parser",
    parserVersion: "1",
    parserConfigHash: "sentinel",
    blocks: []
  };
}
