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
    evidence: { type: "array", maxItems: 2, items: blockEvidenceSchema }
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
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(2)
    }).strict(),
    establishedDomainMeaning: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(2)
    }).strict(),
    definitionBearingTreatment: z.object({
      passed: z.boolean(),
      rationale: z.string().min(1),
      evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()).max(2)
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
// passages, salience-ordered mention passages, and zero or more optional typed
// assertions. Only `defines` (literal) and `explicit-prerequisite-hint` (admitted
// Concept) are typed; every other relationship is an untyped mention passage.

const optionalTypedAssertionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "objectKind", "objectCandidateKey", "literalValue", "evidence"],
  properties: {
    type: {
      type: "string",
      enum: ["defines", "explicit-prerequisite-hint"],
      description: "'defines' = the evidence defines the subject (objectKind=literal, literalValue set). 'explicit-prerequisite-hint' = the evidence EXPLICITLY states the subject must be understood before another ADMITTED concept (objectKind=concept, objectCandidateKey set)."
    },
    objectKind: { type: "string", enum: ["literal", "concept"] },
    objectCandidateKey: { type: ["string", "null"], description: "For explicit-prerequisite-hint: the candidateKey of an ADMITTED concept the subject is needed before. Null for defines." },
    literalValue: { type: ["string", "null"], description: "For defines: a faithful, concise definition grounded in the evidence quote. Null for explicit-prerequisite-hint." },
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
      description: "Optional typed assertions. Emit only when the evidence explicitly supports a definition literal or an explicit prerequisite hint to an admitted concept. Everything else belongs in mentions.",
      items: optionalTypedAssertionSchema
    }
  }
};

export const conceptEvidenceProfileValidator = z.object({
  definitions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()),
  mentions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()),
  assertions: z.array(z.object({
    type: z.enum(["defines", "explicit-prerequisite-hint"]),
    objectKind: z.enum(["literal", "concept"]),
    objectCandidateKey: z.string().nullable(),
    literalValue: z.string().nullable(),
    evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict())
  }).strict())
}).strict();

// --- Prerequisite judgment: submit_prerequisite_judgment ------------------
// One bounded judgment over a single gated concept pair (ADR-0019). The model
// returns a DIRECTION between the two named concepts, not free-form edges; the
// application boundary maps it to a directed/none/uncertain edge fail-closed.

const PREREQUISITE_RELATION = ["prerequisite", "none", "uncertain"] as const;

// The judge NAMES the prerequisite concept rather than emitting a positional
// 'a-is-prerequisite-of-b' token. A real run showed the model reasons correctly but
// systematically anchors the positional token on the A-side, producing edges that
// contradict their own rationale. Copying the verbatim label of the concept that
// must be understood FIRST removes the positional mapping the model gets wrong; the
// application matches the label against the two provided concepts and fails closed
// to 'uncertain' (flagged, path-excluded) when it names neither — never a guess.
export const prerequisiteJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relation", "prerequisiteLabel", "confidence", "rationale"],
  properties: {
    relation: {
      type: "string",
      enum: [...PREREQUISITE_RELATION],
      description:
        "'prerequisite' when one concept must be understood before the other; 'none' when neither is a learning prerequisite of the other; 'uncertain' when a relation is plausible but the evidence does not establish a clear direction."
    },
    prerequisiteLabel: {
      type: "string",
      description:
        "When relation='prerequisite', the EXACT canonical label (copied verbatim) of the concept that must be understood FIRST. It must equal one of the two provided concept labels. Empty string for 'none' or 'uncertain'."
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string", description: "One terse sentence grounded in the concept meanings and evidence." }
  }
};

export const prerequisiteJudgmentValidator = z.object({
  relation: z.enum(PREREQUISITE_RELATION),
  prerequisiteLabel: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
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

// --- Assertion entailment judgment: submit_assertion_entailment_judgment --
// One bounded judgment over a single optional typed assertion (ADR-0007 reset).
// For an explicit-prerequisite-hint the model decides whether the verbatim
// evidence EXPLICITLY states the subject is needed before the object concept.
// `entailingSpan` is the minimal sub-quote that carries the assertion; the
// application boundary fails closed to entailed:false when it is not a substring
// of any provided quote.

export const assertionEntailmentJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entailed", "entailingSpan", "rationale"],
  properties: {
    entailed: {
      type: "boolean",
      description:
        "True only if the quoted evidence actually asserts the stated assertion between the two named concepts. False for unrelated, wrongly-directed, or merely-co-mentioned pairs."
    },
    entailingSpan: {
      type: "string",
      description:
        "The minimal verbatim sub-quote (copied exactly from one of the provided quotes) that carries the assertion. Empty string when entailed is false."
    },
    rationale: { type: "string", description: "One terse sentence grounded in the quoted evidence." }
  }
};

export const assertionEntailmentJudgmentValidator = z.object({
  entailed: z.boolean(),
  entailingSpan: z.string(),
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
