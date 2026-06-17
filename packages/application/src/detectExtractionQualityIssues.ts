import { CORE_DEMOTED_UNGROUNDABLE_REASON, type ExtractionQualityIssue, type ExtractionRunResult, type RunCandidate } from "@lrnki/domain-core";

export function detectExtractionQualityIssues(run: ExtractionRunResult): ExtractionQualityIssue[] {
  const issues: ExtractionQualityIssue[] = [genericDomainNeutralPromptIssue()];
  const coreCandidates = run.candidates.filter((candidate) => candidate.admission.tier === "core");
  const demotedUngroundableCandidates = run.candidates.filter((candidate) =>
    candidate.admission.boundaryReasonCodes.includes(CORE_DEMOTED_UNGROUNDABLE_REASON)
  );

  if (coreCandidates.length === 0 && demotedUngroundableCandidates.length === 0) {
    issues.push({
      stage: "admission",
      issueType: "possible_missing_core_concept",
      severity: "warning",
      evidenceQuotes: [],
      rationale: "No core Concepts were admitted for this source; inspect whether the source is genuinely core-poor or admission recall failed."
    });
  }

  for (const candidate of demotedUngroundableCandidates) {
    issues.push({
      stage: "evidence_profile",
      candidateKey: candidate.candidateKey,
      conceptLabel: candidate.canonicalLabel,
      issueType: CORE_DEMOTED_UNGROUNDABLE_REASON,
      severity: run.degraded ? "critical" : "warning",
      evidenceQuotes: candidateEvidenceQuotes(candidate),
      rationale: "A core Concept admitted with definition-bearing treatment could not be grounded with a verbatim Definition Passage, so it was demoted to optional and the run succeeded with the remaining cores."
    });
  }

  for (const candidate of run.candidates) {
    if (candidate.admission.boundaryReasonCodes.includes("proposition_label_judged")) {
      issues.push({
        stage: "admission_label_judge",
        candidateKey: candidate.candidateKey,
        conceptLabel: candidate.canonicalLabel,
        issueType: "possible_proposition_label",
        severity: "warning",
        evidenceQuotes: candidateEvidenceQuotes(candidate),
        rationale: "The admission-label judge demoted this candidate because its label appears to assert a proposition rather than name a Concept."
      });
    }
    if (candidate.admission.tier === "reject" && candidate.admission.sourceRole === "out_of_domain_illustration") {
      issues.push({
        stage: "admission",
        candidateKey: candidate.candidateKey,
        conceptLabel: candidate.canonicalLabel,
        issueType: "possible_out_of_domain_illustration",
        severity: "info",
        evidenceQuotes: candidateEvidenceQuotes(candidate),
        rationale: "The candidate was rejected as a concept whose home field is outside the Declared Domain and appears only as illustrative material."
      });
    }
  }

  return issues;
}

function genericDomainNeutralPromptIssue(): ExtractionQualityIssue {
  return {
    stage: "extraction_run",
    issueType: "generic_domain_neutral_prompt",
    severity: "info",
    evidenceQuotes: [],
    rationale: "Fixture-specific prompt calibration was removed; inspect core-set omissions and redundant granularity before publishing."
  };
}

function candidateEvidenceQuotes(candidate: RunCandidate): string[] {
  return [
    ...candidate.mentions.map((mention) => mention.evidenceQuote),
    ...candidate.admission.standaloneLearningObjective.evidence.map((evidence) => evidence.evidenceQuote),
    ...candidate.admission.establishedDomainMeaning.evidence.map((evidence) => evidence.evidenceQuote),
    ...candidate.admission.definitionBearingTreatment.evidence.map((evidence) => evidence.evidenceQuote),
    ...candidate.admission.organizingPower.aspects.map((aspect) => aspect.evidence.evidenceQuote)
  ].filter((quote, index, quotes) => quote.trim().length > 0 && quotes.indexOf(quote) === index);
}
