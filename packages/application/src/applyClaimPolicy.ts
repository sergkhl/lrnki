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

export function applyClaimPolicy(input: {
  claims: ExtractedClaim[];
  extractionAttempt?: number;
  coreCandidateKeys: Set<string>;
  labelsByCandidateKey: Map<string, string[]>;
  blockText: Map<string, string>;
}): RunClaim[] {
  const candidates = input.claims.flatMap((claim) => {
    if (claim.object.kind === "concept" && !input.coreCandidateKeys.has(claim.object.candidateKey)) return [];
    if (claim.object.kind === "concept" && claim.object.candidateKey === claim.subjectCandidateKey) return [];

    const expected = EXPECTED_SEMANTICS[claim.predicate];
    const evidence = claim.evidence.filter((item) => isVerifiable(item, input.blockText));
    const boundaryReasonCodes: string[] = [];
    if (evidence.length === 0) boundaryReasonCodes.push("no_verifiable_evidence");
    // Concept-to-concept entailment is NO LONGER decided here. The previous
    // `evidence_does_not_name_both_endpoints` and
    // `evidence_does_not_lexically_entail_relation` vetoes were hardcoded surface
    // matchers (contiguous-substring label match + an English-phrase, surface-order
    // whitelist). Both produced false negatives on ordinary prose — lists,
    // apposition, pronouns, synonym verbs — discarding genuinely-supported claims
    // (AGENTS rule 16). A concept claim that clears the verbatim floor below, the
    // nature/direction self-report gates, and the aggregate structural gates is
    // emitted "verified" here PENDING the semantic claim-entailment judge, which the
    // application runs as a separate composed async stage (ADR-0020). The judge can
    // only DOWNGRADE such a claim; it never resurrects one rejected here.
    if (claim.object.kind === "literal" && evidence.length > 0) {
      const subjectLabels = input.labelsByCandidateKey.get(claim.subjectCandidateKey) ?? [];
      const literalValue = claim.object.value;
      const hasDefinitionEvidence = evidence.some((item) =>
        lexicallyEntailsDefinition(item.evidenceQuote, subjectLabels, literalValue)
      );
      if (!hasDefinitionEvidence) boundaryReasonCodes.push("evidence_does_not_lexically_entail_definition");
    }
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
    const key = `${candidate.claim.subjectCandidateKey}\u0000${candidate.claim.object.candidateKey}`;
    byDirectedPair.set(key, [...(byDirectedPair.get(key) ?? []), candidate]);
  }
  for (const group of byDirectedPair.values()) {
    if (new Set(group.map(({ claim }) => claim.predicate)).size < 2) continue;
    for (const candidate of group) addReason(candidate.boundaryReasonCodes, "competing_structural_predicates");
  }

  const asymmetricKeys = new Set(
    candidates.flatMap(({ claim }) =>
      claim.object.kind === "concept" && ASYMMETRIC_PREDICATES.has(claim.predicate)
        ? [`${claim.predicate}\u0000${claim.subjectCandidateKey}\u0000${claim.object.candidateKey}`]
        : []
    )
  );
  for (const candidate of candidates) {
    const { claim } = candidate;
    if (claim.object.kind !== "concept" || !ASYMMETRIC_PREDICATES.has(claim.predicate)) continue;
    const reverse = `${claim.predicate}\u0000${claim.object.candidateKey}\u0000${claim.subjectCandidateKey}`;
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

function normalizeForMention(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function labelPositions(text: string, labels: string[]): number[] {
  const positions: number[] = [];
  for (const label of labels) {
    const normalized = normalizeForMention(label);
    if (!normalized) continue;
    let from = 0;
    while (from < text.length) {
      const position = text.indexOf(normalized, from);
      if (position < 0) break;
      positions.push(position);
      from = position + normalized.length;
    }
  }
  return positions;
}

// A `defined-as` literal is only entailed when a definitional copula DIRECTLY
// links the subject to the literal — the literal is the copula's complement.
// Requiring mere presence of " is " anywhere between subject and literal admits
// false definitions from long sentences (an unrelated "with which it is …" clause
// satisfies it). A definition also states what the subject IS, never what it is an
// effect/consequence/result of, so causal-origin complements are rejected.
const DEFINITION_CONNECTIVES = [" is ", " are ", " means ", " refers to ", " is defined as ", " is the ", " is a ", " is an "];

function lexicallyEntailsDefinition(evidenceQuote: string, subjectLabels: string[], literalValue: string): boolean {
  const text = ` ${normalizeForMention(evidenceQuote)} `;
  const literal = normalizeForMention(literalValue);
  if (!literal) return false;
  if (/^(the\s+)?(effects?|consequences?|results?|causes?)\s+of\s+/.test(literal)) return false;
  const subjectPositions = labelPositions(text, subjectLabels);
  if (subjectPositions.length === 0) return false;
  return labelPositions(text, [literalValue]).some((literalPosition) => {
    const before = text.slice(0, literalPosition);
    const connective = DEFINITION_CONNECTIVES.find((term) => before.endsWith(term));
    if (!connective) return false;
    const connectiveStart = before.length - connective.length;
    return subjectPositions.some((subjectPosition) => subjectPosition < connectiveStart);
  });
}
