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
        required: ["candidateKey", "canonicalLabel", "aliases", "mentions"],
        properties: {
          candidateKey: { type: "string", description: "Short stable slug unique within this document, e.g. 'ownership'." },
          canonicalLabel: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
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
    aliases: z.array(z.string()),
    mentions: z.array(z.object({ blockId: z.string().min(1), evidenceQuote: z.string().min(1) }).strict())
  }).strict())
}).strict();

// --- Concept Admission: submit_admission_decisions ------------------------

export const conceptAdmissionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateKey", "tier", "independentlyMeaningful", "independentlyTeachable", "durableBeyondSource", "reasonCodes", "confidence"],
        properties: {
          candidateKey: { type: "string" },
          tier: { type: "string", enum: ["core", "optional", "reject", "quarantine"] },
          independentlyMeaningful: { type: "boolean" },
          independentlyTeachable: { type: "boolean" },
          durableBeyondSource: { type: "boolean" },
          reasonCodes: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
};

export const conceptAdmissionValidator = z.object({
  decisions: z.array(z.object({
    candidateKey: z.string().min(1),
    tier: z.enum(["core", "optional", "reject", "quarantine"]),
    independentlyMeaningful: z.boolean(),
    independentlyTeachable: z.boolean(),
    durableBeyondSource: z.boolean(),
    reasonCodes: z.array(z.string()),
    confidence: z.number().min(0).max(1)
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
        required: ["predicate", "objectKind", "objectCandidateKey", "objectLiteralValue", "evidence", "confidence"],
        properties: {
          predicate: { type: "string", enum: [...RELATION_ENUM] },
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

export const conceptClaimValidator = z.object({
  claims: z.array(z.object({
    predicate: z.enum(RELATION_ENUM),
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
