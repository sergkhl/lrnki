import {
  extractableBlocks,
  type ArtifactEnvelope,
  type ExtractionRunResult,
  type RunCandidate,
  type RunEvidenceProfile,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  ConceptDiscoveryPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { applyAdmissionLabelJudge } from "./applyAdmissionLabelJudge";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";
import { applyAssertionEntailmentJudge } from "./applyAssertionEntailmentJudge";
import { applyEvidenceProfilePolicy } from "./applyEvidenceProfilePolicy";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.5.0";
const EXTRACTION_RUN_ARTIFACT_TYPE = "extraction_run.v5";
const EXTRACTION_RUN_SCHEMA_VERSION = "5";

// Default mention bound per Concept per source (R4, KTD). Overridable per run; part
// of the pipeline configuration hash so a change is reflected in the artifact.
export const DEFAULT_MAX_MENTIONS_PER_CONCEPT_PER_SOURCE = 6;

// One Extraction Run over one registered source (ADR-0017): discovery, atomic
// admission, concept-conditioned Concept Evidence Profile extraction, deterministic
// verbatim validation, and optional-assertion entailment. Assembles the run
// aggregate in memory and persists it once with its immutable artifact. Never
// publishes. Replaces the retired claim-extraction orchestration: no retries, no
// recall feedback, no missing-concept proposals, no conflict pass (R7).
export async function executeExtractionRun(input: {
  runId: string;
  source: { sourceResourceId: string; sourceDocumentId: string; declaredDomain: string; document: StructuredDocument };
  pipelineConfigHash: string;
  maxMentionsPerConceptPerSource?: number;
  discovery: ConceptDiscoveryPort;
  admission: ConceptAdmissionPort;
  evidenceProfileExtraction: ConceptConditionedEvidenceProfileExtractionPort;
  assertionEntailmentJudge: AssertionEntailmentJudgmentPort;
  admissionLabelJudge: AdmissionLabelJudgmentPort;
  store: ExtractionRunStorePort;
}): Promise<ExtractionRunResult> {
  const startedAt = Date.now();
  const { document, declaredDomain } = input.source;
  const maxMentionsPerConceptPerSource = input.maxMentionsPerConceptPerSource ?? DEFAULT_MAX_MENTIONS_PER_CONCEPT_PER_SOURCE;
  const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await input.discovery.discover({ document, declaredDomain });

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  // Admission may SPLIT one discovered Candidate into several atomic proposals
  // (R13). Each proposal names its parent Candidate plus a run-local atomicKey.
  // Fail closed: an atom whose parent is unknown, or whose atomicKey collides with
  // another atom, is dropped before policy so it can never publish a core Concept.
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

  // Concept-vs-proposition admission judge (ADR-0005). Downgrade-only neural stage
  // after the deterministic boundary; preserves recall on judge failure.
  const candidates = await applyAdmissionLabelJudge({
    candidates: policyCandidates,
    declaredDomain,
    judge: input.admissionLabelJudge
  });

  // CEPs are extracted for every admitted core or optional proposal when possible.
  // Only core proposals publish as asserted Concepts; optional incomplete profiles
  // remain run-scoped evidence for later source-mentioned rescue.
  const admittedCandidates = candidates.filter(
    (candidate) => candidate.admission.tier === "core" || candidate.admission.tier === "optional"
  );
  const admittedConcepts = admittedCandidates.map((candidate) => ({
    candidateKey: candidate.candidateKey,
    canonicalLabel: candidate.canonicalLabel,
    aliases: exactAliases(candidate)
  }));
  const admittedKeys = new Set(admittedCandidates.map((candidate) => candidate.candidateKey));
  const conceptsByKey = new Map<string, { canonicalLabel: string; aliases: string[] }>(
    admittedConcepts.map((concept) => [concept.candidateKey, { canonicalLabel: concept.canonicalLabel, aliases: concept.aliases }])
  );
  const coreKeys = new Set(candidates.filter((candidate) => candidate.admission.tier === "core").map((candidate) => candidate.candidateKey));

  // Stage 3 — concept-conditioned CEP extraction with deterministic verbatim
  // validation. One bounded call per admitted Concept; an extractor failure yields
  // an empty (incomplete) profile so the run fails closed rather than publishing a
  // Concept with no source-grounded meaning.
  const rawProfiles = await mapWithConcurrency(admittedCandidates, CEP_EXTRACTION_CONCURRENCY, async (subject) => {
    const extracted = await input.evidenceProfileExtraction
      .extract({
        document,
        declaredDomain,
        subject: {
          candidateKey: subject.candidateKey,
          canonicalLabel: subject.canonicalLabel,
          aliases: exactAliases(subject)
        },
        admittedConcepts,
        evidenceNeighborhood: evidenceNeighborhood(document, subject)
      })
      .catch(() => ({ definitions: [], mentions: [], assertions: [] }));
    return applyEvidenceProfilePolicy({
      candidateKey: subject.candidateKey,
      tier: subject.admission.tier,
      profile: extracted,
      admittedKeys,
      blockText,
      maxMentionsPerConceptPerSource
    });
  });

  // Stage 4 — neural acceptance of optional typed assertions only.
  const evidenceProfiles: RunEvidenceProfile[] = await applyAssertionEntailmentJudge({
    profiles: rawProfiles,
    declaredDomain,
    conceptsByKey,
    judge: input.assertionEntailmentJudge
  });

  // The run is successful only when every core Concept has a complete CEP (R1).
  // Optional proposals may be source-mentioned supporting knowledge without a
  // Definition Passage; they stay run-scoped and never publish asserted.
  const status: ExtractionRunResult["status"] =
    [...coreKeys].every((key) => evidenceProfiles.some((profile) => profile.candidateKey === key && profile.complete))
      ? "succeeded"
      : "failed";

  const runResult: ExtractionRunResult = {
    runId: input.runId,
    sourceResourceId: input.source.sourceResourceId,
    sourceDocumentId: input.source.sourceDocumentId,
    declaredDomain,
    pipelineConfigHash: input.pipelineConfigHash,
    maxMentionsPerConceptPerSource,
    candidates,
    evidenceProfiles,
    status,
    latencyMs: Date.now() - startedAt
  };

  const artifact: ArtifactEnvelope<ExtractionRunResult> = {
    artifactId: `${input.runId}:run`,
    artifactType: EXTRACTION_RUN_ARTIFACT_TYPE,
    schemaVersion: EXTRACTION_RUN_SCHEMA_VERSION,
    runId: input.runId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: input.pipelineConfigHash,
    createdAt: new Date().toISOString(),
    payload: runResult
  };

  // Persist the run, its normalized CEP evidence, and the immutable artifact in one
  // transaction (R: no authoritative relational state without its artifact).
  await input.store.persist(runResult, artifact);
  return runResult;
}

function exactAliases(candidate: RunCandidate): string[] {
  return [...new Set([candidate.discoveredLabel, candidate.canonicalLabel, ...candidate.aliases])];
}

// Bounded so a large source cannot fan out unbounded parallel LLM calls through the proxy.
const CEP_EXTRACTION_CONCURRENCY = 4;

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
// text contains the concept label. Scoped to extractable body blocks so a CEP can
// never cite references, appendices, captions, or table/figure placeholders.
function evidenceNeighborhood(document: StructuredDocument, subject: RunCandidate) {
  const mentionBlockIds = new Set(subject.mentions.map((mention) => mention.blockId));
  const label = subject.canonicalLabel.toLowerCase();
  return extractableBlocks(document.blocks).filter((block) => mentionBlockIds.has(block.blockId) || block.text.toLowerCase().includes(label));
}
