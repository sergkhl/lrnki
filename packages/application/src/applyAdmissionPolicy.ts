import {
  evidenceQuoteMatches,
  looksLikePropositionLabel,
  normalizeConceptLabel,
  type AdmissionCriterionProposal,
  type AdmissionProposal,
  type BlockEvidence,
  type DiscoveredCandidate,
  type OrganizingPowerAspectProposal,
  type RunCandidate
} from "@lrnki/domain-core";

export function applyAdmissionPolicy(input: {
  candidate: DiscoveredCandidate;
  proposal?: AdmissionProposal;
  blockText: Map<string, string>;
  illustrativeBlockIds?: Set<string>;
  initialBoundaryReasonCodes?: string[];
}): RunCandidate {
  const { candidate, proposal, blockText } = input;
  const boundaryReasonCodes = [...(input.initialBoundaryReasonCodes ?? [])];
  const mentions = candidate.mentions.filter((evidence) => isVerifiable(evidence, blockText));

  if (!proposal) {
    boundaryReasonCodes.push("no_admission_decision");
    return {
      candidateKey: candidate.candidateKey,
      discoveredLabel: candidate.canonicalLabel,
      canonicalLabel: candidate.canonicalLabel,
      normalizedLabel: normalizeConceptLabel(candidate.canonicalLabel),
      aliases: [],
      mentions,
      admission: {
        modelTier: "reject",
        tier: "reject",
        proposedCanonicalLabel: candidate.canonicalLabel,
        standaloneLearningObjective: emptyCriterion(),
        establishedDomainMeaning: emptyCriterion(),
        organizingPower: emptyOrganizingPower(),
        coreSelected: false,
        selectionReasonCode: "missing_core_selection",
        reasonCodes: ["no_admission_decision"],
        boundaryReasonCodes: unique(boundaryReasonCodes),
        confidence: 0
      }
    };
  }

  const standaloneLearningObjective = validateCriterion(
    proposal.standaloneLearningObjective,
    blockText,
    "standalone_learning_objective",
    boundaryReasonCodes
  );
  const establishedDomainMeaning = validateCriterion(
    proposal.establishedDomainMeaning,
    blockText,
    "established_domain_meaning",
    boundaryReasonCodes
  );
  const organizingPower = validateOrganizingPower(
    proposal.organizingPower,
    blockText,
    boundaryReasonCodes
  );
  const proposedCanonicalLabel = proposal.proposedCanonicalLabel.trim();
  const canonicalLabelValid = normalizeConceptLabel(proposedCanonicalLabel).length > 0;
  if (!canonicalLabelValid) boundaryReasonCodes.push("invalid_proposed_canonical_label");
  const proposedCanonicalLabelGrounded =
    canonicalLabelValid &&
    [...blockText.values()].some((text) =>
      normalizeConceptLabel(text).includes(normalizeConceptLabel(proposedCanonicalLabel))
    );
  if (canonicalLabelValid && !proposedCanonicalLabelGrounded) {
    boundaryReasonCodes.push("proposed_canonical_label_not_source_grounded");
  }

  const eligible =
    standaloneLearningObjective.passed &&
    establishedDomainMeaning.passed &&
    organizingPower.passed &&
    canonicalLabelValid;
  const illustrativeOnly =
    proposal.coreSelected &&
    organizingPower.aspects.length > 0 &&
    organizingPower.aspects.every((aspect) => input.illustrativeBlockIds?.has(aspect.evidence.blockId));
  if (illustrativeOnly) boundaryReasonCodes.push("illustrative_only_source_treatment");
  // A proposition-shaped canonical label is a Claim, not a Concept (e.g. the
  // chapter title "Division of Labour Limited by the Extent of the Market").
  // Demote it fail-closed; its underlying noun phrase is admitted on its own.
  const propositionShaped = proposal.coreSelected && looksLikePropositionLabel(proposedCanonicalLabel);
  if (propositionShaped) boundaryReasonCodes.push("proposition_shaped_label");
  const tier = proposal.tier === "quarantine"
    ? "quarantine"
    : eligible && proposal.coreSelected && !illustrativeOnly && !propositionShaped
      ? "core"
      : proposal.tier === "reject"
        ? "reject"
        : "optional";
  if (tier !== proposal.tier) boundaryReasonCodes.push("effective_tier_corrected");

  const canonicalLabel =
    tier === "core" && proposedCanonicalLabelGrounded
      ? proposedCanonicalLabel
      : candidate.canonicalLabel;
  // Candidate Discovery is recall-oriented and has no authority to merge labels
  // as aliases. Preserve only the discovered source label when admission assigns
  // a more precise canonical label; qualified variants require a later explicit
  // identity decision.
  const aliases = canonicalLabel !== candidate.canonicalLabel ? [candidate.canonicalLabel] : [];

  return {
    candidateKey: candidate.candidateKey,
    discoveredLabel: candidate.canonicalLabel,
    canonicalLabel,
    normalizedLabel: normalizeConceptLabel(canonicalLabel),
    aliases,
    mentions,
    admission: {
      modelTier: proposal.tier,
      tier,
      proposedCanonicalLabel: proposal.proposedCanonicalLabel,
      standaloneLearningObjective,
      establishedDomainMeaning,
      organizingPower,
      coreSelected: proposal.coreSelected,
      selectionReasonCode: proposal.selectionReasonCode,
      reasonCodes: unique(proposal.reasonCodes),
      boundaryReasonCodes: unique(boundaryReasonCodes),
      confidence: proposal.confidence
    }
  };
}

function validateCriterion(
  proposal: AdmissionCriterionProposal,
  blockText: Map<string, string>,
  reasonPrefix: string,
  boundaryReasonCodes: string[]
): RunCandidate["admission"]["standaloneLearningObjective"] {
  const evidence = proposal.evidence.filter((item) => isVerifiable(item, blockText));
  const passed = proposal.passed && evidence.length > 0;
  if (proposal.passed && !passed) boundaryReasonCodes.push(`${reasonPrefix}_missing_verified_evidence`);
  return {
    modelPassed: proposal.passed,
    passed,
    rationale: proposal.rationale.trim(),
    submittedEvidence: proposal.evidence,
    evidence
  };
}

function validateOrganizingPower(
  proposal: AdmissionProposal["organizingPower"],
  blockText: Map<string, string>,
  boundaryReasonCodes: string[]
): RunCandidate["admission"]["organizingPower"] {
  const aspects: OrganizingPowerAspectProposal[] = [];
  const summaries = new Set<string>();
  const evidenceReferences = new Set<string>();

  for (const aspect of proposal.aspects) {
    const summary = normalizeAspectSummary(aspect.summary);
    const evidenceReference = `${aspect.evidence.blockId}\u0000${aspect.evidence.evidenceQuote}`;
    if (aspect.nature === "motivation-or-example") continue;
    if (!summary || summaries.has(summary) || evidenceReferences.has(evidenceReference)) continue;
    if (!isVerifiable(aspect.evidence, blockText)) continue;
    summaries.add(summary);
    evidenceReferences.add(evidenceReference);
    aspects.push({ summary: aspect.summary.trim(), nature: aspect.nature, evidence: aspect.evidence });
  }

  const passed = proposal.passed && aspects.length >= 2;
  if (proposal.passed && !passed) boundaryReasonCodes.push("organizing_power_requires_two_distinct_verified_aspects");
  return {
    modelPassed: proposal.passed,
    passed,
    rationale: proposal.rationale.trim(),
    submittedAspects: proposal.aspects,
    aspects
  };
}

function isVerifiable(evidence: BlockEvidence, blockText: Map<string, string>): boolean {
  const text = blockText.get(evidence.blockId);
  return text !== undefined && evidenceQuoteMatches(text, evidence.evidenceQuote);
}

function normalizeAspectSummary(summary: string): string {
  return summary.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function emptyCriterion(): RunCandidate["admission"]["standaloneLearningObjective"] {
  return { modelPassed: false, passed: false, rationale: "", submittedEvidence: [], evidence: [] };
}

function emptyOrganizingPower(): RunCandidate["admission"]["organizingPower"] {
  return { modelPassed: false, passed: false, rationale: "", submittedAspects: [], aspects: [] };
}
