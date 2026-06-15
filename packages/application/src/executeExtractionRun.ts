import {
  extractableBlocks,
  type ExtractedClaim,
  type ExtractionRunResult,
  type RunCandidate,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  ArtifactRepositoryPort,
  ClaimEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedClaimExtractionPort,
  ConceptDiscoveryPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { applyAdmissionLabelJudge } from "./applyAdmissionLabelJudge";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";
import { applyClaimPolicy } from "./applyClaimPolicy";
import { applyEntailmentJudge } from "./applyEntailmentJudge";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.4.0";

// One Extraction Run over one registered source (ADR-0017): discovery, admission,
// concept-conditioned claim extraction, and deterministic evidence validation.
// Assembles the run aggregate in memory and persists it once. Never publishes.
export async function executeExtractionRun(input: {
  runId: string;
  source: { sourceResourceId: string; sourceDocumentId: string; declaredDomain: string; document: StructuredDocument };
  pipelineConfigHash: string;
  discovery: ConceptDiscoveryPort;
  admission: ConceptAdmissionPort;
  claimExtraction: ConceptConditionedClaimExtractionPort;
  claimEntailmentJudge: ClaimEntailmentJudgmentPort;
  admissionLabelJudge: AdmissionLabelJudgmentPort;
  store: ExtractionRunStorePort;
  artifacts: ArtifactRepositoryPort;
}): Promise<ExtractionRunResult> {
  const startedAt = Date.now();
  const { document, declaredDomain } = input.source;
  const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await input.discovery.discover({ document, declaredDomain });

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  // Admission may SPLIT one discovered Candidate into several atomic proposals
  // (R13). Each proposal names its parent Candidate plus a run-local atomicKey.
  // Fail closed: an atom whose parent is unknown, or whose atomicKey collides with
  // another atom, is dropped before policy so it can never publish a core Concept
  // (scenario 2). A discovered Candidate with no surviving atom yields a single
  // reject RunCandidate for provenance.
  const admissionProposals = await input.admission.admit({ document, declaredDomain, candidates: discovered });
  const discoveredKeys = new Set(discovered.map((candidate) => candidate.candidateKey));
  const atomicKeyCounts = new Map<string, number>();
  for (const proposal of admissionProposals) {
    atomicKeyCounts.set(proposal.atomicKey, (atomicKeyCounts.get(proposal.atomicKey) ?? 0) + 1);
  }
  const proposalsByParent = new Map<string, typeof admissionProposals>();
  for (const proposal of admissionProposals) {
    if (!discoveredKeys.has(proposal.parentCandidateKey)) continue; // unknown parent: drop
    if (atomicKeyCounts.get(proposal.atomicKey) !== 1) continue; // duplicate atomic key: drop
    const group = proposalsByParent.get(proposal.parentCandidateKey) ?? [];
    group.push(proposal);
    proposalsByParent.set(proposal.parentCandidateKey, group);
  }

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

  // Concept-vs-proposition admission judge (ADR-0005). A downgrade-only neural
  // stage after the deterministic boundary: it demotes a `core` candidate whose
  // label asserts a proposition rather than naming a concept, replacing the
  // removed `looksLikePropositionLabel` lexical veto (AGENTS rule 16). Fail-closed
  // = preserve recall, so it never demotes on judge failure or an ungrounded
  // verdict. Runs only on the handful of `core` candidates, so cost is bounded.
  const candidates = await applyAdmissionLabelJudge({
    candidates: policyCandidates,
    declaredDomain,
    judge: input.admissionLabelJudge
  });

  const coreCandidates = candidates.filter((candidate) => candidate.admission.tier === "core");
  const admittedConcepts = coreCandidates.map((candidate) => ({
    candidateKey: candidate.candidateKey,
    canonicalLabel: candidate.canonicalLabel,
    aliases: exactAliases(candidate)
  }));
  const coreKeys = new Set(coreCandidates.map((candidate) => candidate.candidateKey));
  // Canonical label + exact aliases per concept, for the semantic entailment judge.
  const conceptsByKey = new Map<string, { canonicalLabel: string; aliases: string[] }>(
    admittedConcepts.map((concept) => [concept.candidateKey, { canonicalLabel: concept.canonicalLabel, aliases: concept.aliases }])
  );

  // Stage 3 — concept-conditioned claim extraction with deterministic evidence
  // validation and semantic entailment. Retry once only when a subject's first
  // attempt has no fully verified claim. Superseded first-pass claims remain
  // auditable, but are excluded from the final conflict pass.
  const proposals: ExtractionRunResult["proposals"] = [];
  const subjectAttempts = await mapWithConcurrency(coreCandidates, CLAIM_EXTRACTION_CONCURRENCY, async (subject) => {
    const extract = async (feedback?: Parameters<ConceptConditionedClaimExtractionPort["extract"]>[0]["feedback"]) => {
      try {
        return await input.claimExtraction.extract({
          document,
          declaredDomain,
          subject: {
            candidateKey: subject.candidateKey,
            canonicalLabel: subject.canonicalLabel,
            aliases: exactAliases(subject)
          },
          admittedConcepts,
          evidenceNeighborhood: evidenceNeighborhood(document, subject),
          feedback
        });
      } catch {
        return null;
      }
    };
    const first = await extract();
    const firstPolicyClaims = applyClaimPolicy({
      claims: first?.claims ?? [],
      extractionAttempt: 1,
      coreCandidateKeys: coreKeys,
      blockText
    });
    // Retry eligibility must use the complete claim verdict. Otherwise a claim
    // that passes structural checks but fails semantic entailment suppresses the
    // one precision-preserving retry.
    const firstClaims = await applyEntailmentJudge({
      claims: firstPolicyClaims,
      declaredDomain,
      conceptsByKey,
      judge: input.claimEntailmentJudge
    });
    if (firstClaims.some((claim) => claim.validationOutcome === "verified")) {
      return { first, firstClaims, retry: null };
    }
    const retry = await extract({
      rejectedClaims: firstClaims.map((claim) => ({
        predicate: claim.predicate,
        object: claim.object,
        evidence: claim.evidence,
        boundaryReasonCodes: claim.boundaryReasonCodes
      }))
    });
    return { first, firstClaims, retry };
  });

  const effectiveExtractedClaims: ExtractedClaim[] = [];
  const supersededClaims: ExtractionRunResult["claims"] = [];
  for (const attempts of subjectAttempts) {
    if (attempts.first) proposals.push(...attempts.first.proposals);
    if (attempts.retry) {
      proposals.push(...attempts.retry.proposals);
      supersededClaims.push(...attempts.firstClaims.map((claim) => ({
        ...claim,
        validationOutcome: "rejected" as const,
        boundaryReasonCodes: claim.boundaryReasonCodes.includes("superseded_by_retry")
          ? claim.boundaryReasonCodes
          : [...claim.boundaryReasonCodes, "superseded_by_retry"]
      })));
      effectiveExtractedClaims.push(...attempts.retry.claims.map((claim) => ({ ...claim, extractionAttempt: 2 })));
    } else if (attempts.first) {
      effectiveExtractedClaims.push(...attempts.first.claims.map((claim) => ({ ...claim, extractionAttempt: 1 })));
    }
  }

  // Deterministic pass first (verbatim floor, nature/direction, aggregate
  // structural gates), then the semantic entailment judge downgrades any
  // surviving concept claim whose evidence does not actually assert the relation
  // (ADR-0007). The judge only DOWNGRADES, so the deterministic guarantees hold.
  const policyClaims = applyClaimPolicy({
    claims: effectiveExtractedClaims,
    coreCandidateKeys: coreKeys,
    blockText
  });
  const judgedClaims = await applyEntailmentJudge({
    claims: policyClaims,
    declaredDomain,
    conceptsByKey,
    judge: input.claimEntailmentJudge
  });
  const claims = [...supersededClaims, ...judgedClaims];

  const runResult: ExtractionRunResult = {
    runId: input.runId,
    sourceResourceId: input.source.sourceResourceId,
    sourceDocumentId: input.source.sourceDocumentId,
    declaredDomain,
    pipelineConfigHash: input.pipelineConfigHash,
    candidates,
    claims,
    proposals,
    latencyMs: Date.now() - startedAt
  };

  await input.store.persist(runResult);
  await input.artifacts.append({
    artifactId: `${input.runId}:run`,
    artifactType: "extraction_run.v4",
    schemaVersion: "4",
    runId: input.runId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: input.pipelineConfigHash,
    createdAt: new Date().toISOString(),
    payload: runResult
  });
  return runResult;
}

function exactAliases(candidate: RunCandidate): string[] {
  return [...new Set([candidate.discoveredLabel, candidate.canonicalLabel, ...candidate.aliases])];
}

// Bounded so a large source cannot fan out unbounded parallel LLM calls through the proxy.
const CLAIM_EXTRACTION_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Evidence neighborhood: the candidate's own mention blocks plus any block whose
// text contains the concept label. Scoped to extractable body blocks so claims
// can never cite references, appendices, captions, or table/figure placeholders.
function evidenceNeighborhood(document: StructuredDocument, subject: RunCandidate) {
  const mentionBlockIds = new Set(subject.mentions.map((mention) => mention.blockId));
  const label = subject.canonicalLabel.toLowerCase();
  return extractableBlocks(document.blocks).filter((block) => mentionBlockIds.has(block.blockId) || block.text.toLowerCase().includes(label));
}
