import {
  DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG,
  selectEvidenceNeighborhood,
  STAGE_TAGS,
  type ArtifactEnvelope,
  type EvidenceNeighborhoodConfig,
  type ExtractionRunResult,
  type RunCandidate,
  type RunEvidenceProfile,
  type StructuredDocument
} from "@lrnki/domain-core";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  ConceptDiscoveryPort,
  DefinitionPassageQualityJudgmentPort,
  ExtractionRunStorePort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { admitSource } from "./admitSource";
import { bracketStage, NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
import { applyAssertionEntailmentJudge } from "./applyAssertionEntailmentJudge";
import { applyDefinitionPassageQualityJudge } from "./applyDefinitionPassageQualityJudge";
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
  definitionPassageQualityJudge: DefinitionPassageQualityJudgmentPort;
  store: ExtractionRunStorePort;
  // Optional run-progress reporter seam (ADR-0029). Absent → no-op, so the run behaves
  // byte-identically to its pre-instrumentation self.
  reporter?: RunProgressReporterPort;
}): Promise<ExtractionRunResult> {
  const startedAt = Date.now();
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.runId;
  return runWithOperationTag(operationId, async () => {
  const { document, declaredDomain } = input.source;

  // Bracket each stage onto the timeline; a thrown stage marks the operation failed and
  // propagates, so a failed run leaves a readable timeline without a whole-body try.
  const runStage = bracketStage(reporter, operationId);

  // The parent `running` row exists from entry — the fix for "no row until done".
  await reporter.beginOperation({ operationType: "extraction", operationId });

  const maxMentionsPerConceptPerSource = input.maxMentionsPerConceptPerSource ?? DEFAULT_MAX_MENTIONS_PER_CONCEPT_PER_SOURCE;
  const evidenceNeighborhoodConfig = input.evidenceNeighborhoodConfig ?? DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG;
  const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));

  // Stage 1 — recall-oriented Candidate Discovery.
  const discovered = await runStage(STAGE_TAGS.conceptDiscovery, () =>
    input.discovery.discover({ document, declaredDomain })
  );

  // Stage 2 — precision-first Concept Admission (separate prompt, never collapsed).
  // `admitSource` owns the whole-source admission decision: fail-closed cross-atom
  // resolution (R13 split atoms), the deterministic per-atom boundary, and the neural
  // concept-vs-proposition downgrade (ADR-0005). Tier reconciliation against CEP
  // completeness runs AFTER extraction (`reconcileUngroundableCores`).
  // One wall-clock bracket for the admission phase. The nested admission-label-judge
  // LLM call (inside admitSource) is attributed its own LiteLLM spend tag; U7 surfaces
  // that cost even though it shares this stage's wall-clock.
  const candidates = await runStage(STAGE_TAGS.admission, async () => {
    const admissionProposals = await input.admission.admit({ document, declaredDomain, candidates: discovered });
    return admitSource({
      discovered,
      admissionProposals,
      blockText,
      declaredDomain,
      labelJudge: input.admissionLabelJudge
    });
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
  // Heartbeat (R3): one write per admitted Concept as its profile resolves, so the
  // longest extraction stage shows N-of-M liveness without waiting for a boundary.
  // Bounded to one write per completed item by CEP_EXTRACTION_CONCURRENCY.
  let cepCompleted = 0;
  const rawProfiles = await runStage(
    STAGE_TAGS.cepExtraction,
    () =>
      mapWithConcurrency(admittedCandidates, CEP_EXTRACTION_CONCURRENCY, async (subject) => {
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
        const profile = applyEvidenceProfilePolicy({
          candidateKey: subject.candidateKey,
          tier: subject.admission.tier,
          profile: extracted,
          admittedKeys,
          blockText,
          maxMentionsPerConceptPerSource
        });
        cepCompleted += 1;
        await reporter.recordProgress({ operationId, stage: STAGE_TAGS.cepExtraction, done: cepCompleted });
        return profile;
      }),
    admittedCandidates.length
  );

  // Stage 3b — Definition-Passage quality judge (ADR-0007 extension). Runs on the
  // already-verbatim-verified core definitions, drops hollow passages (bare name,
  // heading, title, citation), and recomputes `complete`. The recomputed flag flows
  // naturally into reconciliation below; a vetoed last definition adds its key to
  // `hollowDefinitionKeys`, which selects the distinct demotion reason code. Block
  // structure is passed only as judge CONTEXT (KTD7), never as a deterministic gate.
  const blockContextById = new Map(
    document.blocks.map((block) => [block.blockId, { blockType: block.blockType, headingPath: block.headingPath }] as const)
  );
  const definitionQuality = await runStage(STAGE_TAGS.definitionPassageQuality, () =>
    applyDefinitionPassageQualityJudge({
      profiles: rawProfiles,
      declaredDomain,
      conceptsByKey,
      blockContextById,
      judge: input.definitionPassageQualityJudge
    })
  );

  // Stage 4 — neural acceptance of optional typed assertions only.
  const evidenceProfiles: RunEvidenceProfile[] = await runStage(STAGE_TAGS.assertionEntailment, () =>
    applyAssertionEntailmentJudge({
      profiles: definitionQuality.profiles,
      declaredDomain,
      conceptsByKey,
      judge: input.assertionEntailmentJudge
    })
  );

  // Post-CEP tier reconciliation: a core whose CEP came back incomplete is demoted to
  // optional. Pure/immutable, so `admission.tier` has a single writer in this phase.
  // Keys whose LAST definition was vetoed as hollow carry the distinct reason code.
  const reconciled = reconcileUngroundableCores({
    candidates,
    evidenceProfiles,
    coreKeys,
    hollowDefinitionKeys: definitionQuality.hollowDefinitionKeys
  });
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
    definitionQualityDispositions: definitionQuality.dispositions,
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
  // transaction (R: no authoritative relational state without its artifact). Timed as
  // a non-LLM stage (wall-clock only, never appears in the cost half of the R5 join).
  await runStage(NON_LLM_STAGES.persist, () => input.store.persist(runResult, artifact));

  await reporter.completeOperation({ operationId, status: "succeeded" });
  return runResult;
  });
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
