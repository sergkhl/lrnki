import {
  evidenceQuoteMatches,
  normalizeConceptLabel,
  type BlockEvidence,
  type ExtractionRunResult,
  type RunCandidate,
  type RunClaim,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  ConceptAdmissionPort,
  ConceptConditionedClaimExtractionPort,
  ConceptDiscoveryPort,
  ExtractionRunStorePort
} from "@lrnki/ports";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.2.0";

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

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await input.discovery.discover({ document, declaredDomain });

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  const decisions = await input.admission.admit({ document, declaredDomain, candidates: discovered });
  const decisionByKey = new Map(decisions.map((decision) => [decision.candidateKey, decision] as const));

  const candidates: RunCandidate[] = discovered.map((candidate) => {
    const decision = decisionByKey.get(candidate.candidateKey);
    return {
      candidateKey: candidate.candidateKey,
      canonicalLabel: candidate.canonicalLabel,
      normalizedLabel: normalizeConceptLabel(candidate.canonicalLabel),
      aliases: candidate.aliases,
      mentions: candidate.mentions.filter((mention) => isVerifiable(mention, blockText)),
      admission: decision
        ? {
            tier: decision.tier,
            independentlyMeaningful: decision.independentlyMeaningful,
            independentlyTeachable: decision.independentlyTeachable,
            durableBeyondSource: decision.durableBeyondSource,
            reasonCodes: decision.reasonCodes,
            confidence: decision.confidence
          }
        // A discovered candidate the admitter never ruled on is failed closed to reject.
        : { tier: "reject", independentlyMeaningful: false, independentlyTeachable: false, durableBeyondSource: false, reasonCodes: ["no_admission_decision"], confidence: 0 }
    };
  });

  const coreCandidates = candidates.filter((candidate) => candidate.admission.tier === "core");
  const admittedConcepts = coreCandidates.map((candidate) => ({ candidateKey: candidate.candidateKey, canonicalLabel: candidate.canonicalLabel }));
  const coreKeys = new Set(coreCandidates.map((candidate) => candidate.candidateKey));

  // Stage 3 — concept-conditioned claim extraction with deterministic evidence validation.
  const claims: RunClaim[] = [];
  const proposals: ExtractionRunResult["proposals"] = [];
  for (const subject of coreCandidates) {
    const neighborhood = evidenceNeighborhood(document, subject);
    let result;
    try {
      result = await input.claimExtraction.extract({
        document,
        declaredDomain,
        subject: { candidateKey: subject.candidateKey, canonicalLabel: subject.canonicalLabel },
        admittedConcepts,
        evidenceNeighborhood: neighborhood
      });
    } catch {
      // Fail closed for this concept after the client's retry budget: no claims,
      // rather than aborting the whole source run. Observable as missing claims.
      continue;
    }
    for (const claim of result.claims) {
      // Object concept must be an admitted core concept; otherwise drop (fail closed).
      if (claim.object.kind === "concept" && !coreKeys.has(claim.object.candidateKey)) continue;
      // Keep only evidence that verifies verbatim against a real block; the model
      // sometimes emits placeholder block ids. No verifiable quote => rejected claim.
      const verifiableEvidence = claim.evidence.filter((evidence) => isVerifiable(evidence, blockText));
      claims.push({
        subjectCandidateKey: claim.subjectCandidateKey,
        predicate: claim.predicate,
        object: claim.object,
        evidence: verifiableEvidence,
        modelConfidence: claim.confidence,
        evidenceCount: verifiableEvidence.length,
        validationOutcome: verifiableEvidence.length > 0 ? "verified" : "rejected"
      });
    }
    for (const proposal of result.proposals) proposals.push(proposal);
  }

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
    artifactType: "extraction_run.v1",
    schemaVersion: "1",
    runId: input.runId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: input.pipelineConfigHash,
    createdAt: new Date().toISOString(),
    payload: runResult
  });
  return runResult;
}

// Evidence check: the cited block exists and contains the quote (ADR-0007),
// tolerating only source-formatting noise via evidenceQuoteMatches.
function isVerifiable(evidence: BlockEvidence, blockText: Map<string, string>): boolean {
  const text = blockText.get(evidence.blockId);
  return text !== undefined && evidenceQuoteMatches(text, evidence.evidenceQuote);
}

// Evidence neighborhood: the candidate's own mention blocks plus any block whose
// text contains the concept label. Keeps the claim prompt focused on relevant source.
function evidenceNeighborhood(document: StructuredDocument, subject: RunCandidate) {
  const mentionBlockIds = new Set(subject.mentions.map((mention) => mention.blockId));
  const label = subject.canonicalLabel.toLowerCase();
  return document.blocks.filter((block) => mentionBlockIds.has(block.blockId) || block.text.toLowerCase().includes(label));
}
