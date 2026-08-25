import type { RunCandidate } from "@lrnki/domain-core";
import type { AdmissionLabelJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

export const ADMISSION_LABEL_NON_CONCEPT_POLICY =
  "grounded_non_concept_demote_fail_operation_on_unavailable_v2";

// Composed concept-vs-non-concept admission stage (ADR-0005). Runs AFTER the pure
// deterministic `applyAdmissionPolicy`. A candidate that the neural Core Set
// Selection placed `core` and that survived the deterministic boundary
// (source-grounding, eligibility, organizing power, illustrative demotion)
// arrives here. The judge re-checks ONE thing per candidate: does the label NAME
// a concept, ASSERT a proposition, or name the source artifact carrying concepts?
// It replaces the brittle
// deterministic `looksLikePropositionLabel` lexical veto (AGENTS rule 16).
//
// The judge can ONLY DOWNGRADE: it demotes a `core` proposition or source-artifact
// label to `optional`; it never resurrects an `optional`/`reject`/`quarantine` candidate,
// so the recall the prompt produced is the only lever that admits a concept
// (KTD2). An ungrounded verdict is deterministically coerced to `concept`; an
// exhausted transport/schema call fails the Extraction Run instead of silently
// preserving a potentially unsafe core. The registered source remains retriable.
export async function applyAdmissionLabelJudge(input: {
  candidates: RunCandidate[];
  declaredDomain: string;
  judge: AdmissionLabelJudgmentPort;
  concurrency?: number;
}): Promise<RunCandidate[]> {
  // The whole control flow rides the Measured Judge Gate (rule 16, gateByJudgment):
  // `skip` keeps every non-`core` candidate untouched with no neural call; `onVerdict`
  // demotes only on a confident non-concept verdict; `onUnavailable` fails the
  // enclosing admission unit without treating failure as a semantic verdict.
  return gateByJudgment(input.candidates, {
    concurrency: input.concurrency,
    skip: (candidate) => (candidate.admission.tier === "core" ? undefined : candidate),
    judge: (candidate) =>
      input.judge.judge({
        declaredDomain: input.declaredDomain,
        label: candidate.canonicalLabel,
        aliases: candidate.aliases,
        evidenceQuotes: candidateEvidenceQuotes(candidate)
      }),
    onVerdict: (candidate, judgment) =>
      judgment.labelKind === "concept" ? candidate : demote(candidate, judgment),
    onUnavailable: (_candidate, error) => { throw error; }
  });
}

// The candidate's already-verbatim-verified evidence: discovered mentions plus the
// eligibility-criterion and organizing-power evidence. All passed `isVerifiable`
// in `applyAdmissionPolicy`, so the judge's grounding can only match real source
// text.
function candidateEvidenceQuotes(candidate: RunCandidate): string[] {
  const quotes = [
    ...candidate.mentions.map((mention) => mention.evidenceQuote),
    ...candidate.admission.standaloneLearningObjective.evidence.map((item) => item.evidenceQuote),
    ...candidate.admission.establishedDomainMeaning.evidence.map((item) => item.evidenceQuote),
    ...candidate.admission.definitionBearingTreatment.evidence.map((item) => item.evidenceQuote),
    ...candidate.admission.organizingPower.aspects.map((aspect) => aspect.evidence.evidenceQuote)
  ];
  return [...new Set(quotes.filter((quote) => quote.trim().length > 0))];
}

function demote(
  candidate: RunCandidate,
  judgment: Awaited<ReturnType<AdmissionLabelJudgmentPort["judge"]>>
): RunCandidate {
  const reasons = [...candidate.admission.boundaryReasonCodes];
  if (judgment.labelKind === "source_artifact") {
    if (!reasons.includes("source_artifact_label_judged")) {
      reasons.push("source_artifact_label_judged");
    }
  } else {
    if (!reasons.includes("proposition_label_judged")) reasons.push("proposition_label_judged");
    const nounPhrase = judgment.underlyingNounPhrase.trim();
    const nounPhraseCode = `proposition_underlying_noun_phrase: ${nounPhrase}`;
    if (nounPhrase && !reasons.includes(nounPhraseCode)) reasons.push(nounPhraseCode);
  }
  return {
    ...candidate,
    admission: {
      ...candidate.admission,
      tier: "optional",
      boundaryReasonCodes: reasons
    }
  };
}
