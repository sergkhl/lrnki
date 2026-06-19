import { CORE_DEMOTED_UNGROUNDABLE_REASON, type RunCandidate, type RunEvidenceProfile } from "@lrnki/domain-core";

// Post-CEP tier reconciliation, NOT an admission decision (admitSource owns those).
// A candidate admitted `core` whose concept-conditioned Concept Evidence Profile came
// back INCOMPLETE cannot publish a source-grounded Concept, so it is demoted to
// `optional` and tagged with CORE_DEMOTED_UNGROUNDABLE_REASON. Completeness is only
// known after CEP extraction, which is why this is a separate phase rather than part
// of admitSource.
//
// Pure and immutable: returns new candidate/profile arrays (object-identity preserved
// for untouched entries) so `admission.tier` has exactly one writer in this phase,
// instead of the previous in-place mutation. `coreKeys` is the set of candidates that
// were `core` at the close of admission, captured before extraction.
export function reconcileUngroundableCores(input: {
  candidates: RunCandidate[];
  evidenceProfiles: RunEvidenceProfile[];
  coreKeys: Set<string>;
}): { candidates: RunCandidate[]; evidenceProfiles: RunEvidenceProfile[]; demotedCoreCount: number } {
  const profilesByKey = new Map(input.evidenceProfiles.map((profile) => [profile.candidateKey, profile] as const));
  const demotedKeys = new Set<string>();
  for (const key of input.coreKeys) {
    if (profilesByKey.get(key)?.complete) continue;
    demotedKeys.add(key);
  }

  if (demotedKeys.size === 0) {
    return { candidates: input.candidates, evidenceProfiles: input.evidenceProfiles, demotedCoreCount: 0 };
  }

  const candidates = input.candidates.map((candidate): RunCandidate => {
    if (!demotedKeys.has(candidate.candidateKey)) return candidate;
    const boundaryReasonCodes = candidate.admission.boundaryReasonCodes.includes(CORE_DEMOTED_UNGROUNDABLE_REASON)
      ? candidate.admission.boundaryReasonCodes
      : [...candidate.admission.boundaryReasonCodes, CORE_DEMOTED_UNGROUNDABLE_REASON];
    return { ...candidate, admission: { ...candidate.admission, tier: "optional", boundaryReasonCodes } };
  });
  const evidenceProfiles = input.evidenceProfiles.map((profile): RunEvidenceProfile =>
    demotedKeys.has(profile.candidateKey) ? { ...profile, tier: "optional" } : profile
  );
  return { candidates, evidenceProfiles, demotedCoreCount: demotedKeys.size };
}
