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
          candidateKey: { type: "string", description: "Short stable slug unique within this document, e.g. 'ownership'." },
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

export function conceptAdmissionSchemaForCandidateKeys(candidateKeys?: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["decisions"],
    properties: {
      decisions: {
        type: "array",
        ...(candidateKeys ? { maxItems: candidateKeys.length } : {}),
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "candidateKey",
            "proposedCanonicalLabel",
            "tier",
            "standaloneLearningObjective",
            "establishedDomainMeaning",
            "organizingPower",
            "reasonCodes",
            "confidence"
          ],
          properties: {
            candidateKey: {
              type: "string",
              ...(candidateKeys ? { enum: candidateKeys } : {})
            },
            proposedCanonicalLabel: {
              type: "string",
              description: "Precise domain-qualified label. Keep the discovered label when it is already precise."
            },
            tier: { type: "string", enum: ["core", "optional", "reject", "quarantine"] },
            standaloneLearningObjective: admissionCriterionSchema,
            establishedDomainMeaning: admissionCriterionSchema,
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
    candidateKey: z.string().min(1),
    proposedCanonicalLabel: z.string().min(1),
    tier: z.enum(["core", "optional", "reject", "quarantine"]),
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

// --- Claim Extraction: submit_concept_claims -----------------------------

const RELATION_ENUM = ["is-a", "part-of", "asserted-prerequisite-of", "contrasts-with", "uses", "defined-as"] as const;

export const conceptClaimSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims", "missingConceptProposals"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["predicate", "evidenceLinkNature", "evidenceDirection", "objectKind", "objectCandidateKey", "objectLiteralValue", "evidence", "confidence"],
        properties: {
          predicate: { type: "string", enum: [...RELATION_ENUM] },
          evidenceLinkNature: {
            type: "string",
            enum: ["taxonomic", "structural", "mechanism-employment", "explicit-contrast", "explicit-prerequisite", "definitional", "causal-or-motivational"],
            description: "How the EVIDENCE SENTENCE links subject and object. 'causal-or-motivational' = the sentence says one gives rise to, occasions, results from, explains, or motivates the other."
          },
          evidenceDirection: {
            type: "string",
            enum: [
              "subject-is-kind-of-object",
              "subject-is-part-of-object",
              "object-is-part-of-subject",
              "subject-uses-object",
              "object-uses-subject",
              "subject-contrasts-with-object",
              "subject-prerequisite-of-object",
              "object-prerequisite-of-subject",
              "subject-defined-by-literal",
              "causal-or-motivational"
            ],
            description: "Direction stated by the evidence, classified independently of predicate. Subject is the fixed subject concept in the prompt."
          },
          objectKind: { type: "string", enum: ["concept", "literal"] },
          objectCandidateKey: { type: ["string", "null"], description: "For concept objects: the candidateKey of an ADMITTED concept. Null for literal objects." },
          objectLiteralValue: { type: ["string", "null"], description: "For 'defined-as' literal objects only. Null otherwise." },
          evidence: { type: "array", items: blockEvidenceSchema },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    },
    missingConceptProposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["proposedLabel", "rationale", "evidenceBlockId", "evidenceQuote"],
        properties: {
          proposedLabel: { type: "string" },
          rationale: { type: "string" },
          evidenceBlockId: { type: ["string", "null"] },
          evidenceQuote: { type: ["string", "null"] }
        }
      }
    }
  }
};

// --- Prerequisite judgment: submit_prerequisite_judgment ------------------
// One bounded judgment over a single gated concept pair (ADR-0019). The model
// returns a DIRECTION between the two named concepts, not free-form edges; the
// application boundary maps it to a directed/none/uncertain edge fail-closed.

const PREREQUISITE_OUTCOME = [
  "a-is-prerequisite-of-b",
  "b-is-prerequisite-of-a",
  "none",
  "uncertain"
] as const;

export const prerequisiteJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "confidence", "rationale"],
  properties: {
    outcome: {
      type: "string",
      enum: [...PREREQUISITE_OUTCOME],
      description:
        "Directed prerequisite relation between the two concepts. 'a-is-prerequisite-of-b' means a learner must understand concept A before concept B. Use 'none' when neither is a learning prerequisite of the other; use 'uncertain' when a relation is plausible but the evidence does not establish a clear direction."
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string", description: "One terse sentence grounded in the concept meanings and evidence." }
  }
};

export const prerequisiteJudgmentValidator = z.object({
  outcome: z.enum(PREREQUISITE_OUTCOME),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
}).strict();

// --- Claim entailment judgment: submit_claim_entailment_judgment ----------
// One bounded judgment over a single concept-to-concept claim (ADR-0020). The
// model decides whether the verbatim evidence actually asserts the typed relation
// in the stated direction between the two named concepts. `entailingSpan` is the
// minimal sub-quote that carries the relation; the application boundary fails
// closed to entailed:false when it is not a substring of any provided quote.

export const claimEntailmentJudgmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entailed", "entailingSpan", "rationale"],
  properties: {
    entailed: {
      type: "boolean",
      description:
        "True only if the quoted evidence actually asserts the stated relation in the stated direction between the two named concepts. False for unrelated, wrongly-directed, wrong-relation, or merely-co-mentioned pairs."
    },
    entailingSpan: {
      type: "string",
      description:
        "The minimal verbatim sub-quote (copied exactly from one of the provided quotes) that carries the relation. Empty string when entailed is false."
    },
    rationale: { type: "string", description: "One terse sentence grounded in the quoted evidence." }
  }
};

export const claimEntailmentJudgmentValidator = z.object({
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
// One bounded judgment over a single admitted-`core` label (ADR-0021). The model
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
        "'concept' when the label is a noun phrase naming a durable unit of domain knowledge (even a long multi-word one). 'proposition_or_claim' ONLY when the label asserts a full predication about a concept — a subject + relation + object statement such as 'Operator Set as Bottleneck to Performance' or 'Division of Labour Limited by the Extent of the Market'. A long nominal label is still a concept."
    },
    underlyingNounPhrase: {
      type: "string",
      description:
        "When proposition_or_claim, the noun-phrase concept the label reduces to (e.g. 'Operator Set' for 'Operator Set as Bottleneck to Performance'), copied verbatim from the label/evidence. Empty string when labelKind is concept."
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

export const conceptClaimValidator = z.object({
  claims: z.array(z.object({
    predicate: z.enum(RELATION_ENUM),
    evidenceLinkNature: z.enum(["taxonomic", "structural", "mechanism-employment", "explicit-contrast", "explicit-prerequisite", "definitional", "causal-or-motivational"]),
    evidenceDirection: z.enum([
      "subject-is-kind-of-object",
      "subject-is-part-of-object",
      "object-is-part-of-subject",
      "subject-uses-object",
      "object-uses-subject",
      "subject-contrasts-with-object",
      "subject-prerequisite-of-object",
      "object-prerequisite-of-subject",
      "subject-defined-by-literal",
      "causal-or-motivational"
    ]),
    objectKind: z.enum(["concept", "literal"]),
    objectCandidateKey: z.string().nullable(),
    objectLiteralValue: z.string().nullable(),
    evidence: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict()),
    confidence: z.number().min(0).max(1)
  }).strict()),
  missingConceptProposals: z.array(z.object({
    proposedLabel: z.string().min(1),
    rationale: z.string(),
    evidenceBlockId: z.string().nullable(),
    evidenceQuote: z.string().nullable()
  }).strict())
}).strict();

// Gate 2 oracle reference author (ADR-0013). MiniMax M3 authors the admission
// reference: the set of concepts the source teaches that a learner-neutral graph
// should admit, each at `core` or `optional`, with verbatim evidence. Precision
// AND recall matter here (it is the reference, not the system under test), but the
// second judge audits it and disagreements are quarantined (AGENTS rule 11).
export const oracleAdmissionReferenceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["labels"],
  properties: {
    labels: {
      type: "array",
      description: "The concepts this source teaches that belong in a learner-neutral concept graph. Omit incidental mentions, examples used only to illustrate, author/metadata, and bibliography.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "expectedTier", "evidenceQuotes", "rationale"],
        properties: {
          label: { type: "string", description: "The canonical concept name as a NOUN PHRASE (not a sentence/claim). Domain-qualified when the bare term is ambiguous." },
          expectedTier: {
            type: "string",
            enum: ["core", "optional"],
            description: "'core' = a standalone learning objective with established domain meaning that carries the source's principal learning structure. 'optional' = a genuine but supporting/peripheral concept (a mechanism, application, or finer-grained variant)."
          },
          evidenceQuotes: {
            type: "array",
            description: "1-3 verbatim sub-quotes copied EXACTLY from the provided source blocks that show the source teaches this concept.",
            items: { type: "string" }
          },
          rationale: { type: "string", description: "One terse sentence on why it is admit-worthy at this tier." }
        }
      }
    }
  }
};

export const oracleAdmissionReferenceValidator = z.object({
  labels: z.array(z.object({
    label: z.string().min(1),
    expectedTier: z.enum(["core", "optional"]),
    evidenceQuotes: z.array(z.string().min(1)).min(1),
    rationale: z.string().min(1)
  }).strict())
}).strict();

// Gate 2 oracle second-judge audit (ADR-0013, rule 11). Mistral Small audits ONE
// reference label: does the source teach it as an admit-worthy concept at the
// claimed tier? `agrees:false` quarantines the label out of the trusted oracle.
export const oracleAdmissionAuditSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agrees", "correctedTier", "rationale"],
  properties: {
    agrees: { type: "boolean", description: "true if the source genuinely teaches this as an admit-worthy concept at (or close to) the claimed tier; false to quarantine it (not a concept, not taught here, or a proposition/example)." },
    correctedTier: {
      type: ["string", "null"],
      enum: ["core", "optional", null],
      description: "If you agree it is admit-worthy but at a different tier, the tier you would assign; otherwise null. Advisory only."
    },
    rationale: { type: "string", description: "One terse sentence." }
  }
};

export const oracleAdmissionAuditValidator = z.object({
  agrees: z.boolean(),
  correctedTier: z.enum(["core", "optional"]).nullable(),
  rationale: z.string().min(1)
}).strict();

// Gate 2 measured label-aligner: submit_label_alignment (TODO #1, rule 16). One
// bounded call that returns the production labels which are the SAME concept as a
// reference label in a different SURFACE FORM. It returns only matched pairs (an
// unmatched production label is simply absent); the application boundary checks
// both labels exist in the provided sets and keeps at most one reference per
// production label, fail-closed. Identity for SCORING ONLY — never relabels the graph.
export const oracleLabelAlignmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pairs"],
  properties: {
    pairs: {
      type: "array",
      description:
        "Each production label that denotes the SAME concept as exactly one reference label under a different surface form. Omit a production label entirely when it is a distinct concept (even if it shares words with a reference label).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productionLabel", "referenceLabel", "rationale"],
        properties: {
          productionLabel: { type: "string", description: "A label copied EXACTLY from the production list." },
          referenceLabel: { type: "string", description: "The reference label, copied EXACTLY, that names the SAME concept." },
          rationale: { type: "string", description: "One terse phrase naming the surface difference, e.g. 'plural', 'acronym in parentheses', 'hyphenation'." }
        }
      }
    }
  }
};

export const oracleLabelAlignmentValidator = z.object({
  pairs: z.array(z.object({
    productionLabel: z.string().min(1),
    referenceLabel: z.string().min(1),
    rationale: z.string().min(1)
  }).strict())
}).strict();
