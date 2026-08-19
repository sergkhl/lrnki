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

// Rescued-Node Canonical Labeling (TODO #1). ONE whole-set call per Declared Domain returns a
// concept-shaped label for EACH of the N listed durable rescued nodes, cited by its 1-based
// number. Schema + validator are built per call from N so the index bounds [1, N] are concrete
// (a drifting index re-prompts once, then the application fails OPEN keeping original labels).
// The description text stays domain-neutral (rule 17): it describes concept-vs-proposition
// wordform, never a fixture concept or expected outcome.
export function buildRescuedNodeLabelingValidator(n: number) {
  return z.object({
    labels: z.array(z.object({
      nodeNumber: z.number().int().min(1).max(n).describe("The 1-based Candidate number (as shown before each candidate) this label is for."),
      conceptLabel: z.string().min(1).describe("A concise concept-shaped canonical label — a noun phrase naming the single durable unit of knowledge the numbered candidate is about. When the candidate's current label reads as a full sentence, proposition, or claim, re-name it to that noun phrase; when it already reads as a concept name, return it unchanged. Name the SAME concept the candidate is about — never introduce a different concept, and never re-use one of the already-named labels listed as taken.")
    }).strict()).describe("Exactly one entry per listed candidate: its number and its concept-shaped canonical label. Cover every listed candidate number once.")
  }).strict();
}

export function buildRescuedNodeLabelingSchema(n: number): JsonSchema {
  return toForcedToolSchema(buildRescuedNodeLabelingValidator(n));
}

// --- Concept-set synthesis: submit_synthesized_concepts (U2, R1/R2) -------
// The source-less analog of Candidate Discovery (plan 2026-06-30-001). ONE forced-tool
// call generates a bounded concept set from a topic + Declared Domain alone; the set is
// generated, not gated for coverage or grain in this build. Domain-neutral rubric
// language only (AGENTS rule 17): the schema names no topic and lists no exemplars.

export const conceptSetSynthesisValidator = z.object({
  concepts: z.array(z.object({
    conceptKey: z.string().min(1).describe("Short stable slug unique within this concept set, e.g. 'topic_x'."),
    canonicalLabel: z.string().min(1).describe("Precise, domain-qualified label naming one durable, independently-teachable concept within the topic."),
    aliases: z.array(z.string().min(1)).describe("Exact alternative surface forms for the same concept; empty when there are none.")
  }).strict()).max(16).describe("At most 16 durable, independently-teachable concepts a learner would study to understand the topic within the Declared Domain. Name concepts, not propositions or claims.")
}).strict();

export const conceptSetSynthesisSchema: JsonSchema = toForcedToolSchema(conceptSetSynthesisValidator);

// --- Knowledge-boundary probe: submit_knowledge_boundary_answer (U2, R6/R7)
// ONE draw of the self-consistency probe (plan 2026-06-30-001, KTD4). A pointed factual
// answer about one concept; the application samples this K times at moderate temperature
// and measures semantic agreement across the `answer` strings with the embedding port to
// route the concept to core_knowledge/boundary (U3). Domain-neutral rubric (rule 17).

export const knowledgeBoundaryProbeValidator = z.object({
  answer: z.string().min(1).describe("A single self-contained factual characterization of the concept as understood in the Declared Domain: its core meaning and the one or two facts most central to it. Concise prose, no hedging or meta-commentary.")
}).strict();

export const knowledgeBoundaryProbeSchema: JsonSchema = toForcedToolSchema(knowledgeBoundaryProbeValidator);

// --- Generated grounding: submit_generated_grounding_bundle ---------------

const generatedGroundingPassage = z.object({
  text: z.string().min(1).describe("Generated explanatory passage for the prerequisite concept. This is not a source quote.")
}).strict();

export const generatedGroundingBundleValidator = z.object({
  definitions: z.array(generatedGroundingPassage).min(1).max(3).describe("Generated meaning-bearing definition passages for the concept. Every passage stands alone, identifies the candidate, and states its defining condition or mechanism before secondary consequences or costs. Prefer 1-2 precise passages; use a third only for a distinct necessary fact."),
  mentions: z.array(generatedGroundingPassage).max(2).describe("Optional generated mention-like passages that add a necessary context relation. Prefer none or one; never add broad curriculum analogies to fill the cap."),
  rationale: z.string().min(1).describe("One terse sentence explaining why this prerequisite scaffolds the provided anchors.")
}).strict();

export const generatedGroundingBundleSchema: JsonSchema = toForcedToolSchema(generatedGroundingBundleValidator);

// --- Positive-claim verification questions: submit_claim_verification_questions ---
// The planner sees code-owned positive claim targets and turns each into one or more
// self-contained, non-leading questions. Runtime refinement proves exact known-target coverage;
// the answer stage later receives only opaque question keys and question text.
export function buildClaimVerificationQuestionPlanningValidator(targetKeys: readonly string[]) {
  const known = new Set(targetKeys);
  return z.object({
    questions: z.array(z.object({
      targetKey: z.string().min(1).describe("The exact code-owned targetKey of the positive claim this question verifies."),
      question: z.string().min(1).describe("One self-contained, non-leading factual question that can be answered without seeing the generated draft.")
    }).strict()).min(targetKeys.length).describe("Claim-targeted verification questions covering every listed target at least once and every independently verifiable atomic claim within it.")
  }).strict().superRefine((value, ctx) => {
    const covered = new Set<string>();
    for (const question of value.questions) {
      if (!known.has(question.targetKey)) {
        ctx.addIssue({ code: "custom", message: `unknown targetKey ${question.targetKey}` });
      }
      covered.add(question.targetKey);
    }
    for (const targetKey of targetKeys) {
      if (!covered.has(targetKey)) ctx.addIssue({ code: "custom", message: `missing verification question for targetKey ${targetKey}` });
    }
  });
}

export const claimVerificationQuestionPlanningValidator = buildClaimVerificationQuestionPlanningValidator(["sentinel:target"]);
export function buildClaimVerificationQuestionPlanningSchema(targetKeys: readonly string[]): JsonSchema {
  return toForcedToolSchema(buildClaimVerificationQuestionPlanningValidator(targetKeys));
}

// --- Positive-claim verification answers: submit_claim_verification_answers ---
// One answer per planned question. The answerer sees no draft, target text, or target key and
// returns only independently generated parametric answers keyed to opaque displayed question keys.
export function buildClaimVerificationAnsweringValidator(questionKeys: readonly string[]) {
  const known = new Set(questionKeys);
  return z.object({
    answers: z.array(z.object({
      questionKey: z.string().min(1).describe("The exact opaque verification-question key as listed."),
      answer: z.string().min(1).describe("A direct, self-contained factual answer from established domain knowledge; state that the answer is uncertain when it cannot be established reliably.")
    }).strict()).length(questionKeys.length).describe("Exactly one independent answer for every listed verification-question key.")
  }).strict().superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const answer of value.answers) {
      if (!known.has(answer.questionKey)) ctx.addIssue({ code: "custom", message: `unknown questionKey ${answer.questionKey}` });
      if (seen.has(answer.questionKey)) ctx.addIssue({ code: "custom", message: `duplicate questionKey ${answer.questionKey}` });
      seen.add(answer.questionKey);
    }
    for (const questionKey of questionKeys) {
      if (!seen.has(questionKey)) ctx.addIssue({ code: "custom", message: `missing questionKey ${questionKey}` });
    }
  });
}

export const claimVerificationAnsweringValidator = buildClaimVerificationAnsweringValidator(["sentinel:q:0"]);
export function buildClaimVerificationAnsweringSchema(questionKeys: readonly string[]): JsonSchema {
  return toForcedToolSchema(buildClaimVerificationAnsweringValidator(questionKeys));
}

// --- Positive-claim factuality judgment: submit_claim_factuality_judgments ---
// One owner-neutral verdict per code-owned target. The result contains no text field and can only
// accept or reject an original target; application code owns artifact-specific settlement.
export function buildClaimFactualityJudgmentValidator(targetKeys: readonly string[]) {
  const known = new Set(targetKeys);
  return z.object({
    judgments: z.array(z.object({
      targetKey: z.string().min(1).describe("The exact code-owned targetKey of the positive claim being judged."),
      disposition: z.enum(["accepted", "rejected"]).describe("Accept only when every atomic factual claim in the target is accurate within the stated concept and Declared Domain."),
      rationale: z.string().min(1).describe("One terse sentence explaining the factual judgment, including any scope distinction or conflict with the independent checks.")
    }).strict()).length(targetKeys.length).describe("Exactly one factuality judgment for every listed positive-claim target.")
  }).strict().superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const judgment of value.judgments) {
      if (!known.has(judgment.targetKey)) ctx.addIssue({ code: "custom", message: `unknown targetKey ${judgment.targetKey}` });
      if (seen.has(judgment.targetKey)) ctx.addIssue({ code: "custom", message: `duplicate targetKey ${judgment.targetKey}` });
      seen.add(judgment.targetKey);
    }
    for (const targetKey of targetKeys) {
      if (!seen.has(targetKey)) ctx.addIssue({ code: "custom", message: `missing targetKey ${targetKey}` });
    }
  });
}

export const claimFactualityJudgmentValidator = buildClaimFactualityJudgmentValidator(["sentinel:target"]);
export function buildClaimFactualityJudgmentSchema(targetKeys: readonly string[]): JsonSchema {
  return toForcedToolSchema(buildClaimFactualityJudgmentValidator(targetKeys));
}

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

// --- Comparative difficulty banding: submit_difficulty_bands --------------
// ONE whole-domain-set banding call (ADR-0024 — comparative banded prior). The model
// bands EVERY listed concept 1–5 RELATIVE to the listed set, citing each by the 1-based
// concept NUMBER shown before it in the prompt — the same closed-set menu-pick idiom as
// submit_prerequisite_ordering. Schema + validator are built per call from the node
// count `n` so exact coverage is concrete: every listed number exactly once, band in
// 1..5. A missing/duplicate/out-of-range number re-prompts once (maxRetries: 1), then
// the intrinsic-difficulty stage fails closed (rule 6). Rubric text stays domain-neutral
// and contains no fixture-derived exemplars (AGENTS rule 17).

export function buildDifficultyBandsValidator(n: number) {
  return z.object({
    bands: z.array(z.object({
      conceptNumber: z.number().int().min(1).max(n).describe("The 1-based Concept number (as shown before each concept) this band applies to. Every listed number must appear exactly once."),
      band: z.number().int().min(1).max(5).describe("Intrinsic difficulty band RELATIVE to the listed concept set: 1 = the most accessible concepts of this set, 5 = the most demanding. Band from the evidence shown, never from how abstract a label sounds."),
      rationale: z.string().min(1).describe("One terse sentence naming the generic difficulty factors, grounded in this concept's shown evidence.")
    }).strict()).length(n).describe("Exactly one band per listed concept, each cited by its listed number.")
  }).strict().superRefine((value, ctx) => {
    const seen = new Set<number>();
    for (const entry of value.bands) {
      if (seen.has(entry.conceptNumber)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bands"], message: `Concept number ${entry.conceptNumber} was banded more than once; band every listed number exactly once.` });
      }
      seen.add(entry.conceptNumber);
    }
  });
}

export function buildDifficultyBandsSchema(n: number): JsonSchema {
  return toForcedToolSchema(buildDifficultyBandsValidator(n));
}

// --- Pairwise difficulty comparison: submit_difficulty_comparison ---------
// Bounded calibration for a CONTESTED band (modal share below the contest threshold):
// one "which is harder to learn" judgment between the contested concept and an
// uncontested anchor concept of a candidate band. At most two comparisons bracket a
// contested concept; the bracket placement lives in the application. Domain-neutral
// rubric (AGENTS rule 17).

export const difficultyComparisonValidator = z.object({
  harder: z.enum(["first", "second"]).describe("'first' when the first listed concept is harder for a learner to master, 'second' when the second is. Judge from the shown evidence and generic difficulty factors (abstraction, technical density, background load, integration burden), never from label phrasing."),
  rationale: z.string().min(1).describe("One terse sentence grounded in the two concepts' shown evidence.")
}).strict();

export const difficultyComparisonSchema: JsonSchema = toForcedToolSchema(difficultyComparisonValidator);

// --- Declared domain inference: submit_declared_domain --------------------
// One bounded learner-generation helper: infer a short field-of-study label from a
// learner's topic phrase. The learner can confirm or edit this before generation.
// The schema stays domain-neutral and contains no fixture-derived examples.

export const declaredDomainInferenceValidator = z.object({
  declaredDomain: z.string().trim().min(1).describe("A short field-of-study label that best frames the learner's topic. Return only the field label, not an explanation.")
}).strict();

export const declaredDomainInferenceSchema: JsonSchema = toForcedToolSchema(declaredDomainInferenceValidator);

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
// source-less grounding admission. The model decides whether the proposed label is a DURABLE
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

// --- Explorable Terms: shared affordance metadata (plan 2026-07-12-002 U1, R1-R3) ------
// A learner may turn an unfamiliar specialized term in the current block into an optional
// support detour. The generator advertises AT MOST FIVE such terms, drawn from the block's
// own final text; a deterministic validator (application `explorableTerms.ts`) then keeps only
// the distinct 1-80-code-point exact substrings that are not the concept label. The schema
// keeps this a REQUIRED array so it closes its object without a trailing nullable (the
// MiMo-fatal shape); an empty array is the correct answer when nothing qualifies. Description
// language is structural only (rule 17) — it names no fixture, domain, or exemplar. `EXPLORE`
// wording is deliberately restrained so the model does not manufacture affordances.
const EXPLORABLE_TERM_GUIDANCE =
  "A specialized word or short phrase that appears verbatim in this block's text, is needed to understand the block, and is NOT the concept being taught here. Copy it exactly as written. Emit only genuinely unfamiliar terms; return an empty array when none qualify and never pad to reach five.";

const itemExplorableTerms = z
  .array(z.string().min(1).max(80).describe(EXPLORABLE_TERM_GUIDANCE))
  .max(5)
  .describe("Zero to five specialized terms from the question above that a learner might need to explore. Each must be copied verbatim from the question text. Prefer fewer; an empty array is expected when the question introduces no unfamiliar term.");

const lessonExplorableTerms = z
  .array(z.object({
    term: z.string().min(1).max(80).describe(EXPLORABLE_TERM_GUIDANCE),
    sectionKind: z.enum(["gist", "intuition", "definition", "examples", "applications", "formulas"]).describe("The kind of the section whose prose text contains this term verbatim.")
  }).strict())
  .max(5)
  .describe("Zero to five specialized terms across the whole lesson that a learner might need to explore, each anchored to the section kind whose text contains it verbatim. Prefer fewer; an empty array is expected when the lesson introduces no unfamiliar term.");

export const optionSelectValidator = z.object({
  question: z.string().min(1).describe("One self-contained multiple-choice question about the learning node with a single correct answer. Do not reference 'the passage' or 'the source'."),
  explanation: z.string().min(1).describe("Short learner-facing rationale explaining why the correct answer follows from the provided grounding. Stay domain-neutral and do not mention tool or source mechanics."),
  correctAnswer: z.object({
    text: z.string().min(1).describe("The single correct option, grounded strictly in the provided passages."),
    citation: passageCitation
  }).strict(),
  distractors: z.array(z.string().min(1).describe("A plausible but INCORRECT option in the same domain register as the provided neighboring topics. It must be clearly wrong for this question, never a paraphrase of the correct answer.")).length(3),
  explorableTerms: itemExplorableTerms
}).strict();

export const optionSelectSchema: JsonSchema = toForcedToolSchema(optionSelectValidator);

// The required `generate` boolean closes the plan object so neither nullable is the
// final property (the MiMo trailing-nullable fatal shape, plan 2026-07-10-004 U3).
export const studyItemBlueprintValidator = z.object({
  typePlans: z.array(z.object({
    itemType: z.enum(["option_select", "matching", "impostor"]),
    facet: z.string().nullable().describe("When generate=true, the distinct assessed facet this item type should test. Null when generate=false."),
    reason: z.string().nullable().describe("When generate=false, a short reason this type should be skipped. Null when generate=true."),
    generate: z.boolean()
  }).strict()).length(3).describe("Exactly one plan for each supported item type.")
}).strict();

export const studyItemBlueprintSchema: JsonSchema = toForcedToolSchema(studyItemBlueprintValidator);

const matchingPair = z.object({
  promptText: z.string().min(1).describe("Left-column prompt: a few words NAMING one distinct aspect of the node — a property, quantity, mechanism, cause, effect, condition, role, or situation — without stating its answer."),
  matchText: z.string().min(1).describe("Right-column match: the content ANSWERING that one aspect and nothing else, in your own compact words. When the answer is a named term, this is that term itself — never a definition, description, or paraphrase of it. Never a restatement, paraphrase, or expansion of its own prompt, and it must not contain the prompt's wording."),
  citation: passageCitation
}).strict();

export const matchingValidator = z.object({
  question: z.string().min(1).describe("One self-contained prompt asking the learner to match each named aspect to the content answering it. It must announce the pairing the pairs actually implement, never a different mapping such as terms to their definitions. Do not reference 'the passage' or 'the source', and do not call anything a 'concept', 'node', 'prerequisite', 'dependent', or 'sibling'."),
  pairs: z.array(matchingPair).min(3).max(4).describe("Three or four prompt-match pairs, each grounded in one provided passage. The set must be mutually exclusive: no match may plausibly answer another pair's prompt, and no prompt may cover another prompt's answer. Every match must also differ from every other match — two aspects with the same answer are the wrong aspects, so replace one rather than padding a repeated answer."),
  explorableTerms: itemExplorableTerms
}).strict();

export const matchingSchema: JsonSchema = toForcedToolSchema(matchingValidator);

// --- Impostor generation: submit_impostor_item (U3, R3/R5/R6/R7) ----------
// One four-statement auto-graded item per node: three TRUE statements (each cited by
// passage id + quote, verified verbatim at the guard) and exactly ONE planted lie.
// The lie is preferentially a true fact about one provided neighbor concept,
// rewritten as if it were about THIS node; when no clean neighbor lie exists, a freshly
// minted plausible misconception. The wire schema is FULLY FLAT — numbered scalar truth
// fields, no nested array, no nullable field. Measured 2026-07-10 against the production
// extractor (MiMo v2.5): a nested `truths` array was intermittently emitted as a
// stringified JSON blob, and a trailing nullable `siblingLabel` truncated generation right
// before the literal `null` (0/8 usable); the flat non-nullable shape passed 10/10.
// (Earlier real-use regeneration had already flattened the truth/lie OBJECTS for the same
// invalid-JSON class on the prior generator.) The adapter immediately rebinds these scalar
// fields into the domain truths array and `lie` object, so the persisted contract is
// unchanged. `siblingLabel` uses the empty string when lieSource is 'generated'.
// Domain-neutral rubric language only (AGENTS rule 17): the schema names no fixture and lists
// no exemplars. The deterministic guard (U4) enforces structure; this schema only enforces
// SHAPE fail-closed (rule 6) — lie validity is judged by the neural cross-family judge.

const impostorTruthFields = (ordinal: "first" | "second" | "third") => ({
  text: z.string().min(1).describe(`The ${ordinal} of three self-contained TRUE statements about the learning node, restating provided grounding.`),
  citationPassageId: z.string().min(1).describe(`The exact passageId of the grounding passage the ${ordinal} true statement restates.`),
  citationEvidenceQuote: z.string().min(1).describe(`A substring copied from that grounding passage supporting the ${ordinal} true statement. For source-grounded passages copy it verbatim.`)
});

export const impostorValidator = z.object({
  question: z.string().min(1).describe("One self-contained prompt asking the learner to pick the false statement among the four. Do not reference 'the passage' or 'the source'."),
  truth1Text: impostorTruthFields("first").text,
  truth1PassageId: impostorTruthFields("first").citationPassageId,
  truth1Quote: impostorTruthFields("first").citationEvidenceQuote,
  truth2Text: impostorTruthFields("second").text,
  truth2PassageId: impostorTruthFields("second").citationPassageId,
  truth2Quote: impostorTruthFields("second").citationEvidenceQuote,
  truth3Text: impostorTruthFields("third").text,
  truth3PassageId: impostorTruthFields("third").citationPassageId,
  truth3Quote: impostorTruthFields("third").citationEvidenceQuote,
  lieText: z.string().min(1).describe("The single planted lie: a statement that reads plausibly true of the learning node but is false for that node."),
  reveal: z.string().min(1).describe("Post-answer explanation naming why the lie is false. When the lie is a fact mis-attributed from a neighboring topic, state that it is actually true of that named topic."),
  lieSource: z.enum(["sibling", "generated"]).describe("'sibling' when the lie is a true fact about one provided neighboring topic rewritten as if about this node. 'generated' when no clean neighboring-topic lie existed and the lie is a freshly minted plausible misconception."),
  siblingLabel: z.string().describe("When lieSource is 'sibling', the exact label of the neighboring topic the lie was drawn from; when lieSource is 'generated', the empty string."),
  explorableTerms: itemExplorableTerms
}).strict();

export const impostorSchema: JsonSchema = toForcedToolSchema(impostorValidator);

// --- Study Item key verification: submit_study_item_key_verification
// Cross-family semantic judgment over EVERY candidate answer of one guarded item, after the
// deterministic grounding checks pass. It answers, per candidate, whether the claim is true
// of the learning node — never which candidate the item keys, which is the application's
// deterministic uniqueness rule to enforce over these verdicts. The array shape mirrors the
// redundancy judgment's: one verdict per numbered candidate, echoed back by ordinal so a
// reordered or short response cannot be silently misaligned by position.

export const studyItemKeyVerificationValidator = z.object({
  verdicts: z.array(z.object({
    ordinal: z.number().int().describe("The candidate's number, exactly as listed in the prompt."),
    verdict: z.enum(["claim_true", "claim_false", "unclear"]).describe("'claim_true' when the candidate is a correct claim about the learning node. 'claim_false' when it is incorrect for that node. 'unclear' when it cannot be decided from the provided context and general knowledge of the declared domain."),
    reason: z.string().min(1).describe("One terse justification for this candidate, grounded in the node context, the other candidates, the grounding passages, and the sibling labels.")
  }).strict())
}).strict();

export const studyItemKeyVerificationSchema: JsonSchema = toForcedToolSchema(studyItemKeyVerificationValidator);

// --- Matching Assignment Verification: submit_matching_assignment_verification
// Cross-family semantic judgment over the FULL N×N grid of one guarded matching item, after the
// deterministic guard passes. It answers, per (prompt, match) cell, whether that match is a
// defensible answer to that prompt — never which pairing the item keys, which is the
// application's deterministic uniqueness rule to enforce over these verdicts.
//
// The grid, rather than a per-prompt list of fitting matches, is deliberate on two counts: it
// also exposes a MIS-KEYED pair (a keyed cell judged not to fit), and sparse-list outputs are the
// shape this generator family has historically fumbled — see the flat-impostor schema note above.
// Both ordinals are echoed back so a reordered or short response cannot be silently misaligned by
// position, and a cell the judge omits is read as `unclear`.

export const matchingAssignmentVerificationValidator = z.object({
  verdicts: z.array(z.object({
    promptOrdinal: z.number().int().describe("The prompt's number, exactly as listed in the prompt list."),
    matchOrdinal: z.number().int().describe("The match's number, exactly as listed in the match list. The two numberings are independent and equal numbers mean nothing."),
    verdict: z.enum(["fits", "does_not_fit", "unclear"]).describe("'fits' when a learner who knows the subject matter could defensibly answer this prompt with this match. 'does_not_fit' when that pairing is wrong or answers a different aspect than the prompt names. 'unclear' when it cannot be decided from the provided context and general knowledge of the declared domain."),
    reason: z.string().min(1).describe("One terse justification for this pairing, grounded in the node context, the grounding passages, and the neighboring topics.")
  }).strict())
}).strict();

export const matchingAssignmentVerificationSchema: JsonSchema = toForcedToolSchema(matchingAssignmentVerificationValidator);

// --- Concept Lesson redundancy judgment: submit_concept_lesson_redundancy_judgment

export const conceptLessonRedundancyJudgmentValidator = z.object({
  judgments: z.array(z.object({
    sectionKind: z.enum(["gist", "intuition", "definition", "examples", "applications", "formulas"]),
    verdict: z.enum(["distinct", "redundant"]),
    redundantWith: z.string().nullable().describe("The kind this section repeats when verdict is redundant; null when verdict is distinct."),
    reason: z.string().min(1)
  }).strict())
}).strict();

export const conceptLessonRedundancyJudgmentSchema: JsonSchema = toForcedToolSchema(conceptLessonRedundancyJudgmentValidator);

// --- Concept Lesson generation: submit_concept_lesson (U2, R2/R4/R6/R7/R14) -----
// One ordered teaching artifact per learning node (ADR-0031). Every section is
// INDEPENDENTLY OPTIONAL: a section that does not apply is simply OMITTED from the
// array — never a placeholder (R3/R4). The schema therefore assumes no section is
// mandatory; the minimum-validity rule is enforced at the assembly boundary (U6), not
// here. Section descriptions name only structural ROLES (an advance organizer, a
// concrete intuition, graph-neighbor-bridging applications) and no fixture concept or
// domain (AGENTS rule 17). Citation + diagram are flattened to nullable scalars because
// the forced-tool dialect folds only scalar nullables; a section's source grounding is
// re-verified verbatim at the boundary, so a null citation simply marks a synthesized
// section. The deterministic guard never trusts the model's claimed provenance.

export const CONCEPT_LESSON_SECTION_TEXT_MAX_LENGTH = 600;

// Property order matters on MiMo: its constrained decoder truncates arguments before
// a trailing literal null (the proven-fatal shape, plan 2026-07-10-004 U3), so the
// required `items` array closes the object and every nullable sits mid-object. The
// mimoDescriptorShape congruence test enforces this mechanically.
const conceptLessonSection = z.object({
  kind: z.enum(["gist", "intuition", "definition", "examples", "applications", "formulas"]).describe("Which part of the teaching arc this section is. Across the lesson, order them: a one-line framing hook stating the core idea or the problem the concept solves, never a restatement of the definition; a concrete intuition before any formal statement; the precise definition or notation; worked examples; how it connects to the neighboring topics a learner meets before it, studies after it, or studies alongside it, written as subject matter and never as relationship labels; then any formal methods or formulas. Emit a section ONLY when the provided grounding supports it; never assume a section applies."),
  text: z.string().min(1).max(CONCEPT_LESSON_SECTION_TEXT_MAX_LENGTH).describe("The teaching prose for this section. Self-contained, compact, and readable on its own; do not reference 'the passage' or 'the source'."),
  citationPassageId: z.string().nullable().describe("The exact passageId of the provided grounding passage this section restates, when the section conveys source-supported content; null when the section is synthesized."),
  citationEvidenceQuote: z.string().nullable().describe("A substring copied from that grounding passage supporting this section. For source-grounded passages, copy it verbatim; null when the section is synthesized."),
  diagramCaption: z.string().nullable().describe("Optional one-line caption for a simple explanatory diagram for this section; null when there is none."),
  diagramSpec: z.string().nullable().describe("Optional terse, renderer-neutral description of that diagram's structure (nodes and relationships); null when there is none."),
  items: z.array(z.string().min(1).max(280)).max(4).describe("List items for examples/applications sections only. Use 2-4 items for examples or applications; otherwise use an empty array.")
}).strict();

export const conceptLessonValidator = z.object({
  sections: z.array(conceptLessonSection).describe("The ordered teaching sections for one learning node. Include only the sections the provided grounding supports — omit any section that does not apply rather than emitting a placeholder."),
  explorableTerms: lessonExplorableTerms
}).strict();

export const conceptLessonSchema: JsonSchema = toForcedToolSchema(conceptLessonValidator);

// --- Layer purpose: submit_layer_purpose ------------------------------------

export const layerPurposeValidator = z.object({
  purpose: z.string().min(1).describe("1-2 plain sentences stating what mastering this layer's concepts together enables a learner to do or understand. Under 240 characters. Plain register — no game or journey metaphors.")
}).strict();

export const layerPurposeSchema: JsonSchema = toForcedToolSchema(layerPurposeValidator);

// --- Discovery-coverage audit: submit_discovery_coverage_audit ---------------
// Measurement stage (plan 2026-07-10-004 U1): the cross-family judge reports the
// standalone learning objectives an extraction run's admitted set fails to preserve.
// An empty `misses` list is the well-formed "coverage is sufficient" answer. Runs on
// kg-independent-judge, not the extractor alias, so a trailing nullable would be harmless — but every field
// is required prose anyway.

export const discoveryCoverageAuditValidator = z.object({
  misses: z.array(z.object({
    missedObjective: z.string().min(1).describe("Concise concept-shaped name of the standalone learning objective the admitted set fails to preserve."),
    sourceGrounding: z.string().min(1).describe("Short verbatim quote or tight paraphrase of the source passage that teaches this objective substantively."),
    whyStandalone: z.string().min(1).describe("One sentence on why this is a durable standalone learning objective rather than a facet, illustration, or rephrasing of an admitted concept.")
  }).strict()).describe("Every principal standalone learning objective the admitted set misses; empty when coverage is sufficient.")
}).strict();

export const discoveryCoverageAuditSchema: JsonSchema = toForcedToolSchema(discoveryCoverageAuditValidator);

// --- Scaffold-content congruence audit: submit_scaffold_content_congruence (plan 2026-07-16-001) ---
// ONE sample of the cross-family judge over ONE generated Support Step (KTD3): does the content
// teach its named step label, and is it a genuinely simpler prerequisite of the term? Runs on
// kg-independent-judge, not the generator, so the generator never grades itself.
// Every field is required prose/boolean so the object closes without a trailing nullable.
export const scaffoldContentCongruenceValidator = z.object({
  teachesStepLabel: z.boolean().describe("True if the micro-lesson, question, and options actually teach the named step label; false if the content is about something else (a label↔content mismatch)."),
  isSimplerPrerequisite: z.boolean().describe("True if the taught content is a genuinely simpler prerequisite that helps reach the term — not the term itself, and not the parent concept."),
  rationale: z.string().min(1).describe("One or two sentences grounding both judgments in the specific content shown.")
}).strict();

export const scaffoldContentCongruenceSchema: JsonSchema = toForcedToolSchema(scaffoldContentCongruenceValidator);

// --- Learner-Scoped Scaffold outline: submit_scaffold_outline (plan 2026-07-12-002 U3) ---
// Proposes the smallest useful ordered set of STRICTLY-SIMPLER prerequisite sub-concepts a
// learner needs before the target term. Exact reuse of existing nodes is resolved by the
// application BEFORE and AFTER this call; this schema only asks for candidate lower-level
// concepts. Domain-neutral (rule 17): no fixture, no exemplar. Every field is required so the
// object closes without a trailing nullable (MiMo-fatal shape).
export const scaffoldOutlineValidator = z.object({
  steps: z.array(z.object({
    label: z.string().min(1).max(80).describe("A concise name for ONE prerequisite sub-concept that is strictly simpler than the target term and needed to understand it."),
    rationale: z.string().min(1).describe("One terse sentence on why this sub-concept is a necessary, lower-level building block for understanding the target term.")
  }).strict()).min(1).max(3).describe("The smallest useful ordered set of one to three strictly-simpler prerequisite sub-concepts. Order them easiest-first. Do NOT pad to three — propose only genuinely necessary lower-level steps.")
}).strict();

export const scaffoldOutlineSchema: JsonSchema = toForcedToolSchema(scaffoldOutlineValidator);

// --- Learner-Scoped Scaffold content: submit_scaffold_content (plan 2026-07-12-002 U3) ---
// Generates a compact micro-lesson (one concrete example) plus one four-option recall item for
// ONE approved lower-level sub-concept, from provided grounding. Content is ALWAYS labeled
// generated and carries NO citations (KTD10); the only invariants carried from the neutral
// pipeline are the four-option one-correct shape and never presenting text as a source quote.
// The required `distractors` array closes the object (no trailing nullable).
export const scaffoldContentValidator = z.object({
  microLesson: z.string().min(1).max(1200).describe("A compact, plain-language explanation of the sub-concept WITH one concrete example, written for a learner who does not yet know it. Self-contained; never reference 'the passage' or 'the source'."),
  question: z.string().min(1).describe("One self-contained recall question about the sub-concept with a single correct answer."),
  explanation: z.string().min(1).describe("Short learner-facing rationale for why the correct answer is right."),
  correctAnswer: z.string().min(1).describe("The single correct option."),
  distractors: z.array(z.string().min(1).describe("A plausible but INCORRECT option, clearly wrong and never a paraphrase of the correct answer.")).length(3)
}).strict();

export const scaffoldContentSchema: JsonSchema = toForcedToolSchema(scaffoldContentValidator);

export const toolValidators = [
  scaffoldOutlineValidator,
  scaffoldContentValidator,
  layerPurposeValidator,
  discoveryCoverageAuditValidator,
  scaffoldContentCongruenceValidator,
  conceptDiscoveryValidator,
  conceptAdmissionValidatorForCandidateKeys(["candidate_a", "candidate_b"]),
  conceptCoreSelectionValidatorForCandidateKeys(["candidate_a", "candidate_b"]),
  conceptEvidenceProfileValidator,
  buildPrerequisiteOrderingValidator(3),
  buildRescuedNodeLabelingValidator(3),
  conceptSetSynthesisValidator,
  knowledgeBoundaryProbeValidator,
  generatedGroundingBundleValidator,
  claimVerificationQuestionPlanningValidator,
  claimVerificationAnsweringValidator,
  claimFactualityJudgmentValidator,
  missingPrerequisiteProposalValidator,
  buildDifficultyBandsValidator(3),
  difficultyComparisonValidator,
  definitionEntailmentJudgmentValidator,
  definitionPassageQualityJudgmentValidator,
  admissionLabelJudgmentValidator,
  rescueDurabilityJudgmentValidator,
  mintingDurabilityJudgmentValidator,
  nodeMergeAdjudicationValidator,
  optionSelectValidator,
  studyItemBlueprintValidator,
  matchingValidator,
  impostorValidator,
  studyItemKeyVerificationValidator,
  matchingAssignmentVerificationValidator,
  conceptLessonRedundancyJudgmentValidator,
  conceptLessonValidator
] as const;
