import {
  extractableBlocks,
  type ExtractedClaim,
  type ExtractionRunResult,
  type RunCandidate,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  ConceptAdmissionPort,
  ConceptConditionedClaimExtractionPort,
  ConceptDiscoveryPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";
import { applyClaimPolicy } from "./applyClaimPolicy";

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
  const admittedConcepts = coreCandidates.map((candidate) => ({ candidateKey: candidate.candidateKey, canonicalLabel: candidate.canonicalLabel }));
  const coreKeys = new Set(coreCandidates.map((candidate) => candidate.candidateKey));
  const labelsByCandidateKey = new Map<string, string[]>(
    coreCandidates.map((candidate) => [
      candidate.candidateKey,
      [candidate.discoveredLabel, candidate.canonicalLabel, ...candidate.aliases]
    ])
  );

  // Stage 3 — concept-conditioned claim extraction with deterministic evidence validation.
  // One LLM call per core concept, through a bounded pool; results are collected in
  // subject order so the persisted run is deterministic regardless of completion order.
  const proposals: ExtractionRunResult["proposals"] = [];
  const extractionResults = await mapWithConcurrency(coreCandidates, CLAIM_EXTRACTION_CONCURRENCY, async (subject) => {
    try {
      return await input.claimExtraction.extract({
        document,
        declaredDomain,
        subject: { candidateKey: subject.candidateKey, canonicalLabel: subject.canonicalLabel },
        admittedConcepts,
        evidenceNeighborhood: evidenceNeighborhood(document, subject)
      });
    } catch {
      // Fail closed for this concept after the client's retry budget: no claims,
      // rather than aborting the whole source run. Observable as missing claims.
      return null;
    }
  });
  const extractedClaims: ExtractedClaim[] = [];
  for (const result of extractionResults) {
    if (result === null) continue;
    extractedClaims.push(...result.claims);
    for (const proposal of result.proposals) proposals.push(proposal);
  }
  const claims = applyClaimPolicy({
    claims: extractedClaims,
    coreCandidateKeys: coreKeys,
    labelsByCandidateKey,
    blockText
  });

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
    artifactType: "extraction_run.v3",
    schemaVersion: "3",
    runId: input.runId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: input.pipelineConfigHash,
    createdAt: new Date().toISOString(),
    payload: runResult
  });
  return runResult;
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
