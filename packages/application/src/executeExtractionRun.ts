import {
  DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG,
  selectEvidenceNeighborhood,
  type ArtifactEnvelope,
  type EvidenceNeighborhoodConfig,
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
import { admitSource } from "./admitSource";
import { applyAssertionEntailmentJudge } from "./applyAssertionEntailmentJudge";
import { applyEvidenceProfilePolicy } from "./applyEvidenceProfilePolicy";
import { detectExtractionQualityIssues } from "./detectExtractionQualityIssues";
import { reconcileUngroundableCores } from "./reconcileUngroundableCores";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.5.0";
const EXTRACTION_RUN_ARTIFACT_TYPE = "extraction_run";

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
  evidenceNeighborhoodConfig?: EvidenceNeighborhoodConfig;
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
  const evidenceNeighborhoodConfig = input.evidenceNeighborhoodConfig ?? DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG;
  const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await input.discovery.discover({ document, declaredDomain });

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  // `admitSource` owns the whole-source admission decision: fail-closed cross-atom
  // resolution (R13 split atoms), the deterministic per-atom boundary, and the neural
  // concept-vs-proposition downgrade (ADR-0005). Tier reconciliation against CEP
  // completeness runs AFTER extraction (`reconcileUngroundableCores`).
  const admissionProposals = await input.admission.admit({ document, declaredDomain, candidates: discovered });
  const candidates = await admitSource({
    discovered,
    admissionProposals,
    blockText,
    declaredDomain,
    labelJudge: input.admissionLabelJudge
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
    const aliases = exactAliases(subject);
    const extracted = await input.evidenceProfileExtraction
      .extract({
        document,
        declaredDomain,
        subject: {
          candidateKey: subject.candidateKey,
          canonicalLabel: subject.canonicalLabel,
          aliases
        },
        admittedConcepts,
        evidenceNeighborhood: evidenceNeighborhood(document, subject, aliases, evidenceNeighborhoodConfig),
        // Carry admission's verified definition-bearing passages into extraction as a
        // hint (U2/KTD2). Core only — optional subjects never gate on this criterion,
        // so they carry no definition hint and behave exactly as before.
        definitionBearingEvidence:
          subject.admission.tier === "core" ? subject.admission.definitionBearingTreatment.evidence : []
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

  // Post-CEP tier reconciliation: a core whose CEP came back incomplete is demoted to
  // optional. Pure/immutable, so `admission.tier` has a single writer in this phase.
  const reconciled = reconcileUngroundableCores({ candidates, evidenceProfiles, coreKeys });
  const remainingCoreCount = reconciled.candidates.filter((candidate) => candidate.admission.tier === "core").length;

  const runResult: ExtractionRunResult = {
    runId: input.runId,
    sourceResourceId: input.source.sourceResourceId,
    sourceDocumentId: input.source.sourceDocumentId,
    declaredDomain,
    pipelineConfigHash: input.pipelineConfigHash,
    maxMentionsPerConceptPerSource,
    candidates: reconciled.candidates,
    evidenceProfiles: reconciled.evidenceProfiles,
    qualityIssues: [],
    status: "succeeded",
    degraded: reconciled.demotedCoreCount > 0 && remainingCoreCount === 0,
    latencyMs: Date.now() - startedAt
  };
  runResult.qualityIssues = detectExtractionQualityIssues(runResult);

  const artifact: ArtifactEnvelope<ExtractionRunResult> = {
    artifactId: `${input.runId}:run`,
    artifactType: EXTRACTION_RUN_ARTIFACT_TYPE,
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

function evidenceNeighborhood(document: StructuredDocument, subject: RunCandidate, labels: string[], config: EvidenceNeighborhoodConfig) {
  return selectEvidenceNeighborhood(
    document.blocks,
    {
      mentionBlockIds: new Set(subject.mentions.map((mention) => mention.blockId)),
      labels
    },
    config
  );
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
