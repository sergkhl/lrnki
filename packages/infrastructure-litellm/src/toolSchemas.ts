import { z } from "zod";
import type { JsonSchema } from "./LiteLlmForcedToolClient";
import { toForcedToolSchema } from "./forcedToolSchema";

// Forced named tool schemas (ADR-0006). strict:true requires every property in
// `required` with additionalProperties:false; optionals are modelled as nullable.
// All tool arguments are re-validated here with zod and fail closed (AGENTS rule 6).

const blockEvidence = z.object({
  blockId: z.string().min(1).describe("Exact block id the quote is taken from, e.g. 'block-12'."),
  evidenceQuote: z.string().min(1).describe("Verbatim substring copied from that block's text.")
}).strict();

const passageCitation = z.object({
  passageId: z.string().min(1).describe("Exact passageId of the provided grounding passage the correct answer derives from."),
  evidenceQuote: z.string().min(1).describe("Substring copied from that grounding passage supporting the correct answer. For source-grounded passages, copy it verbatim.")
}).strict();

const enumForKeys = (keys: string[] | undefined) =>
  keys && keys.length ? z.enum(keys as [string, ...string[]]) : z.string().min(1);

// --- Candidate Discovery: submit_concept_candidates ------------------------

export const conceptDiscoveryValidator = z.object({
  candidates: z.array(z.object({
    candidateKey: z.string().min(1).describe("Short stable slug unique within this document, e.g. 'topic_x'."),
    canonicalLabel: z.string().min(1),
    mentions: z.array(blockEvidence)
  }).strict())
}).strict();

export const conceptDiscoverySchema: JsonSchema = toForcedToolSchema(conceptDiscoveryValidator);

// --- Concept Admission: submit_admission_decisions ------------------------

const admissionCriterion = z.object({
  passed: z.boolean(),
  rationale: z.string().min(1),
  // Soft tidiness bound, not a correctness gate. `strict` forced-tool mode does not
  // enforce maxItems at generation time, so the boundary validator must TOLERATE a
  // benign over-count (a model returning 3 quotes must not abort the whole run); the
  // application only needs >=1 verified quote. Capped generously so a runaway array
  // still fails closed (rule 6).
  evidence: z.array(blockEvidence).max(4)
}).strict();

const organizingPowerAspect = z.object({
  summary: z.string().min(1),
  nature: z.enum([
    "definition-or-property",
    "mechanism",
    "structural-relationship",
    "contrast",
    "constraint",
    "causal-or-limiting",
    "empirical-evidence",
    "motivation-or-example"
  ]),
  evidence: blockEvidence
}).strict();

export function conceptAdmissionValidatorForCandidateKeys(parentCandidateKeys?: string[]) {
  return z.object({
    decisions: z.array(z.object({
      parentCandidateKey: enumForKeys(parentCandidateKeys).describe("The discovered candidateKey this atomic concept was split from."),
      atomicKey: z.string().min(1).describe("Run-local key for this ATOMIC concept, unique across all decisions. Use the parentCandidateKey verbatim when the candidate names exactly one concept; append a distinct suffix per atom when splitting a conflated candidate (e.g. 'a_and_b__a', 'a_and_b__b')."),
      proposedCanonicalLabel: z.string().min(1).describe("Precise domain-qualified label for this single atomic concept. Keep the discovered label when it is already precise and atomic."),
      tier: z.enum(["core", "optional", "reject", "quarantine"]),
      sourceRole: z.enum(["declared_domain_concept", "out_of_domain_illustration"]).describe("'declared_domain_concept' when this is a genuine concept of the Declared Domain that the source teaches. 'out_of_domain_illustration' when it belongs to another domain and appears ONLY as example, sample, benchmark, or evaluation material for this source; such material is rejected, never kept optional."),
      standaloneLearningObjective: admissionCriterion,
      establishedDomainMeaning: admissionCriterion,
      definitionBearingTreatment: admissionCriterion.describe("passed=true only when the source gives this concept DEFINITION-BEARING treatment: a passage that establishes what the concept means — its defining properties, the criteria that distinguish it, or how it is constituted — as opposed to a bare mention, an example, or a passing reference. The evidence MUST be the verbatim passage that establishes the meaning. A definition need not use a copula or an 'X is Y' phrasing; meaning can be established by description, mechanism, or contrast. If the source only names or uses the concept without establishing its meaning, set passed=false."),
      organizingPower: z.object({
        passed: z.boolean(),
        rationale: z.string().min(1),
        aspects: z.array(organizingPowerAspect).max(3)
      }).strict(),
      reasonCodes: z.array(z.string()),
      confidence: z.number().min(0).max(1)
    }).strict())
  }).strict();
}

export function conceptAdmissionSchemaForCandidateKeys(parentCandidateKeys?: string[]): JsonSchema {
  return toForcedToolSchema(conceptAdmissionValidatorForCandidateKeys(parentCandidateKeys));
}

export const conceptAdmissionValidator = conceptAdmissionValidatorForCandidateKeys();
export const conceptAdmissionSchema: JsonSchema = conceptAdmissionSchemaForCandidateKeys();

// --- Source-level Core Set Selection: submit_core_selection ---------------

const CORE_SELECTION_REASON_CODES = [
  "source_level_core",
  "reducible_to_broader_candidate",
  "supporting_mechanism",
  "example_or_application",
  "pseudo_concept_or_heading",
  "insufficient_source_treatment",
  "redundant_granularity"
] as const;

export function conceptCoreSelectionValidatorForCandidateKeys(candidateKeys: string[]) {
  return z.object({
    selections: z.array(z.object({
      candidateKey: enumForKeys(candidateKeys),
      selected: z.boolean(),
      canonicalLabel: z.string().min(1).describe("Final precise, domain-qualified label. Preserve the individually proposed label when already precise."),
      reasonCode: z.enum(CORE_SELECTION_REASON_CODES)
    }).strict()).max(candidateKeys.length)
  }).strict();
}

export function conceptCoreSelectionSchemaForCandidateKeys(candidateKeys: string[]): JsonSchema {
  return toForcedToolSchema(conceptCoreSelectionValidatorForCandidateKeys(candidateKeys));
}

export const conceptCoreSelectionValidator = z.object({
  selections: z.array(z.object({
    candidateKey: z.string().min(1),
    selected: z.boolean(),
    canonicalLabel: z.string().min(1).describe("Final precise, domain-qualified label. Preserve the individually proposed label when already precise."),
    reasonCode: z.enum(CORE_SELECTION_REASON_CODES)
  }).strict())
}).strict();

// --- CEP Extraction: submit_concept_evidence_profile ----------------------
// One Concept Evidence Profile for the subject Concept: meaning-bearing definition
// passages, salience-ordered mention passages, and zero or more optional `defines`
// assertions. Every concept-to-concept relationship is an untyped mention passage.

const optionalTypedAssertion = z.object({
  type: z.enum(["defines"]).describe("'defines' = the evidence defines the subject (objectKind=literal, literalValue set)."),
  objectKind: z.enum(["literal"]),
  literalValue: z.string().nullable().describe("A faithful, concise definition grounded in the evidence quote."),
  evidence: z.array(blockEvidence)
}).strict();

export const conceptEvidenceProfileValidator = z.object({
  definitions: z.array(blockEvidence).describe("Verbatim passages that establish the subject concept's meaning. Need NOT use a literal 'X is Y' form, but each must be a meaning-bearing quote. At least one is required."),
  mentions: z.array(blockEvidence).describe("Verbatim passages where the source substantively teaches, applies, relates, or constrains the subject concept (taxonomy, structure, contrast, employment, mechanism). ORDER THEM from most to least useful for understanding the concept and its prerequisites; the application keeps the first few."),
  assertions: z.array(optionalTypedAssertion).describe("Optional `defines` assertions. Emit only when the evidence explicitly supports a definition literal. Everything else belongs in mentions.")
}).strict();

export const conceptEvidenceProfileSchema: JsonSchema = toForcedToolSchema(conceptEvidenceProfileValidator);

// --- Whole-set prerequisite ordering: submit_prerequisite_ordering --------
// ONE whole-set ordering over all evidenced nodes in a Declared Domain (ADR-0019
// amended — whole-set ordering, plan U2/KTD2). The model returns a directed acyclic
// edge list over the listed concepts; it is globally self-consistent by construction,
// so a non-edge is simply absent — there is no per-edge 'none'/'uncertain' token. Each
// edge cites its two endpoints by the 1-based concept NUMBER shown before it in the
// prompt — a closed-set menu pick, not free text — so synonyms/paraphrases cannot drift
// past an exact label match. Schema + validator are built per call from the node count
// `N`, so the index bounds [1, N] are concrete: a bad index re-prompts once (defense-in-
// depth under strict decoding), then the application fails closed (R9, KTD3, rule 6).

export function buildPrerequisiteOrderingValidator(n: number) {
  return z.object({
    edges: z.array(z.object({
      prerequisiteNumber: z.number().int().min(1).max(n).describe("The 1-based Concept number (as shown before each concept) of the concept that must be understood FIRST."),
      dependentNumber: z.number().int().min(1).max(n).describe("The 1-based Concept number of the concept that depends on the prerequisite. Must be a DIFFERENT listed number."),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).describe("One terse sentence grounded in the concept meanings and evidence.")
    }).strict().refine((edge) => edge.prerequisiteNumber !== edge.dependentNumber, {
      message: "An edge must cite two DIFFERENT concept numbers."
    })).describe("The directed prerequisite edges over the listed concepts, forming one acyclic ordering. Omit a pair entirely when neither concept must be understood before the other. Do not emit a cycle: if you cannot decide a direction, leave the pair out.")
  }).strict();
}

export function buildPrerequisiteOrderingSchema(n: number): JsonSchema {
  return toForcedToolSchema(buildPrerequisiteOrderingValidator(n));
}

// --- Generated grounding: submit_generated_grounding_bundle ---------------

const generatedGroundingPassage = z.object({
  text: z.string().min(1).describe("Generated explanatory passage for the prerequisite concept. This is not a source quote.")
}).strict();

export const generatedGroundingBundleValidator = z.object({
  definitions: z.array(generatedGroundingPassage).min(1).max(2).describe("Generated meaning-bearing definition passages for the prerequisite concept."),
  mentions: z.array(generatedGroundingPassage).max(4).describe("Generated mention-like passages that connect the prerequisite concept to the scaffolded anchors."),
  rationale: z.string().min(1).describe("One terse sentence explaining why this prerequisite scaffolds the provided anchors.")
}).strict();

export const generatedGroundingBundleSchema: JsonSchema = toForcedToolSchema(generatedGroundingBundleValidator);

// --- Missing-prerequisite proposal: submit_missing_prerequisites ----------
// The explicit, inspectable node-IDENTITY operation (R7, KTD6, handoff): for one
// anchor, propose prerequisite concepts the source assumes but never teaches. The
// model returns LABELS only — grounding is generated separately — so this stays a
// bounded proposal, not free-form node construction. The application dedupes against
// existing node labels and enforces the per-anchor / per-run caps.

export const missingPrerequisiteProposalValidator = z.object({
  proposals: z.array(z.object({
    proposedLabel: z.string().min(1).describe("Precise, domain-qualified label for one assumed-prior concept. Not the anchor itself and not already listed among the existing node labels."),
    rationale: z.string().min(1).describe("One terse sentence: why a learner must understand this before the anchor.")
  }).strict()).describe("Prerequisite concepts a learner must understand BEFORE the anchor concept but that the source assumes rather than teaches. Domain-general established concepts only; omit anything the anchor's own evidence already explains. Return an empty array when nothing is assumed.")
}).strict();

export const missingPrerequisiteProposalSchema: JsonSchema = toForcedToolSchema(missingPrerequisiteProposalValidator);

// --- Intrinsic difficulty judgment: submit_intrinsic_difficulty ----------
// One bounded learner-neutral difficulty judgment over a derived node's evidence.
// The score is later fused with deterministic graph/evidence components; this
// schema captures only the neural subscore and a short rationale. The rubric text
// stays domain-neutral and contains no fixture-derived exemplars (AGENTS rule 17).

export const intrinsicDifficultyValidator = z.object({
  neuralScore: z.number().min(0).max(1).describe("Learner-neutral intrinsic difficulty in [0,1], based on abstraction level, technical density, implied background load, and how much the evidence requires integrating multiple ideas."),
  rationale: z.string().min(1).describe("One terse sentence explaining the generic difficulty factors that drove the score.")
}).strict();

export const intrinsicDifficultySchema: JsonSchema = toForcedToolSchema(intrinsicDifficultyValidator);

export const definitionEntailmentJudgmentValidator = z.object({
  subjectMatch: z.enum(["exact_or_interchangeable", "qualified_variant", "different_or_absent"]),
  subjectSpan: z.string().describe("Minimal exact sub-quote that identifies the subject; empty when different or absent."),
  definitionEntailed: z.boolean(),
  entailingSpan: z.string().describe("Minimal exact sub-quote that states the candidate definition; empty when unsupported."),
  rationale: z.string().min(1)
}).strict();

export const definitionEntailmentJudgmentSchema: JsonSchema = toForcedToolSchema(definitionEntailmentJudgmentValidator);

// --- Definition-Passage quality judgment: submit_definition_passage_quality_judgments
// BATCHED judgment over ONE core Concept's already-verbatim-verified Definition
// Passages (ADR-0007 extension, KTD4). The model returns one verdict per passage,
// keyed by the passage's input `index`, deciding whether each passage ESTABLISHES the
// Concept's meaning or is a hollow passage. `category` is a DOMAIN-NEUTRAL structural
// shape (AGENTS rule 17 — names no fixture concept); `judgedSpan` is the minimal
// verbatim sub-quote the verdict rests on, ground-checked fail-closed-to-keep at the
// application boundary so an ungrounded veto never drops a passage.

export const definitionPassageQualityJudgmentValidator = z.object({
  judgments: z.array(
    z.object({
      index: z.number().int().min(0).describe("The 0-based index of the passage this verdict applies to, copied from the listed passage."),
      establishesMeaning: z.boolean().describe("true when the passage actually conveys the concept's meaning — it states defining properties, distinguishing criteria, the mechanism, or a contrast that pins down what the concept IS. false when the passage is hollow: a bare repetition of the concept's own name, a section heading or title, or a citation/bibliographic reference, with no defining content."),
      category: z.enum(["establishes_meaning", "bare_name_repetition", "heading_or_title", "citation_or_bibliographic"]).describe("The structural shape of the passage. 'establishes_meaning' when establishesMeaning is true. Otherwise the kind of hollow passage: 'bare_name_repetition' (the passage only restates the concept's name or label), 'heading_or_title' (the passage is a section heading or document title, not prose about the concept), or 'citation_or_bibliographic' (the passage is a reference, citation, or bibliographic phrase). Judge by what the text MEANS, not solely by the block's structural type, which is provided only as context."),
      judgedSpan: z.string().describe("The minimal exact sub-quote (copied verbatim from this passage) the verdict rests on. For a veto, the span the model judged hollow. Must be a verbatim substring of the passage."),
      rationale: z.string().min(1).describe("One terse sentence.")
    }).strict()
  ).describe("One verdict per provided Definition Passage, identified by its input index.")
}).strict();

export const definitionPassageQualityJudgmentSchema: JsonSchema = toForcedToolSchema(definitionPassageQualityJudgmentValidator);

// --- Admission label judgment: submit_admission_label_judgment ------------
// One bounded judgment over a single admitted-`core` label (ADR-0005). The model
// decides whether the label NAMES a concept or ASSERTS a proposition/claim about
// one, and (when a proposition) names the underlying noun phrase it reduces to.
// `groundingSpan` is the minimal verbatim sub-quote that shows the predication;
// the application boundary fails closed to `concept` when the span or the noun
// phrase is not source-grounded, so the judge cannot demote on absent text.

export const admissionLabelJudgmentValidator = z.object({
  labelKind: z.enum(["concept", "proposition_or_claim"]).describe("'concept' when the label is a noun phrase naming a durable unit of domain knowledge (even a long multi-word one). 'proposition_or_claim' ONLY when the label asserts a full predication about a concept — a subject + relation + object statement such as '<Subject> as <Claimed Role>' or '<Subject> limited by <Constraint>'. A long nominal label is still a concept."),
  underlyingNounPhrase: z.string().describe("When proposition_or_claim, the noun-phrase concept the label reduces to (for example '<Subject>' from '<Subject> as <Claimed Role>'), copied verbatim from the label/evidence. Empty string when labelKind is concept."),
  groundingSpan: z.string().describe("When proposition_or_claim, the minimal verbatim sub-quote (copied exactly from one provided evidence quote) showing the label asserts a predication. Empty string when labelKind is concept."),
  rationale: z.string().min(1).describe("One terse sentence.")
}).strict();

export const admissionLabelJudgmentSchema: JsonSchema = toForcedToolSchema(admissionLabelJudgmentValidator);

// --- Rescue durability judgment: submit_rescue_durability_judgment ----------
// One bounded judgment over a single aggregated `source_mentioned` rescue candidate
// (U3). The model decides whether the candidate is a DURABLE prerequisite a learner
// must grasp before the same-domain anchors it would scaffold, or an incidental
// artifact. `groundingSpan` is the minimal verbatim sub-quote (from the candidate's
// own mention evidence) a `not_durable` veto rests on; the application boundary keeps
// the node fail-open when the span is not grounded, so the judge cannot drop on
// absent text. Domain-neutral rubric — no fixture-specific labels (AGENTS rule 17).

export const rescueDurabilityJudgmentValidator = z.object({
  verdict: z.enum(["durable", "not_durable"]).describe("'durable' when the candidate names a concept a learner would genuinely need to understand before the anchor concepts — a real, transferable unit of domain knowledge that scaffolds them. 'not_durable' when it is an incidental artifact rather than a durable prerequisite: a label specific to one method, system, experiment, dataset, or ablation; a pedagogical-role or section label; a passing or source-local detail that a learner does not need as a standalone prerequisite. Judge by the candidate's meaning and its relationship to the anchors, never by surface wordform. When genuinely unsure, prefer 'durable' (precision-first veto: only drop on a clear, evidenced non-durable judgment)."),
  groundingSpan: z.string().describe("When verdict is 'not_durable', the minimal verbatim sub-quote — copied exactly from one of the candidate's own mention quotes — that shows it is an incidental artifact rather than a durable prerequisite. Empty string when verdict is 'durable'."),
  rationale: z.string().min(1).describe("One terse sentence.")
}).strict();

export const rescueDurabilityJudgmentSchema: JsonSchema = toForcedToolSchema(rescueDurabilityJudgmentValidator);

// --- Minting durability judgment: submit_minting_durability_judgment -------
// One bounded judgment over a single proposed assumed-prerequisite label before
// grounding generation. The model decides whether the proposed label is a DURABLE
// prerequisite for the anchor or merely tangential/named in passing. Decision-only:
// there is no generated-node source span to ground against, so the application stage
// owns drop-only fail-open semantics. Domain-neutral rubric — no fixture-specific
// labels, lexical lists, or surface patterns (AGENTS rules 16/17).

export const mintingDurabilityJudgmentValidator = z.object({
  verdict: z.enum(["durable", "not_durable"]).describe("'durable' when the proposed concept is a genuine foundational prerequisite the anchor's material depends on — a transferable unit of domain knowledge a learner should understand first. 'not_durable' when the proposed concept is tangential to this anchor, merely named in passing, a cross-reference/comparison/aside, or a label dropped without being developed. Judge from the proposed concept's meaning, the anchor's meaning, and the proposal rationale, never from surface wordform or a fixed list. When genuinely unsure, prefer 'durable' because this is a precision-first drop-only veto."),
  rationale: z.string().min(1).describe("One terse sentence explaining why the proposal is durable or not durable for this anchor.")
}).strict();

export const mintingDurabilityJudgmentSchema: JsonSchema = toForcedToolSchema(mintingDurabilityJudgmentValidator);

// --- Node merge adjudication: submit_node_merge_decision (U2, R3/R4) ----------
// The DECIDE half of semantic dedup (AGENTS rule 20). Embedding cosine PROPOSED that
// two same-domain nodes may be near-duplicates; this judge decides whether they are two
// surface forms of the SAME domain concept or genuinely distinct. Decision-only output
// (the proposing score is recorded separately, never re-derived here). Domain-neutral
// rubric — no fixture labels, no lexical patterns (AGENTS rules 16/17). The two sides
// are presented symmetrically with neither privileged; the application stage defaults a
// transport/validation failure to keep_distinct (fail-closed, no merge — R13).

export const nodeMergeAdjudicationValidator = z.object({
  decision: z.enum(["merge", "keep_distinct"]).describe("'merge' ONLY when the two labels denote the SAME underlying unit of domain knowledge — two surface forms of one concept (for example a singular/possessive/abbreviated variant, or a paraphrase that a learner would not study as a separate idea). 'keep_distinct' when they are genuinely different concepts, even if lexically or topically close (a concept and a specialization of it, a part and its whole, two siblings, a general idea and one mechanism within it). Decide from the concepts' MEANING and the cited evidence, never from surface wordform overlap; when unsure, prefer 'keep_distinct' (merging is the irreversible-feeling action that fragments or fuses a learner's graph)."),
  rationale: z.string().min(1).describe("One terse sentence naming what makes the two the same concept or distinct.")
}).strict();

export const nodeMergeAdjudicationSchema: JsonSchema = toForcedToolSchema(nodeMergeAdjudicationValidator);

// --- Option-select generation: submit_option_select_item (U3, R9/R10) -----
// One four-option auto-graded item per node: a grounded correct answer (cited by
// passage id + quote, verified verbatim by the application boundary) plus THREE
// sibling-conditioned distractors that read like real domain answers but are wrong.
// Domain-neutral rubric language only (AGENTS rule 17): the schema names no fixture and
// lists no exemplars. The deterministic guard (U2) enforces structure; this schema only
// enforces SHAPE fail-closed (rule 6) — distractor quality is judged by the rule-14 pass.

export const optionSelectValidator = z.object({
  question: z.string().min(1).describe("One self-contained multiple-choice question about the learning node with a single correct answer. Do not reference 'the passage' or 'the source'."),
  correctAnswer: z.object({
    text: z.string().min(1).describe("The single correct option, grounded strictly in the provided passages."),
    citation: passageCitation
  }).strict(),
  distractors: z.array(z.string().min(1).describe("A plausible but INCORRECT option in the same domain register as the provided neighbor concepts. It must be clearly wrong for this question, never a paraphrase of the correct answer.")).length(3)
}).strict();

export const optionSelectSchema: JsonSchema = toForcedToolSchema(optionSelectValidator);

export const toolValidators = [
  conceptDiscoveryValidator,
  conceptAdmissionValidatorForCandidateKeys(["candidate_a", "candidate_b"]),
  conceptCoreSelectionValidatorForCandidateKeys(["candidate_a", "candidate_b"]),
  conceptEvidenceProfileValidator,
  buildPrerequisiteOrderingValidator(3),
  generatedGroundingBundleValidator,
  missingPrerequisiteProposalValidator,
  intrinsicDifficultyValidator,
  definitionEntailmentJudgmentValidator,
  definitionPassageQualityJudgmentValidator,
  admissionLabelJudgmentValidator,
  rescueDurabilityJudgmentValidator,
  mintingDurabilityJudgmentValidator,
  nodeMergeAdjudicationValidator,
  optionSelectValidator
] as const;
