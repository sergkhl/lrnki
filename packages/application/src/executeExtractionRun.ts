import {
  extractableBlocks,
  type ExtractedClaim,
  type ExtractionRunResult,
  type RunCandidate,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  ClaimEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedClaimExtractionPort,
  ConceptDiscoveryPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
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
  store: ExtractionRunStorePort;
  artifacts: ArtifactRepositoryPort;
}): Promise<ExtractionRunResult> {
  const startedAt = Date.now();
  const { document, declaredDomain } = input.source;
  const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));
  const illustrativeBlockIds = new Set(
    document.blocks
      .filter((block) => isExplicitlyIllustrative(block.headingPath, block.text))
      .map((block) => block.blockId)
  );

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await input.discovery.discover({ document, declaredDomain });

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  const admissionProposals = await input.admission.admit({ document, declaredDomain, candidates: discovered });
  const proposalByKey = new Map<string, (typeof admissionProposals)[number]>();
  const duplicateKeys = new Set<string>();
  const discoveredKeys = new Set(discovered.map((candidate) => candidate.candidateKey));
  for (const proposal of admissionProposals) {
    if (!discoveredKeys.has(proposal.candidateKey)) continue;
    if (proposalByKey.has(proposal.candidateKey)) duplicateKeys.add(proposal.candidateKey);
    else proposalByKey.set(proposal.candidateKey, proposal);
  }

  const candidates: RunCandidate[] = discovered.map((candidate) => applyAdmissionPolicy({
    candidate,
    proposal: duplicateKeys.has(candidate.candidateKey) ? undefined : proposalByKey.get(candidate.candidateKey),
    blockText,
    illustrativeBlockIds,
    initialBoundaryReasonCodes: duplicateKeys.has(candidate.candidateKey) ? ["duplicate_admission_decision"] : []
  }));

  const coreCandidates = candidates.filter((candidate) => candidate.admission.tier === "core");
  const admittedConcepts = coreCandidates.map((candidate) => ({
    candidateKey: candidate.candidateKey,
    canonicalLabel: candidate.canonicalLabel,
    aliases: exactAliases(candidate)
  }));
  const coreKeys = new Set(coreCandidates.map((candidate) => candidate.candidateKey));
  const labelsByCandidateKey = new Map<string, string[]>(
    coreCandidates.map((candidate) => [
      candidate.candidateKey,
      [candidate.discoveredLabel, candidate.canonicalLabel, ...candidate.aliases]
    ])
  );
  // Canonical label + exact aliases per concept, for the semantic entailment judge.
  const conceptsByKey = new Map<string, { canonicalLabel: string; aliases: string[] }>(
    admittedConcepts.map((concept) => [concept.candidateKey, { canonicalLabel: concept.canonicalLabel, aliases: concept.aliases }])
  );

  // Stage 3 — concept-conditioned claim extraction with deterministic evidence validation.
  // Retry once only when a subject's first attempt has no verified claim. Superseded
  // first-pass claims remain auditable, but are excluded from the final conflict pass.
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
    const firstClaims = applyClaimPolicy({
      claims: first?.claims ?? [],
      extractionAttempt: 1,
      coreCandidateKeys: coreKeys,
      labelsByCandidateKey,
      blockText
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
  // (ADR-0020). The judge only DOWNGRADES, so the deterministic guarantees hold.
  const policyClaims = applyClaimPolicy({
    claims: effectiveExtractedClaims,
    coreCandidateKeys: coreKeys,
    labelsByCandidateKey,
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

function isExplicitlyIllustrative(headingPath: string[], text: string): boolean {
  const heading = headingPath.join(" ").toLowerCase();
  const opening = text.slice(0, 240).toLowerCase();
  return /\b(case study|worked example|illustrative example|demonstration|demo|downstream application)\b/.test(heading) ||
    /\b(to illustrate|as an illustrative example|as a worked example|we demonstrate how|downstream application)\b/.test(opening);
}
