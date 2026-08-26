import type { AdmissionProposal, DiscoveredCandidate, RunCandidate } from "@lrnki/domain-core";
import type { AdmissionLabelJudgmentPort } from "@lrnki/ports";
import { applyAdmissionLabelJudge } from "./applyAdmissionLabelJudge";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";

// The whole-source Concept Admission decision (CONTEXT.md "Concept Admission",
// ADR-0005). One module owns the admission unit the system actually cares about —
// "all atomic proposals derived from one source" — instead of smearing it across the
// extraction orchestrator. Three steps, in order:
//
//   1. fail-closed cross-atom resolution: admission may SPLIT one discovered
//      Candidate into several atomic proposals (R13). An atom whose parent Candidate
//      is unknown, or whose atomicKey collides with another atom, is dropped before
//      the deterministic boundary so it can never publish a core Concept;
//   2. the per-atom deterministic boundary (`applyAdmissionPolicy`): verbatim-verifies
//      positive criterion evidence, source-grounds the atomic label, derives the
//      effective tier fail-closed;
//   3. the neural concept-vs-non-concept downgrade (`applyAdmissionLabelJudge`):
//      grounded downgrade-only; an unavailable judge fails this admission unit.
//
// This is the PRE-CEP admission decision. Tier reconciliation against CEP
// completeness (an ungroundable core demoted to optional) is NOT an admission
// decision and is owned by `reconcileUngroundableCores`, which runs AFTER extraction
// because completeness is only known then.
export async function admitSource(input: {
  discovered: DiscoveredCandidate[];
  admissionProposals: AdmissionProposal[];
  blockText: Map<string, string>;
  declaredDomain: string;
  labelJudge: AdmissionLabelJudgmentPort;
  sourceCarrierLabels?: string[];
  headingPathByBlockId?: ReadonlyMap<string, readonly string[]>;
  labelJudgeConcurrency?: number;
}): Promise<RunCandidate[]> {
  const { discovered, admissionProposals, blockText } = input;

  // Step 1 — fail-closed cross-atom resolution.
  const discoveredKeys = new Set(discovered.map((candidate) => candidate.candidateKey));
  const atomicKeyCounts = new Map<string, number>();
  for (const proposal of admissionProposals) {
    atomicKeyCounts.set(proposal.atomicKey, (atomicKeyCounts.get(proposal.atomicKey) ?? 0) + 1);
  }
  const proposalsByParent = new Map<string, AdmissionProposal[]>();
  for (const proposal of admissionProposals) {
    if (!discoveredKeys.has(proposal.parentCandidateKey)) continue; // unknown parent: drop
    if (atomicKeyCounts.get(proposal.atomicKey) !== 1) continue; // duplicate atomic key: drop
    const group = proposalsByParent.get(proposal.parentCandidateKey) ?? [];
    group.push(proposal);
    proposalsByParent.set(proposal.parentCandidateKey, group);
  }

  // Step 2 — per-atom deterministic boundary. A discovered Candidate with no
  // surviving proposal still produces a rejected RunCandidate so the run records it.
  const policyCandidates: RunCandidate[] = [];
  for (const candidate of discovered) {
    const group = proposalsByParent.get(candidate.candidateKey) ?? [];
    if (group.length === 0) {
      policyCandidates.push(applyAdmissionPolicy({ parentCandidate: candidate, blockText }));
      continue;
    }
    for (const proposal of group) {
      policyCandidates.push(applyAdmissionPolicy({ parentCandidate: candidate, proposal, blockText }));
    }
  }

  // Step 3 — neural concept-vs-non-concept downgrade. Only grounded verdicts demote;
  // an unavailable judge fails the admission unit rather than preserving unsafe core recall.
  return applyAdmissionLabelJudge({
    candidates: policyCandidates,
    declaredDomain: input.declaredDomain,
    judge: input.labelJudge,
    sourceCarrierLabels: input.sourceCarrierLabels,
    headingPathByBlockId: input.headingPathByBlockId,
    concurrency: input.labelJudgeConcurrency
  });
}
