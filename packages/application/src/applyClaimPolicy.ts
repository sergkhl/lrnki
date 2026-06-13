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
    if (claim.object.kind === "concept" && evidence.length > 0) {
      const subjectLabels = input.labelsByCandidateKey.get(claim.subjectCandidateKey) ?? [];
      const objectLabels = input.labelsByCandidateKey.get(claim.object.candidateKey) ?? [];
      const hasExplicitEndpointEvidence = evidence.some((item) =>
        mentionsAnyLabel(item.evidenceQuote, subjectLabels) &&
        mentionsAnyLabel(item.evidenceQuote, objectLabels)
      );
      if (!hasExplicitEndpointEvidence) boundaryReasonCodes.push("evidence_does_not_name_both_endpoints");
      const hasLexicalEntailment = evidence.some((item) =>
        lexicallyEntailsRelation(item.evidenceQuote, claim.predicate, subjectLabels, objectLabels)
      );
      if (!hasLexicalEntailment) boundaryReasonCodes.push("evidence_does_not_lexically_entail_relation");
    } else if (claim.object.kind === "literal" && evidence.length > 0) {
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

function mentionsAnyLabel(text: string, labels: string[]): boolean {
  const normalizedText = normalizeForMention(text);
  return labels.some((label) => {
    const normalizedLabel = normalizeForMention(label);
    return normalizedLabel.length > 0 && normalizedText.includes(normalizedLabel);
  });
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

function lexicallyEntailsRelation(
  evidenceQuote: string,
  predicate: RelationPredicate,
  subjectLabels: string[],
  objectLabels: string[]
): boolean {
  const text = ` ${normalizeForMention(evidenceQuote)} `;
  const subjectPositions = labelPositions(text, subjectLabels);
  const objectPositions = labelPositions(text, objectLabels);
  if (subjectPositions.length === 0 || objectPositions.length === 0) return false;

  const ordered = (left: number[], terms: string[], right: number[]) =>
    left.some((leftPosition) =>
      terms.some((term) => {
        const termPosition = text.indexOf(` ${term} `, leftPosition);
        return termPosition >= 0 && right.some((rightPosition) => rightPosition > termPosition);
      })
    );

  switch (predicate) {
    case "is-a":
      return ordered(subjectPositions, ["is a", "is an", "is one of", "is a type of", "is a kind of"], objectPositions);
    case "part-of":
      return ordered(subjectPositions, ["is part of", "forms part of", "is a component of", "is a step in"], objectPositions) ||
        ordered(objectPositions, ["includes", "contains", "comprises", "consists of"], subjectPositions);
    case "uses":
      return ordered(subjectPositions, ["uses", "use", "using", "employs", "employ", "employing", "leverages", "leverage", "leveraging", "utilizes", "utilize", "utilizing", "synergizes", "synergizing"], objectPositions);
    case "asserted-prerequisite-of":
      return ordered(subjectPositions, ["is a prerequisite for", "is required before", "must be understood before"], objectPositions);
    case "contrasts-with":
      return hasAnyTermBetween(text, subjectPositions, objectPositions, ["contrasts with", "contrast with", "unlike", "versus", "rather than", "distinguishes"]) ||
        hasAnyTermBetween(text, objectPositions, subjectPositions, ["contrasts with", "contrast with", "unlike", "versus", "rather than", "distinguishes"]);
    case "defined-as":
      return false;
  }
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

function hasAnyTermBetween(text: string, left: number[], right: number[], terms: string[]): boolean {
  return left.some((leftPosition) =>
    right.some((rightPosition) => {
      if (rightPosition <= leftPosition) return false;
      const between = text.slice(leftPosition, rightPosition);
      return terms.some((term) => between.includes(` ${term} `));
    })
  );
}

function lexicallyEntailsDefinition(evidenceQuote: string, subjectLabels: string[], literalValue: string): boolean {
  const text = ` ${normalizeForMention(evidenceQuote)} `;
  const literal = normalizeForMention(literalValue);
  if (!literal || !text.includes(literal)) return false;
  const literalPosition = text.indexOf(literal);
  return labelPositions(text, subjectLabels).some((subjectPosition) => {
    if (subjectPosition >= literalPosition) return false;
    const between = text.slice(subjectPosition, literalPosition);
    return [" is ", " means ", " refers to ", " is defined as "].some((term) => between.includes(term));
  });
}
