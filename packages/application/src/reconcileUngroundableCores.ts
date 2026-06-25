import {
  CORE_DEMOTED_HOLLOW_DEFINITION_REASON,
  CORE_DEMOTED_UNGROUNDABLE_REASON,
  type RunCandidate,
  type RunEvidenceProfile
} from "@lrnki/domain-core";

// Post-CEP tier reconciliation, NOT an admission decision (admitSource owns those).
// A candidate admitted `core` whose concept-conditioned Concept Evidence Profile came
// back INCOMPLETE cannot publish a source-grounded Concept, so it is demoted to
// `optional`. Completeness is only known after CEP extraction (and, now, after the
// Definition-Passage quality judge drops hollow passages), which is why this is a
// separate phase rather than part of admitSource.
//
// The demotion reason code SPLITS by cause (ADR-0007 extension, KTD3): a key whose
// last definition was vetoed as hollow (`hollowDefinitionKeys`) is tagged
// CORE_DEMOTED_HOLLOW_DEFINITION_REASON; a key the extractor never grounded at all is
// tagged CORE_DEMOTED_UNGROUNDABLE_REASON. The two codes are the measurement hook layer
// B consumes to tell "never defined" from "defined only by a hollow passage".
//
// Pure and immutable: returns new candidate/profile arrays (object-identity preserved
// for untouched entries) so `admission.tier` has exactly one writer in this phase,
// instead of the previous in-place mutation. `coreKeys` is the set of candidates that
// were `core` at the close of admission, captured before extraction.
export function reconcileUngroundableCores(input: {
  candidates: RunCandidate[];
  evidenceProfiles: RunEvidenceProfile[];
  coreKeys: Set<string>;
  hollowDefinitionKeys?: Set<string>;
}): { candidates: RunCandidate[]; evidenceProfiles: RunEvidenceProfile[]; demotedCoreCount: number } {
  const hollowDefinitionKeys = input.hollowDefinitionKeys ?? new Set<string>();
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
    const reason = hollowDefinitionKeys.has(candidate.candidateKey)
      ? CORE_DEMOTED_HOLLOW_DEFINITION_REASON
      : CORE_DEMOTED_UNGROUNDABLE_REASON;
    const boundaryReasonCodes = candidate.admission.boundaryReasonCodes.includes(reason)
      ? candidate.admission.boundaryReasonCodes
      : [...candidate.admission.boundaryReasonCodes, reason];
    return { ...candidate, admission: { ...candidate.admission, tier: "optional", boundaryReasonCodes } };
  });
  const evidenceProfiles = input.evidenceProfiles.map((profile): RunEvidenceProfile =>
    demotedKeys.has(profile.candidateKey) ? { ...profile, tier: "optional" } : profile
  );
  return { candidates, evidenceProfiles, demotedCoreCount: demotedKeys.size };
}
