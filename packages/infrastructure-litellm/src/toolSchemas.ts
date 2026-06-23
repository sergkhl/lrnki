import { z } from "zod";
import type { JsonSchema } from "./LiteLlmForcedToolClient";

// Forced named tool schemas (ADR-0006). strict:true requires every property in
// `required` with additionalProperties:false; optionals are modelled as nullable.
// All tool arguments are re-validated here with zod and fail closed (AGENTS rule 6).

const blockEvidenceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["blockId", "evidenceQuote"],
  properties: {
    blockId: { type: "string", description: "Exact block id the quote is taken from, e.g. 'block-12'." },
    evidenceQuote: { type: "string", description: "Verbatim substring copied from that block's text." }
  }
};

// --- Candidate Discovery: submit_concept_candidates ------------------------

export const conceptDiscoverySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateKey", "canonicalLabel", "mentions"],
        properties: {
          candidateKey: { type: "string", description: "Short stable slug unique within this document, e.g. 'topic_x'." },
          canonicalLabel: { type: "string" },
          mentions: { type: "array", items: blockEvidenceSchema }
        }
      }
    }
  }
};

export const conceptDiscoveryValidator = z.object({
  candidates: z.array(z.object({
    candidateKey: z.string().min(1),
    canonicalLabel: z.string().min(1),
    mentions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict())
  }).strict())
}).strict();

// --- Concept Admission: submit_admission_decisions ------------------------

const admissionCriterionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "rationale", "evidence"],
  properties: {
    passed: { type: "boolean" },
    rationale: { type: "string" },
    // Soft tidiness bound, not a correctness gate. `strict` forced-tool mode does not
    // enforce maxItems at generation time, so the boundary validator must TOLERATE a
    // benign over-count (a model returning 3 quotes must not abort the whole run); the
    // application only needs >=1 verified quote. Capped generously so a runaway array
    // still fails closed (rule 6).
    evidence: { type: "array", maxItems: 4, items: blockEvidenceSchema }
  }
};

const organizingPowerAspectSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "nature", "evidence"],
  properties: {
    summary: { type: "string" },
    nature: {
      type: "string",
      enum: [
        "definition-or-property",
        "mechanism",
        "structural-relationship",
        "contrast",
        "constraint",
        "causal-or-limiting",
        "empirical-evidence",
        "motivation-or-example"
      ]
    },
    evidence: blockEvidenceSchema
  }
};

export function conceptAdmissionSchemaForCandidateKeys(parentCandidateKeys?: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["decisions"],
    properties: {
      decisions: {
        type: "array",
        // No maxItems: one discovered Candidate may be split into several atomic
        // proposals (R13), so decisions can exceed the candidate count.
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "parentCandidateKey",
            "atomicKey",
            "proposedCanonicalLabel",
            "tier",
            "sourceRole",
            "standaloneLearningObjective",
            "establishedDomainMeaning",
            "definitionBearingTreatment",
            "organizingPower",
            "reasonCodes",
            "confidence"
          ],
          properties: {
            parentCandidateKey: {
              type: "string",
              description: "The discovered candidateKey this atomic concept was split from.",
              ...(parentCandidateKeys ? { enum: parentCandidateKeys } : {})
            },
            atomicKey: {
              type: "string",
              description: "Run-local key for this ATOMIC concept, unique across all decisions. Use the parentCandidateKey verbatim when the candidate names exactly one concept; append a distinct suffix per atom when splitting a conflated candidate (e.g. 'a_and_b__a', 'a_and_b__b')."
            },
            proposedCanonicalLabel: {
              type: "string",
              description: "Precise domain-qualified label for this single atomic concept. Keep the discovered label when it is already precise and atomic."
            },
            tier: { type: "string", enum: ["core", "optional", "reject", "quarantine"] },
            sourceRole: {
              type: "string",
              enum: ["declared_domain_concept", "out_of_domain_illustration"],
              description: "'declared_domain_concept' when this is a genuine concept of the Declared Domain that the source teaches. 'out_of_domain_illustration' when it belongs to another domain and appears ONLY as example, sample, benchmark, or evaluation material for this source; such material is rejected, never kept optional."
            },
            standaloneLearningObjective: admissionCriterionSchema,
            establishedDomainMeaning: admissionCriterionSchema,
            definitionBearingTreatment: {
              ...admissionCriterionSchema,
              description:
                "passed=true only when the source gives this concept DEFINITION-BEARING treatment: a passage that establishes what the concept means — its defining properties, the criteria that distinguish it, or how it is constituted — as opposed to a bare mention, an example, or a passing reference. The evidence MUST be the verbatim passage that establishes the meaning. A definition need not use a copula or an 'X is Y' phrasing; meaning can be established by description, mechanism, or contrast. If the source only names or uses the concept without establishing its meaning, set passed=false."
            },
            organizingPower: {
              type: "object",
              additionalProperties: false,
              required: ["passed", "rationale", "aspects"],
              properties: {
                passed: { type: "boolean" },
                rationale: { type: "string" },
                aspects: { type: "array", maxItems: 3, items: organizingPowerAspectSchema }
              }
            },
            reasonCodes: { type: "array", items: { type: "string" } },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          }
        }
      }
    }
  };
}

export const conceptAdmissionSchema = conceptAdmissionSchemaForCandidateKeys();

export const conceptAdmissionValidator = z.object({
  decisions: z.array(z.object({
    parentCandidateKey: z.string().min(1),
    atomicKey: z.string().min(1),
    proposedCanonicalLabel: z.string().min(1),
    tier: z.enum(["core", "optional", "reject", "quarantine"]),
    sourceRole: z.enum(["declared_domain_concept", "out_of_domain_illustration"]),
    standaloneLearningObjective: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(4)
    }).strict(),
    establishedDomainMeaning: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(4)
    }).strict(),
    definitionBearingTreatment: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(4)
    }).strict(),
    organizingPower: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      aspects: z.array(z.object({
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
        evidence: z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()
      }).strict()).max(3)
    }).strict(),
    reasonCodes: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  }).strict())
}).strict();

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

export function conceptCoreSelectionSchemaForCandidateKeys(candidateKeys: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["selections"],
    properties: {
      selections: {
        type: "array",
        maxItems: candidateKeys.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["candidateKey", "selected", "canonicalLabel", "reasonCode"],
          properties: {
            candidateKey: { type: "string", enum: candidateKeys },
            selected: { type: "boolean" },
            canonicalLabel: {
              type: "string",
              description: "Final precise, domain-qualified label. Preserve the individually proposed label when already precise."
            },
            reasonCode: { type: "string", enum: [...CORE_SELECTION_REASON_CODES] }
          }
        }
      }
    }
  };
}

export const conceptCoreSelectionValidator = z.object({
  selections: z.array(z.object({
    candidateKey: z.string().min(1),
    selected: z.boolean(),
    canonicalLabel: z.string().min(1),
    reasonCode: z.enum(CORE_SELECTION_REASON_CODES)
  }).strict())
}).strict();

// --- CEP Extraction: submit_concept_evidence_profile ----------------------
// One Concept Evidence Profile for the subject Concept: meaning-bearing definition
// passages, salience-ordered mention passages, and zero or more optional `defines`
// assertions. Every concept-to-concept relationship is an untyped mention passage.

const optionalTypedAssertionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "objectKind", "literalValue", "evidence"],
  properties: {
    type: {
      type: "string",
      enum: ["defines"],
      description: "'defines' = the evidence defines the subject (objectKind=literal, literalValue set)."
    },
    objectKind: { type: "string", enum: ["literal"] },
    literalValue: { type: ["string", "null"], description: "A faithful, concise definition grounded in the evidence quote." },
    evidence: { type: "array", items: blockEvidenceSchema }
  }
};

export const conceptEvidenceProfileSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["definitions", "mentions", "assertions"],
  properties: {
    definitions: {
      type: "array",
      description: "Verbatim passages that establish the subject concept's meaning. Need NOT use a literal 'X is Y' form, but each must be a meaning-bearing quote. At least one is required.",
      items: blockEvidenceSchema
    },
    mentions: {
      type: "array",
      description: "Verbatim passages where the source substantively teaches, applies, relates, or constrains the subject concept (taxonomy, structure, contrast, employment, mechanism). ORDER THEM from most to least useful for understanding the concept and its prerequisites; the application keeps the first few.",
      items: blockEvidenceSchema
    },
    assertions: {
      type: "array",
      description: "Optional `defines` assertions. Emit only when the evidence explicitly supports a definition literal. Everything else belongs in mentions.",
      items: optionalTypedAssertionSchema
    }
  }
};

export const conceptEvidenceProfileValidator = z.object({
  definitions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()),
  mentions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()),
  assertions: z.array(z.object({
    type: z.enum(["defines"]),
    objectKind: z.enum(["literal"]),
    literalValue: z.string().nullable(),
    evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict())
  }).strict())
}).strict();

// --- Batched prerequisite judgment: submit_prerequisite_judgments ---------
// One bounded BATCHED judgment over a subject concept and a list of same-domain
// candidates (ADR-0019 amended, plan U4/KTD1). For each candidate the model returns a
// DIRECTION between the subject and that candidate, not free-form edges; the
// application boundary maps each to a directed/none/uncertain edge fail-closed.

const PREREQUISITE_RELATION = ["prerequisite", "none", "uncertain"] as const;

// The judge NAMES the prerequisite concept rather than emitting a positional
// 'subject-is-prerequisite-of-candidate' token. A real run showed the model reasons
// correctly but systematically anchors a positional token on one side, producing edges
// that contradict their own rationale. Copying the verbatim label of the concept that
// must be understood FIRST removes the positional mapping the model gets wrong; the
// application matches the label against the subject and the named candidate and fails
// closed to 'uncertain' (flagged, path-excluded) when it names neither — never a guess.
// Each result identifies its candidate by `candidateRef` = the candidate's verbatim
// canonical label (unique within a same-domain batch under ADR-0015 dedup); a
// candidateRef matching no provided candidate is dropped fail-closed, never guessed.
export const batchedPrerequisiteJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relations"],
  properties: {
    relations: {
      type: "array",
      description:
        "One judgment per candidate concept: the learning-prerequisite direction between the SUBJECT concept and that candidate. Include every provided candidate exactly once.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateRef", "relation", "prerequisiteLabel", "confidence", "rationale"],
        properties: {
          candidateRef: {
            type: "string",
            description: "The EXACT canonical label (copied verbatim) of the candidate concept this judgment is about. Must equal one of the provided candidate labels."
          },
          relation: {
            type: "string",
            enum: [...PREREQUISITE_RELATION],
            description:
              "'prerequisite' when one of the subject/candidate must be understood before the other; 'none' when neither is a learning prerequisite of the other; 'uncertain' when a relation is plausible but the evidence does not establish a clear direction."
          },
          prerequisiteLabel: {
            type: "string",
            description:
              "When relation='prerequisite', the EXACT canonical label (copied verbatim) of the concept that must be understood FIRST. It must equal either the subject label or this candidate's label. Empty string for 'none' or 'uncertain'."
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string", description: "One terse sentence grounded in the concept meanings and evidence." }
        }
      }
    }
  }
};

export const batchedPrerequisiteJudgmentValidator = z.object({
  relations: z.array(z.object({
    candidateRef: z.string().min(1),
    relation: z.enum(PREREQUISITE_RELATION),
    prerequisiteLabel: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1)
  }).strict())
}).strict();

// --- Generated grounding: submit_generated_grounding_bundle ---------------

const generatedGroundingPassageSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: {
      type: "string",
      description: "Generated explanatory passage for the prerequisite concept. This is not a source quote."
    }
  }
};

export const generatedGroundingBundleSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["definitions", "mentions", "rationale"],
  properties: {
    definitions: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      description: "Generated meaning-bearing definition passages for the prerequisite concept.",
      items: generatedGroundingPassageSchema
    },
    mentions: {
      type: "array",
      maxItems: 4,
      description: "Generated mention-like passages that connect the prerequisite concept to the scaffolded anchors.",
      items: generatedGroundingPassageSchema
    },
    rationale: {
      type: "string",
      description: "One terse sentence explaining why this prerequisite scaffolds the provided anchors."
    }
  }
};

export const generatedGroundingBundleValidator = z.object({
  definitions: z.array(z.object({ text: z.string().min(1) }).strict()).min(1).max(2),
  mentions: z.array(z.object({ text: z.string().min(1) }).strict()).max(4),
  rationale: z.string().min(1)
}).strict();

// --- Missing-prerequisite proposal: submit_missing_prerequisites ----------
// The explicit, inspectable node-IDENTITY operation (R7, KTD6, handoff): for one
// anchor, propose prerequisite concepts the source assumes but never teaches. The
// model returns LABELS only — grounding is generated separately — so this stays a
// bounded proposal, not free-form node construction. The application dedupes against
// existing node labels and enforces the per-anchor / per-run caps.

export const missingPrerequisiteProposalSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      description:
        "Prerequisite concepts a learner must understand BEFORE the anchor concept but that the source assumes rather than teaches. Domain-general established concepts only; omit anything the anchor's own evidence already explains. Return an empty array when nothing is assumed.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["proposedLabel", "rationale"],
        properties: {
          proposedLabel: {
            type: "string",
            description: "Precise, domain-qualified label for one assumed-prior concept. Not the anchor itself and not already listed among the existing node labels."
          },
          rationale: {
            type: "string",
            description: "One terse sentence: why a learner must understand this before the anchor."
          }
        }
      }
    }
  }
};

export const missingPrerequisiteProposalValidator = z.object({
  proposals: z.array(z.object({
    proposedLabel: z.string().min(1),
    rationale: z.string().min(1)
  }).strict())
}).strict();

// --- Intrinsic difficulty judgment: submit_intrinsic_difficulty ----------
// One bounded learner-neutral difficulty judgment over a derived node's evidence.
// The score is later fused with deterministic graph/evidence components; this
// schema captures only the neural subscore and a short rationale. The rubric text
// stays domain-neutral and contains no fixture-derived exemplars (AGENTS rule 17).

export const intrinsicDifficultySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["neuralScore", "rationale"],
  properties: {
    neuralScore: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "Learner-neutral intrinsic difficulty in [0,1], based on abstraction level, technical density, implied background load, and how much the evidence requires integrating multiple ideas."
    },
    rationale: {
      type: "string",
      description: "One terse sentence explaining the generic difficulty factors that drove the score."
    }
  }
};

export const intrinsicDifficultyValidator = z.object({
  neuralScore: z.number().min(0).max(1),
  rationale: z.string().min(1)
}).strict();

export const definitionEntailmentJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subjectMatch", "subjectSpan", "definitionEntailed", "entailingSpan", "rationale"],
  properties: {
    subjectMatch: {
      type: "string",
      enum: ["exact_or_interchangeable", "qualified_variant", "different_or_absent"]
    },
    subjectSpan: {
      type: "string",
      description: "Minimal exact sub-quote that identifies the subject; empty when different or absent."
    },
    definitionEntailed: { type: "boolean" },
    entailingSpan: {
      type: "string",
      description: "Minimal exact sub-quote that states the candidate definition; empty when unsupported."
    },
    rationale: { type: "string" }
  }
};

export const definitionEntailmentJudgmentValidator = z.object({
  subjectMatch: z.enum(["exact_or_interchangeable", "qualified_variant", "different_or_absent"]),
  subjectSpan: z.string(),
  definitionEntailed: z.boolean(),
  entailingSpan: z.string(),
  rationale: z.string().min(1)
}).strict();

// --- Admission label judgment: submit_admission_label_judgment ------------
// One bounded judgment over a single admitted-`core` label (ADR-0005). The model
// decides whether the label NAMES a concept or ASSERTS a proposition/claim about
// one, and (when a proposition) names the underlying noun phrase it reduces to.
// `groundingSpan` is the minimal verbatim sub-quote that shows the predication;
// the application boundary fails closed to `concept` when the span or the noun
// phrase is not source-grounded, so the judge cannot demote on absent text.

export const admissionLabelJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["labelKind", "underlyingNounPhrase", "groundingSpan", "rationale"],
  properties: {
    labelKind: {
      type: "string",
      enum: ["concept", "proposition_or_claim"],
      description:
        "'concept' when the label is a noun phrase naming a durable unit of domain knowledge (even a long multi-word one). 'proposition_or_claim' ONLY when the label asserts a full predication about a concept — a subject + relation + object statement such as '<Subject> as <Claimed Role>' or '<Subject> limited by <Constraint>'. A long nominal label is still a concept."
    },
    underlyingNounPhrase: {
      type: "string",
      description:
        "When proposition_or_claim, the noun-phrase concept the label reduces to (for example '<Subject>' from '<Subject> as <Claimed Role>'), copied verbatim from the label/evidence. Empty string when labelKind is concept."
    },
    groundingSpan: {
      type: "string",
      description:
        "When proposition_or_claim, the minimal verbatim sub-quote (copied exactly from one provided evidence quote) showing the label asserts a predication. Empty string when labelKind is concept."
    },
    rationale: { type: "string", description: "One terse sentence." }
  }
};

export const admissionLabelJudgmentValidator = z.object({
  labelKind: z.enum(["concept", "proposition_or_claim"]),
  underlyingNounPhrase: z.string(),
  groundingSpan: z.string(),
  rationale: z.string().min(1)
}).strict();

// --- Rescue durability judgment: submit_rescue_durability_judgment ----------
// One bounded judgment over a single aggregated `source_mentioned` rescue candidate
// (U3). The model decides whether the candidate is a DURABLE prerequisite a learner
// must grasp before the same-domain anchors it would scaffold, or an incidental
// artifact. `groundingSpan` is the minimal verbatim sub-quote (from the candidate's
// own mention evidence) a `not_durable` veto rests on; the application boundary keeps
// the node fail-open when the span is not grounded, so the judge cannot drop on
// absent text. Domain-neutral rubric — no fixture-specific labels (AGENTS rule 17).

export const rescueDurabilityJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "groundingSpan", "rationale"],
  properties: {
    verdict: {
      type: "string",
      enum: ["durable", "not_durable"],
      description:
        "'durable' when the candidate names a concept a learner would genuinely need to understand before the anchor concepts — a real, transferable unit of domain knowledge that scaffolds them. 'not_durable' when it is an incidental artifact rather than a durable prerequisite: a label specific to one method, system, experiment, dataset, or ablation; a pedagogical-role or section label; a passing or source-local detail that a learner does not need as a standalone prerequisite. Judge by the candidate's meaning and its relationship to the anchors, never by surface wordform. When genuinely unsure, prefer 'durable' (precision-first veto: only drop on a clear, evidenced non-durable judgment)."
    },
    groundingSpan: {
      type: "string",
      description:
        "When verdict is 'not_durable', the minimal verbatim sub-quote — copied exactly from one of the candidate's own mention quotes — that shows it is an incidental artifact rather than a durable prerequisite. Empty string when verdict is 'durable'."
    },
    rationale: { type: "string", description: "One terse sentence." }
  }
};

export const rescueDurabilityJudgmentValidator = z.object({
  verdict: z.enum(["durable", "not_durable"]),
  groundingSpan: z.string(),
  rationale: z.string().min(1)
}).strict();

// --- Minting durability judgment: submit_minting_durability_judgment -------
// One bounded judgment over a single proposed assumed-prerequisite label before
// grounding generation. The model decides whether the proposed label is a DURABLE
// prerequisite for the anchor or merely tangential/named in passing. Decision-only:
// there is no generated-node source span to ground against, so the application stage
// owns drop-only fail-open semantics. Domain-neutral rubric — no fixture-specific
// labels, lexical lists, or surface patterns (AGENTS rules 16/17).

export const mintingDurabilityJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rationale"],
  properties: {
    verdict: {
      type: "string",
      enum: ["durable", "not_durable"],
      description:
        "'durable' when the proposed concept is a genuine foundational prerequisite the anchor's material depends on — a transferable unit of domain knowledge a learner should understand first. 'not_durable' when the proposed concept is tangential to this anchor, merely named in passing, a cross-reference/comparison/aside, or a label dropped without being developed. Judge from the proposed concept's meaning, the anchor's meaning, and the proposal rationale, never from surface wordform or a fixed list. When genuinely unsure, prefer 'durable' because this is a precision-first drop-only veto."
    },
    rationale: { type: "string", description: "One terse sentence explaining why the proposal is durable or not durable for this anchor." }
  }
};

export const mintingDurabilityJudgmentValidator = z.object({
  verdict: z.enum(["durable", "not_durable"]),
  rationale: z.string().min(1)
}).strict();

// --- Node merge adjudication: submit_node_merge_decision (U2, R3/R4) ----------
// The DECIDE half of semantic dedup (AGENTS rule 20). Embedding cosine PROPOSED that
// two same-domain nodes may be near-duplicates; this judge decides whether they are two
// surface forms of the SAME domain concept or genuinely distinct. Decision-only output
// (the proposing score is recorded separately, never re-derived here). Domain-neutral
// rubric — no fixture labels, no lexical patterns (AGENTS rules 16/17). The two sides
// are presented symmetrically with neither privileged; the application stage defaults a
// transport/validation failure to keep_distinct (fail-closed, no merge — R13).
export const nodeMergeAdjudicationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "rationale"],
  properties: {
    decision: {
      type: "string",
      enum: ["merge", "keep_distinct"],
      description:
        "'merge' ONLY when the two labels denote the SAME underlying unit of domain knowledge — two surface forms of one concept (for example a singular/possessive/abbreviated variant, or a paraphrase that a learner would not study as a separate idea). 'keep_distinct' when they are genuinely different concepts, even if lexically or topically close (a concept and a specialization of it, a part and its whole, two siblings, a general idea and one mechanism within it). Decide from the concepts' MEANING and the cited evidence, never from surface wordform overlap; when unsure, prefer 'keep_distinct' (merging is the irreversible-feeling action that fragments or fuses a learner's graph)."
    },
    rationale: { type: "string", description: "One terse sentence naming what makes the two the same concept or distinct." }
  }
};

export const nodeMergeAdjudicationValidator = z.object({
  decision: z.enum(["merge", "keep_distinct"]),
  rationale: z.string().min(1)
}).strict();

// --- Card generation: submit_recall_card (U2, R1/R2) ----------------------
// One anki-style recall card per derived learning node, conditioned on its grounding.
// The answer-key cites provided grounding passages by passage id + quote; the
// application boundary verifies each quote under that grounding's provenance
// contract and rejects fail-closed (AGENTS rule 6). Domain-neutral rubric language
// only (AGENTS rule 17).
export const cardGenerationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "answerKey", "selfReportPrompt", "citations"],
  properties: {
    question: {
      type: "string",
      description: "One self-contained recall question about the learning node that a learner could answer from understanding it. Do not reference 'the passage' or 'the source'."
    },
    answerKey: {
      type: "string",
      description: "A concise correct answer a grader can check a learner's free-form response against. Grounded in the provided grounding passages; introduce no facts absent from them."
    },
    selfReportPrompt: {
      type: "string",
      description: "A short first-person confidence prompt for calibration, e.g. 'How confident are you that you can explain this concept and its role?'."
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["passageId", "evidenceQuote"],
        properties: {
          passageId: { type: "string", description: "Exact passageId of one provided grounding passage the answer derives from." },
          evidenceQuote: { type: "string", description: "Substring copied from that grounding passage supporting the answer-key. For source-grounded passages, copy it verbatim." }
        }
      }
    }
  }
};

export const cardGenerationValidator = z.object({
  question: z.string().min(1),
  answerKey: z.string().min(1),
  selfReportPrompt: z.string().min(1),
  citations: z.array(z.object({ passageId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict())
}).strict();

// --- Option-select generation: submit_option_select_item (U3, R9/R10) -----
// One four-option auto-graded item per node: a grounded correct answer (cited by
// passage id + quote, verified verbatim by the application boundary) plus THREE
// sibling-conditioned distractors that read like real domain answers but are wrong.
// Domain-neutral rubric language only (AGENTS rule 17): the schema names no fixture and
// lists no exemplars. The deterministic guard (U2) enforces structure; this schema only
// enforces SHAPE fail-closed (rule 6) — distractor quality is judged by the rule-14 pass.
export const optionSelectSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "correctAnswer", "distractors"],
  properties: {
    question: {
      type: "string",
      description: "One self-contained multiple-choice question about the learning node with a single correct answer. Do not reference 'the passage' or 'the source'."
    },
    correctAnswer: {
      type: "object",
      additionalProperties: false,
      required: ["text", "citation"],
      properties: {
        text: { type: "string", description: "The single correct option, grounded strictly in the provided passages." },
        citation: {
          type: "object",
          additionalProperties: false,
          required: ["passageId", "evidenceQuote"],
          properties: {
            passageId: { type: "string", description: "Exact passageId of the provided grounding passage the correct answer derives from." },
            evidenceQuote: { type: "string", description: "Substring copied from that grounding passage supporting the correct answer. For source-grounded passages, copy it verbatim." }
          }
        }
      }
    },
    distractors: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string",
        description: "A plausible but INCORRECT option in the same domain register as the provided neighbor concepts. It must be clearly wrong for this question, never a paraphrase of the correct answer."
      }
    }
  }
};

export const optionSelectValidator = z.object({
  question: z.string().min(1),
  correctAnswer: z.object({
    text: z.string().min(1),
    citation: z.object({ passageId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()
  }).strict(),
  distractors: z.array(z.string().min(1)).length(3)
}).strict();

// --- Answer grading: submit_answer_grade (U5, R9) -------------------------
// Grades a learner's free-form written answer against a card's answer-key. Runs
// cross-family (kg-independent-judge) so the DeepSeek card generator never grades
// its own answer-key (ADR-0023). Domain-neutral rubric language only (rule 17).
export const answerGradingSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "score", "rationale"],
  properties: {
    outcome: {
      type: "string",
      enum: ["correct", "partial", "incorrect"],
      description: "'correct' when the answer captures the answer-key's essential content; 'partial' when it is on-topic but incomplete or contains a notable error; 'incorrect' when it misses or contradicts the answer-key. Judge meaning, not wording."
    },
    score: { type: "number", description: "A [0,1] confidence-weighted correctness score consistent with the outcome (roughly 1.0 correct, ~0.5 partial, 0 incorrect)." },
    rationale: { type: "string", description: "One terse sentence justifying the outcome against the answer-key." }
  }
};

export const answerGradingValidator = z.object({
  outcome: z.enum(["correct", "partial", "incorrect"]),
  score: z.number().min(0).max(1),
  rationale: z.string().min(1)
}).strict();

// --- Learner answer simulation: submit_simulated_answer (U7, R14) ---------
// Simulates a learner of a given competence answering a recall question, to seed the
// Response Log for a rule-14 run. EXPERIMENT_ONLY scaffolding; never asserted in
// tests (AGENTS rule 11). Domain-neutral (rule 17).
export const learnerAnswerSimulationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: {
    answer: { type: "string", description: "The learner's free-form written answer to the question, written in the voice and competence of the given learner persona." }
  }
};

export const learnerAnswerSimulationValidator = z.object({
  answer: z.string().min(1)
}).strict();
