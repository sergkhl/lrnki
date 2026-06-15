import type {
  BlockEvidence,
  ClaimEvidenceDirection,
  ClaimEvidenceLinkNature,
  ExtractedClaim,
  RelationPredicate,
  RunClaim
} from "@lrnki/domain-core";
import { evidenceQuoteMatches } from "@lrnki/domain-core";

const EXPECTED_SEMANTICS: Record<
  RelationPredicate,
  { nature: ClaimEvidenceLinkNature; direction: ClaimEvidenceDirection }
> = {
  "is-a": { nature: "taxonomic", direction: "subject-is-kind-of-object" },
  "part-of": { nature: "structural", direction: "subject-is-part-of-object" },
  "uses": { nature: "mechanism-employment", direction: "subject-uses-object" },
  "contrasts-with": { nature: "explicit-contrast", direction: "subject-contrasts-with-object" },
  "asserted-prerequisite-of": {
    nature: "explicit-prerequisite",
    direction: "subject-prerequisite-of-object"
  },
  "defined-as": { nature: "definitional", direction: "subject-defined-by-literal" }
};

const COMPETING_STRUCTURAL_PREDICATES = new Set<RelationPredicate>(["is-a", "part-of", "uses"]);
const ASYMMETRIC_PREDICATES = new Set<RelationPredicate>(["is-a", "part-of", "asserted-prerequisite-of"]);

// Collision-proof composite keys for the aggregate structural passes. JSON.stringify
// of a tuple cannot be spoofed by candidate keys or predicates that contain a
// delimiter character, unlike a hand-rolled separator.
function pairKey(parts: string[]): string {
  return JSON.stringify(parts);
}

export function applyClaimPolicy(input: {
  claims: ExtractedClaim[];
  extractionAttempt?: number;
  coreCandidateKeys: Set<string>;
  blockText: Map<string, string>;
}): RunClaim[] {
  const candidates = input.claims.flatMap((claim) => {
    if (claim.object.kind === "concept" && !input.coreCandidateKeys.has(claim.object.candidateKey)) return [];
    if (claim.object.kind === "concept" && claim.object.candidateKey === claim.subjectCandidateKey) return [];

    const expected = EXPECTED_SEMANTICS[claim.predicate];
    const evidence = claim.evidence.filter((item) => isVerifiable(item, input.blockText));
    const boundaryReasonCodes: string[] = [];
    if (evidence.length === 0) boundaryReasonCodes.push("no_verifiable_evidence");
    // Semantic entailment is NO LONGER decided here for EITHER claim shape. The
    // former `evidence_does_not_name_both_endpoints` /
    // `evidence_does_not_lexically_entail_relation` (concept claims) and
    // `evidence_does_not_lexically_entail_definition` (literal `defined-as`) vetoes
    // were all hardcoded surface matchers — contiguous-substring label match, an
    // English-phrase surface-order whitelist, and a closed definitional-connective
    // list requiring the model's PARAPHRASED definition to appear verbatim. All
    // produced false negatives on ordinary prose (lists, apposition, pronouns,
    // synonym verbs, reversed/appositive definitions) and discarded genuinely
    // supported claims (AGENTS rule 16). A claim that clears the verbatim floor
    // below, the nature/direction self-report gates, and the aggregate structural
    // gates is emitted "verified" here PENDING the semantic claim-entailment judge,
    // which the application runs as a separate composed async stage (ADR-0007). The
    // judge can only DOWNGRADE such a claim; it never resurrects one rejected here.
    if (claim.evidenceLinkNature === "causal-or-motivational") {
      boundaryReasonCodes.push("causal_or_motivational_link");
    } else if (claim.evidenceLinkNature !== expected.nature) {
      boundaryReasonCodes.push("predicate_link_nature_mismatch");
    }
    if (claim.evidenceDirection === "causal-or-motivational") {
      addReason(boundaryReasonCodes, "causal_or_motivational_link");
    } else if (claim.evidenceDirection !== expected.direction) {
      boundaryReasonCodes.push("predicate_direction_mismatch");
    }

    return [{ claim, evidence, boundaryReasonCodes }];
  });

  const byDirectedPair = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    if (candidate.claim.object.kind !== "concept") continue;
    if (!COMPETING_STRUCTURAL_PREDICATES.has(candidate.claim.predicate)) continue;
    const key = pairKey([candidate.claim.subjectCandidateKey, candidate.claim.object.candidateKey]);
    byDirectedPair.set(key, [...(byDirectedPair.get(key) ?? []), candidate]);
  }
  for (const group of byDirectedPair.values()) {
    if (new Set(group.map(({ claim }) => claim.predicate)).size < 2) continue;
    for (const candidate of group) addReason(candidate.boundaryReasonCodes, "competing_structural_predicates");
  }

  const asymmetricKeys = new Set(
    candidates.flatMap(({ claim }) =>
      claim.object.kind === "concept" && ASYMMETRIC_PREDICATES.has(claim.predicate)
        ? [pairKey([claim.predicate, claim.subjectCandidateKey, claim.object.candidateKey])]
        : []
    )
  );
  for (const candidate of candidates) {
    const { claim } = candidate;
    if (claim.object.kind !== "concept" || !ASYMMETRIC_PREDICATES.has(claim.predicate)) continue;
    const reverse = pairKey([claim.predicate, claim.object.candidateKey, claim.subjectCandidateKey]);
    if (asymmetricKeys.has(reverse)) addReason(candidate.boundaryReasonCodes, "reciprocal_asymmetric_relation");
  }

  return candidates.map(({ claim, evidence, boundaryReasonCodes }) => ({
    subjectCandidateKey: claim.subjectCandidateKey,
    predicate: claim.predicate,
    object: claim.object,
    evidence,
    modelConfidence: claim.confidence,
    evidenceCount: evidence.length,
    validationOutcome: boundaryReasonCodes.length === 0 ? "verified" : "rejected",
    boundaryReasonCodes,
    extractionAttempt: claim.extractionAttempt ?? input.extractionAttempt ?? 1
  }));
}

function isVerifiable(evidence: BlockEvidence, blockText: Map<string, string>): boolean {
  const text = blockText.get(evidence.blockId);
  return text !== undefined && evidenceQuoteMatches(text, evidence.evidenceQuote);
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}
