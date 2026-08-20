import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_TAGS, type ConceptIdentityDecision } from "@lrnki/domain-core";
import {
  buildGraphVersion,
  createSourceLessGroundingAdmission,
  createIntrinsicDifficultyPort,
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG,
  resolveConceptIdentity,
  runExtractionOverSources,
  type ExtractionSourceUnit,
  generateStudyItemBank,
  synthesizeResponses,
  runGraphEnrichment,
  runSyntheticGeneration,
  costTimingReport,
  rankBottleneckTargets,
  type CostTimingReport,
  type RankedTarget,
  calibrateKnowledgeBoundaryProbe,
  parseKnowledgeBoundaryLadder,
  auditDiscoveryCoverage,
  type DiscoveryCoverageAuditReport,
  auditScaffoldContent,
  type ScaffoldContentAuditReport
} from "@lrnki/application";
import { identityCandidatesFromBuildInputs } from "./identityCandidateMapping";
import { parseGenerateStudyItemsArgs } from "./workerArgs";
import {
  DoclingStructuredDocumentParser,
  HtmlStructuredDocumentParser,
  MarkdownStructuredDocumentParser,
  StructuredDocumentParserRegistry,
  TextStructuredDocumentParser
} from "@lrnki/infrastructure-ingestion";
import {
  createAdmissionLabelJudgmentPort,
  createAssertionEntailmentJudgmentPort,
  createDefinitionPassageQualityJudgmentPort,
  createEvidenceProfileExtractionPort,
  createConceptAdmissionPort,
  createStudyItemGenerationPort,
  createConceptLessonGenerationPort,
  createConceptLessonRedundancyJudgmentPort,
  createLayerPurposeGenerationPort,
  createStudyItemBlueprintPort,
  createAnswerKeyVerificationPort,
  createMatchingAssignmentVerificationPort,
  createConceptDiscoveryPort,
  createDiscoveryCoverageAuditPort,
  createScaffoldContentCongruencePort,
  LiteLlmForcedToolClient,
  LiteLlmSpendLogsReadAdapter,
  LiteLlmNodeEmbeddingAdapter,
  createNodeMergeAdjudicationPort,
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
  createGroundingGenerationPort,
  createConceptSetSynthesisPort,
  createKnowledgeBoundaryProbePort,
  createIntrinsicDifficultyJudgmentPort,
  createMissingPrerequisiteProposalPort,
  createMintingDurabilityJudgmentPort,
  createRescueDurabilityJudgmentPort,
  createRescuedNodeLabelingPort,
  createPrerequisiteOrderingPort,
  createNeuralClients,
  resolveNeuralClientBaseOptions,
  extractionConfigHash,
  studyItemBankConfigHash,
  withGraphEnrichmentConfigHash,
  withSyntheticGenerationConfigHash
} from "@lrnki/infrastructure-litellm";
import {
  PostgresArtifactRepository,
  PostgresEnrichmentRunStore,
  PostgresExtractionRunStore,
  PostgresStudyItemBankStore,
  PostgresLearnerScaffoldStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentLayerPurposeStore,
  PostgresResponseLogStore,
  PostgresCalibrationVerdictStore,
  PostgresGraphVersionStore,
  PostgresSourceRegistrationStore,
  PostgresRunProgressReporter,
  PostgresOperationTimelineRead,
  PostgresJourneyLineageRead,
  PostgresInspectionRead,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

import { existsSync } from "node:fs";

// pnpm runs this with cwd at the app dir, so walk up to find the repo root
// (the dir holding pnpm-workspace.yaml) and resolve .env / fixtures against it.
function findRepoRoot(): string {
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
  }
  return process.cwd();
}
const REPO_ROOT = findRepoRoot();
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env"));
} catch {
  // .env is optional; rely on the ambient environment otherwise.
}

function buildContext() {
  const sql = createDatabaseClient();
  const registrationStore = new PostgresSourceRegistrationStore(sql);
  const runStore = new PostgresExtractionRunStore(sql);
  // Run-progress reporter (ADR-0029): its own autocommit writes on the shared `sql`
  // handle, never enlisted in a store's persist transaction, drive the durable
  // timeline that the live progress view and cost & timings report read.
  const runProgressReporter = new PostgresRunProgressReporter(sql);
  const graphStore = new PostgresGraphVersionStore(sql);
  const artifacts = new PostgresArtifactRepository(sql);
  const parsers = new StructuredDocumentParserRegistry([
    new MarkdownStructuredDocumentParser(),
    new HtmlStructuredDocumentParser(),
    new TextStructuredDocumentParser(),
    // Mixed-format ingestion (Gate 2, ADR-0013). The image tag is pinned in the
    // parser config hash so the layout contract is reproducible across the
    // curated source suite; bump DOCLING_IMAGE_TAG when docker/Dockerfile changes.
    new DoclingStructuredDocumentParser({
      baseUrl: process.env.DOCLING_BASE_URL ?? "http://localhost:5001",
      imageTag: process.env.DOCLING_IMAGE_TAG ?? "docling-serve-cpu-v1.23.0+docling-2.102.1"
    })
  ]);
  // Client-construction policy (env base config + discovery/deterministic/probe/
  // embedding sampling decisions and their rationale) lives once in createNeuralClients,
  // shared with the Admin Lab learner generation root.
  const { discoveryClient, deterministicClient, probeClient, embeddingClient } = createNeuralClients();
  const groundingGeneration = createGroundingGenerationPort(deterministicClient);
  const knowledgeBoundaryProbe = createKnowledgeBoundaryProbePort(probeClient);
  const nodeEmbedding = new LiteLlmNodeEmbeddingAdapter(embeddingClient);
  const graphConfig = withGraphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG);
  const syntheticConfig = withSyntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG);
  const sourceLessGroundingAdmission = createSourceLessGroundingAdmission({
    knowledgeBoundaryProbe,
    embedding: nodeEmbedding,
    groundingGeneration,
    claimVerificationQuestionPlanning: createClaimVerificationQuestionPlanningPort(deterministicClient),
    claimVerificationAnswering: createClaimVerificationAnsweringPort(deterministicClient),
    claimFactualityJudgments: [
      createClaimFactualityJudgmentPort(deterministicClient),
      createClaimFactualityChallengePort(deterministicClient)
    ],
    policy: graphConfig.sourceLessGroundingAdmission
  });
  const spendLogsRead = process.env.LITELLM_DATABASE_URL
    ? new LiteLlmSpendLogsReadAdapter(process.env.LITELLM_DATABASE_URL)
    : undefined;
  return {
    sql,
    registrationStore,
    runStore,
    runProgressReporter,
    // Cost & timings read surfaces: the per-operation timeline read-model and
    // the live LiteLLM /spend/tags reader. The report use-case joins them; cost is read
    // live and never stored (ADR-0029).
    operationTimelineRead: new PostgresOperationTimelineRead(sql),
    journeyLineageRead: new PostgresJourneyLineageRead(sql),
    operationStageSpendRead: spendLogsRead ?? {
      async readOperationStageSpend() {
        throw new Error("LITELLM_DATABASE_URL is required for cost reporting.");
      }
    },
    spendLogsRead,
    graphStore,
    artifacts,
    parsers,
    // Inspection read model (ADR-0027): the discovery-coverage audit reads the run's
    // admitted set and the source's teachable blocks through the same read ports the
    // Admin Lab uses — no bespoke SQL in the measurement path.
    inspectionRead: new PostgresInspectionRead(sql),
    // Discovery-coverage audit judge (plan 2026-07-10-004 KTD1): cross-family
    // independent judge on the MODERATE-temperature client — the K samples need
    // sampling diversity for recurrence to separate stable judgments from judge
    // noise (ADR-0028); greedy decoding would collapse the draws.
    discoveryCoverageAudit: createDiscoveryCoverageAuditPort(probeClient),
    // Scaffold-content congruence audit (plan 2026-07-16-001 KTD1/KTD3): the read seam over
    // persisted generated Support Steps plus the SAME cross-family independent judge on the
    // MODERATE-temperature client — the K samples need sampling diversity for recurrence to
    // separate stable label↔content mismatches from judge noise (ADR-0028).
    scaffoldStore: new PostgresLearnerScaffoldStore(sql),
    scaffoldContentCongruence: createScaffoldContentCongruencePort(probeClient),
    discovery: createConceptDiscoveryPort(discoveryClient),
    admission: createConceptAdmissionPort(deterministicClient),
    evidenceProfileExtraction: createEvidenceProfileExtractionPort(deterministicClient),
    // Assertion-entailment judge (ADR-0007 reset). Independent production judge
    // (kg-independent-judge) so the judge is not the extractor
    // re-grading itself; deterministic decoding for stable re-derivation. Guards
    // only the optional typed assertions inside a Concept Evidence Profile.
    assertionEntailmentJudge: createAssertionEntailmentJudgmentPort(deterministicClient),
    // Concept-vs-proposition admission judge (ADR-0005). Same independent
    // production judge (kg-independent-judge) and deterministic decoding;
    // downgrade-only stage that replaces the removed looksLikePropositionLabel veto.
    admissionLabelJudge: createAdmissionLabelJudgmentPort(deterministicClient),
    // Definition-Passage quality judge (ADR-0007 extension). Same independent
    // production judge (kg-independent-judge) and deterministic decoding; runs after
    // the verbatim floor and drops hollow Definition Passages (bare name, heading,
    // title, citation), routing a last-passage veto into the existing demotion with a
    // distinct reason code.
    definitionPassageQualityJudge: createDefinitionPassageQualityJudgmentPort(deterministicClient),
    // Graph Enrichment ports (ADR-0019 amended — whole-set ordering, plan U5). ONE
    // kg-prerequisite-ordering call per Declared Domain returns the directed prerequisite
    // DAG over the deduplicated node set; it is cross-family from the proposal and grounding
    // generators (ADR-0023), so a single judge
    // never grades its own minted output and the per-pair routing split is gone.
    // Deterministic decoding for stable re-derivation. Difficulty is learner-neutral
    // intrinsic: a cross-family neural subscore fused with deterministic components.
    prerequisiteOrdering: createPrerequisiteOrderingPort(deterministicClient),
    // Node-minting identity proposal plus the finished source-less admission module below.
    // The raw grounding generator is construction-only and cannot bypass admission here.
    missingPrerequisiteProposal: createMissingPrerequisiteProposalPort(deterministicClient),
    // Synthetic topic generation, second pipeline arm (plan 2026-06-30-001, ADR-0019
    // amended). Concept-set synthesis stays on the production extractor family with deterministic
    // decoding for a stable concept set (AGENTS rule 5); the knowledge-boundary probe rides the
    // MODERATE-temperature cross-family client so its K draws disperse at the model's
    // knowledge boundary (KTD4).
    conceptSetSynthesis: createConceptSetSynthesisPort(deterministicClient),
    knowledgeBoundaryProbe,
    sourceLessGroundingAdmission,
    graphConfig,
    syntheticConfig,
    // Measured rescue durability judge (U3): cross-family independent judge
    // (kg-independent-judge) decides whether each aggregated source_mentioned rescue
    // candidate is a durable prerequisite before it becomes a derived node. Drop-only,
    // fail-open-with-flag; the generator never grades rescue durability.
    rescueDurabilityJudge: createRescueDurabilityJudgmentPort(deterministicClient),
    // Measured Rescued-Node Canonical Labeling step (TODO #1): the SAME cross-family
    // independent judge (kg-independent-judge) re-names each durable rescued node — labeled
    // with the source sentence it was mentioned in — to a concept-shaped label, one whole-set
    // call per Declared Domain. Rename-only; minting owns adoption (collision guard + alias).
    rescuedNodeLabelingJudge: createRescuedNodeLabelingPort(deterministicClient),
    // Rescue-seam Definition-Passage quality judge (plan 2026-06-26-001 U3). The SAME
    // independent meaning judge (kg-independent-judge) and deterministic decoding as the
    // extraction-time core gate — no new alias — but tagged `rescue-definition-quality` so
    // its spend joins the enrichment operation (ADR-0029). Drops hollow rescued optional
    // definitions before they reach study items; fails closed = preserve.
    rescuedDefinitionQualityJudge: createDefinitionPassageQualityJudgmentPort(deterministicClient, STAGE_TAGS.rescueDefinitionQuality),
    // Measured minting durability judge: cross-family independent judge gates every
    // reserved assumed-prerequisite proposal before source-less admission. Drop-only,
    // fail-open-with-flag; the enabled minting path requires this dependency.
    mintingDurabilityJudge: createMintingDurabilityJudgmentPort(deterministicClient),
    // Semantic-dedup ports (plan U1/U2, AGENTS rule 20). Embeddings PROPOSE within-domain
    // near-duplicate pairs (kg-node-embedding); a cross-family adjudicator DECIDES each
    // merge (kg-independent-judge, deterministic decoding), so the generation family
    // never decides its own merges. Both opt-in: enrich
    // without them for the U7 baseline.
    nodeEmbedding,
    nodeMergeAdjudicator: createNodeMergeAdjudicationPort(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(createIntrinsicDifficultyJudgmentPort(deterministicClient), DEFAULT_ENRICHMENT_CONFIG.difficultySampleCount),
    enrichmentStore: new PostgresEnrichmentRunStore(sql),
    // Learner Study Loop (ADR-0026): option-select study-item generation stays on the
    // production generation alias. Deterministic decoding for stable re-derivation.
    // The Concept Lesson substrate (ADR-0031) is generated in the same operation, before
    // option-select, and persisted through its own store; option-select derives FROM it.
    conceptLessonGeneration: createConceptLessonGenerationPort(deterministicClient),
    conceptLessonRedundancyJudge: createConceptLessonRedundancyJudgmentPort(deterministicClient),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    layerPurposeGeneration: createLayerPurposeGenerationPort(deterministicClient),
    layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
    studyItemBlueprint: createStudyItemBlueprintPort(deterministicClient),
    studyItemGeneration: createStudyItemGenerationPort(deterministicClient),
    answerKeyVerification: createAnswerKeyVerificationPort(deterministicClient),
    matchingAssignmentVerification: createMatchingAssignmentVerificationPort(deterministicClient),
    studyItemBankStore: new PostgresStudyItemBankStore(sql),
    responseLogStore: new PostgresResponseLogStore(sql),
    // Mutable calibration verdict store (R10): the synthetic prefill seeds verdicts here,
    // separate from the append-only graded log.
    verdictStore: new PostgresCalibrationVerdictStore(sql)
  };
}

type Context = ReturnType<typeof buildContext>;
type Manifest = { fixtures: { path: string; contentType: string; declaredDomain: string; title: string; source?: string; license?: string }[] };

const DEFAULT_BOUNDARY_PROBE_CALIBRATION_DIR = "tmp/2026-07-07-boundary-probe-calibration";
const DEFAULT_BOUNDARY_PROBE_DEPLOYMENTS = [
  "openrouter/meta-llama/llama-4-scout",
  "openrouter/qwen/qwen3-30b-a3b-instruct-2507"
];

async function registerFromManifest(ctx: Context, manifestPath: string) {
  const manifest = JSON.parse(await readFile(path.resolve(REPO_ROOT, manifestPath), "utf8")) as Manifest;
  for (const fixture of manifest.fixtures) {
    const bytes = new Uint8Array(await readFile(path.resolve(REPO_ROOT, fixture.path)));
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const existing = await ctx.registrationStore.findByContentHash(contentHash);
    if (existing) {
      console.log(`= already registered: ${fixture.title} -> ${existing.sourceResourceId}`);
      continue;
    }
    const document = await ctx.parsers.parserFor(fixture.contentType).parse({ sourceResourceId: randomUUID(), bytes, contentType: fixture.contentType });
    const registered = await ctx.registrationStore.register({
      contentHash,
      contentType: fixture.contentType,
      objectKey: `fixtures/${path.basename(fixture.path)}`,
      declaredDomain: fixture.declaredDomain,
      title: fixture.title,
      sourceUri: fixture.source,
      license: fixture.license,
      document
    });
    console.log(`+ registered: ${fixture.title} [${fixture.declaredDomain}] blocks=${document.blocks.length} -> ${registered.sourceResourceId}`);
  }
}

async function runExtraction(ctx: Context, sourceResourceId?: string) {
  const sources = sourceResourceId ? [{ sourceResourceId }] : await ctx.registrationStore.listSources();
  // Resolve each registered source into an extraction unit (skipping any that vanished),
  // then drive them through the shared parallel-ready seam (U6/R11). Degree defaults to 1,
  // so the run stays strictly sequential; the per-unit start/complete callbacks keep the
  // exact per-source logging the prior loop emitted.
  const units: ExtractionSourceUnit[] = [];
  for (const { sourceResourceId: id } of sources) {
    const source = await ctx.registrationStore.getRegisteredSource(id);
    if (!source) {
      console.error(`! source not found: ${id}`);
      continue;
    }
    units.push({ runId: randomUUID(), source });
  }
  await runExtractionOverSources({
    units,
    pipelineConfigHash: extractionConfigHash(),
    discovery: ctx.discovery,
    admission: ctx.admission,
    evidenceProfileExtraction: ctx.evidenceProfileExtraction,
    assertionEntailmentJudge: ctx.assertionEntailmentJudge,
    admissionLabelJudge: ctx.admissionLabelJudge,
    definitionPassageQualityJudge: ctx.definitionPassageQualityJudge,
    store: ctx.runStore,
    reporter: ctx.runProgressReporter,
    onRunStart: (unit) => console.log(`\n>> extraction run ${unit.runId} for ${unit.source.sourceResourceId} [${unit.source.declaredDomain}]`),
    onRunComplete: (_unit, result) => {
      const core = result.candidates.filter((candidate) => candidate.admission.tier === "core").length;
      const profiles = result.evidenceProfiles;
      const incomplete = profiles.filter((profile) => !profile.complete).length;
      const definitions = profiles.reduce((sum, profile) => sum + profile.definitions.length, 0);
      const mentions = profiles.reduce((sum, profile) => sum + profile.mentions.length, 0);
      const assertions = profiles.reduce((sum, profile) => sum + profile.assertions.length, 0);
      console.log(`   status=${result.status} candidates=${result.candidates.length} core=${core} CEPs=${profiles.length}(incomplete=${incomplete}) defs=${definitions} mentions=${mentions} assertions=${assertions} latency=${result.latencyMs}ms`);
    }
  });
}

async function buildVersion(ctx: Context, args: string[]) {
  // Publication selects Extraction Runs explicitly by id. A run passing the
  // mechanical/evidence gates ('succeeded') is not automatically publishable —
  // the operator must name the runs they inspected and judged sound, so a
  // semantically-bad-but-valid run never silently mutates the graph (AGENTS
  // rule 11; ADR-0017 builds are a pure function of the base version + runs).
  // `--base <graphVersionId>` extends a published version, unioning its CEP
  // evidence with the newly selected runs (ADR-0007 reset R3); omit it for the
  // initial build.
  let baseGraphVersionId: string | null = null;
  const runIds: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base") { baseGraphVersionId = args[++i] ?? null; continue; }
    runIds.push(args[i]);
  }
  if (runIds.length === 0) {
    console.error("! build-graph-version requires one or more explicit run IDs (no automatic 'latest succeeded' selection).");
    console.error("  Inspect runs first, then: worker:kg build-graph-version [--base <graphVersionId>] <runId> [<runId> ...]");
    process.exitCode = 1;
    return;
  }
  const graphVersionId = randomUUID();

  // Semantic identity resolution before the build (plan 2026-06-26-002). The model calls
  // live here; the build consumes the decisions and stays LLM-free (KTD1, R8). Opt out
  // with BUILD_DISABLE_IDENTITY_RESOLUTION to reproduce the exact-label baseline for the
  // U5 calibration comparison (KTD7), mirroring ENRICH_DISABLE_DEDUP. The base snapshot
  // and runs are read again here; the build re-reads them internally — both are
  // deterministic reads that keep the build a self-contained pure function (KTD1).
  let identityDecisions: ConceptIdentityDecision[] = [];
  if (!process.env.BUILD_DISABLE_IDENTITY_RESOLUTION) {
    const runs = await ctx.runStore.runsForBuildByIds(runIds);
    const base = baseGraphVersionId ? await ctx.graphStore.getPublishedSnapshot(baseGraphVersionId) : undefined;
    const existingIdentities = await ctx.graphStore.existingConceptIdentities();
    const candidates = identityCandidatesFromBuildInputs({ runs, base, existingIdentities });
    let unavailable = 0;
    const result = await resolveConceptIdentity({
      candidates,
      embedding: ctx.nodeEmbedding,
      adjudicator: ctx.nodeMergeAdjudicator,
      onUnavailable: () => { unavailable++; }
    });
    identityDecisions = result.decisions;
    const count = (outcome: ConceptIdentityDecision["outcome"]) => identityDecisions.filter((decision) => decision.outcome === outcome).length;
    // One-line resolution summary mirroring the dedup/ordering lines. A case-B
    // quarantine surfaces here as quarantine>0 and the build below then refuses with a
    // named-collision error (R7).
    console.log(`   identity: merges=${count("merge")} distinct=${count("distinct")} quarantine=${count("quarantine")} unavailable=${unavailable}`);
  }

  const snapshot = await buildGraphVersion({ graphVersionId, baseGraphVersionId, runIds, runStore: ctx.runStore, graphStore: ctx.graphStore, reporter: ctx.runProgressReporter, identityDecisions });
  const passages = snapshot.evidenceProfiles.reduce((sum, profile) => sum + profile.definitions.length + profile.mentions.length, 0);
  const assertions = snapshot.evidenceProfiles.reduce((sum, profile) => sum + profile.assertions.length, 0);
  console.log(`\n>> published graph version ${graphVersionId}${baseGraphVersionId ? ` (base ${baseGraphVersionId})` : ""} from ${runIds.length} run(s): concepts=${snapshot.concepts.length} CEP-passages=${passages} assertions=${assertions} edges=0`);
}

async function enrichGraphVersion(ctx: Context, graphVersionId?: string) {
  // Graph Enrichment is the third operation (ADR-0019): published version +
  // enrichment config -> immutable Derived Graph Layer. It never mutates the
  // asserted core. Default to the latest published version when none is named.
  let targetVersionId = graphVersionId;
  if (!targetVersionId) {
    const snapshot = await ctx.graphStore.getLatestPublishedSnapshot();
    if (!snapshot) {
      console.error("! no published graph version to enrich.");
      process.exitCode = 1;
      return;
    }
    targetVersionId = snapshot.graphVersionId;
  }
  const enrichmentId = randomUUID();
  console.log(`\n>> graph enrichment ${enrichmentId} over version ${targetVersionId}`);
  const layer = await runGraphEnrichment({
    enrichmentId,
    graphVersionId: targetVersionId,
    graphStore: ctx.graphStore,
    prerequisiteOrdering: ctx.prerequisiteOrdering,
    missingPrerequisiteProposal: ctx.missingPrerequisiteProposal,
    sourceLessGroundingAdmission: ctx.sourceLessGroundingAdmission,
    rescueDurabilityJudge: ctx.rescueDurabilityJudge,
    rescuedNodeLabelingJudge: ctx.rescuedNodeLabelingJudge,
    rescuedDefinitionQualityJudge: ctx.rescuedDefinitionQualityJudge,
    mintingDurabilityJudge: ctx.mintingDurabilityJudge,
    // Dedup is opt-in (plan U3): ENRICH_DISABLE_DEDUP unsets both ports to produce the
    // exact-label baseline run for the U7 rule-14 comparison (same command, ports unset).
    nodeEmbedding: process.env.ENRICH_DISABLE_DEDUP ? undefined : ctx.nodeEmbedding,
    nodeMergeAdjudicator: process.env.ENRICH_DISABLE_DEDUP ? undefined : ctx.nodeMergeAdjudicator,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore,
    config: ctx.graphConfig,
    // Per-sub-stage wall-clock now lands in the durable operation_run_stages timeline
    // via the reporter (ADR-0029) — supersedes the old onStageTiming stdout sink.
    reporter: ctx.runProgressReporter,
    // Dedup outcome line (plan U3, R13): how many near-duplicate nodes collapsed and how
    // many propose/decide calls failed closed (no merge), so an operator sees the pass ran.
    onDedupSummary: (summary) => console.log(`   dedup: merges=${summary.merges} unavailable=${summary.unavailable}`),
    onMintingSummary: (summary) => console.log(`   minting: accepted=${summary.accepted} dropped=${summary.dropped} unavailable=${summary.unavailable}`),
    // K-sampling ordering outcome line (plan U5): K draws per domain, how many edges were
    // committed at consensus confidence, routed to uncertain as direction-contested, cut
    // below the presence quorum, or routed for an aggregate cycle.
    onOrderingSummary: (summary) => console.log(`   ordering: k=${summary.k} committed=${summary.committed} contested=${summary.contested} weakCut=${summary.weakCut} cycleRouted=${summary.cycleRouted}`)
  });
  const anchorNodes = layer.derivedNodes.filter((node) => node.nodeKind === "anchor").length;
  const enrichmentNodeCount = layer.derivedNodes.length - anchorNodes;
  console.log(`   nodes(anchor/enrichment)=${anchorNodes}/${enrichmentNodeCount}`);
  const certain = layer.prerequisiteEdges.filter((edge) => !edge.uncertain).length;
  const uncertain = layer.prerequisiteEdges.length - certain;
  console.log(
    `   edges(certain/uncertain)=${certain}/${uncertain} difficulties=${layer.difficulties.length} judge=${layer.judgeModel}`
  );
  for (const edge of layer.prerequisiteEdges.filter((e) => !e.uncertain)) {
    console.log(`   edge: ${edge.prerequisiteDerivedNodeId} -> ${edge.dependentDerivedNodeId} (conf=${edge.confidence.toFixed(2)})`);
  }
}

async function generateSyntheticLayer(ctx: Context, topic?: string, declaredDomain?: string) {
  // Synthetic Topic Generation, the second pipeline arm (ADR-0019 amended): a topic +
  // Declared Domain -> a free-standing, anchor-less Derived Graph Layer of
  // synthetic_primary llm_grounded nodes. It reads no published version and never mutates
  // the asserted graph (R1, R4, R11). The source-grounded commands are untouched.
  if (!topic || !declaredDomain) {
    console.error("! generate-synthetic-layer requires <topic> <declaredDomain>.");
    process.exitCode = 1;
    return;
  }
  const enrichmentId = randomUUID();
  console.log(`\n>> synthetic generation ${enrichmentId} for topic "${topic}" [${declaredDomain}]`);
  const layer = await runSyntheticGeneration({
    enrichmentId,
    topic,
    declaredDomain,
    conceptSetSynthesis: ctx.conceptSetSynthesis,
    sourceLessGroundingAdmission: ctx.sourceLessGroundingAdmission,
    prerequisiteOrdering: ctx.prerequisiteOrdering,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore,
    config: ctx.syntheticConfig,
    reporter: ctx.runProgressReporter,
    // Concept/verdict + edge summary line for operator visibility: how many concepts were
    // synthesized, how many the probe kept as core vs held out as boundary, and the DAG size.
    onSummary: (summary) =>
      console.log(`   concepts=${summary.concepts} core=${summary.core} boundary=${summary.boundary} nodes=${summary.nodes} edges(committed/uncertain)=${summary.committedEdges}/${summary.uncertainEdges}`)
  });
  console.log(
    `   nodes=${layer.derivedNodes.length} difficulties=${layer.difficulties.length} judge=${layer.judgeModel} version=${layer.graphVersionId ?? "null (synthetic)"}`
  );
  for (const edge of layer.prerequisiteEdges.filter((e) => !e.uncertain)) {
    console.log(`   edge: ${edge.prerequisiteDerivedNodeId} -> ${edge.dependentDerivedNodeId} (conf=${edge.confidence.toFixed(2)})`);
  }
}

async function calibrateBoundaryProbeCommand(ctx: Context, ladderFile: string | undefined, flags: string[]) {
  if (!ladderFile) {
    console.error("! calibrate-boundary-probe requires <ladder-file>.");
    process.exitCode = 1;
    return;
  }
  const args = parseCalibrationFlags(flags);
  const ladderPath = path.resolve(REPO_ROOT, ladderFile);
  const ladder = parseKnowledgeBoundaryLadder(await readFile(ladderPath, "utf8"));
  const baseClient = resolveNeuralClientBaseOptions();
  const passes = args.temperatures.flatMap((temperature) =>
    args.deployments.map((deployment) => ({
      deployment,
      temperature,
      probe: createKnowledgeBoundaryProbePort(new LiteLlmForcedToolClient({ ...baseClient, temperature }), deployment)
    }))
  );
  console.log(`\n>> boundary-probe calibration concepts=${ladder.length} deployments=${args.deployments.length} temperatures=${args.temperatures.join(",")}`);
  const outDir = path.resolve(REPO_ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });
  const fragmentsDir = path.join(outDir, "concepts");
  await mkdir(fragmentsDir, { recursive: true });
  const report = await calibrateKnowledgeBoundaryProbe({
    ladder,
    passes,
    embedding: ctx.nodeEmbedding,
    sampleCount: args.sampleCount,
    drawConcurrency: args.drawConcurrency,
    conceptConcurrency: args.conceptConcurrency,
    kValues: args.kValues,
    thresholds: args.thresholds,
    onConceptReport: async (conceptReport) => {
      const fragmentName = [
        slugify(conceptReport.deployment),
        `temp-${conceptReport.temperature}`,
        slugify(conceptReport.tier),
        slugify(conceptReport.declaredDomain),
        slugify(conceptReport.conceptLabel)
      ].join("__");
      const fragmentPath = path.join(fragmentsDir, `${fragmentName}.json`);
      await writeFile(fragmentPath, `${JSON.stringify(conceptReport, null, 2)}\n`, "utf8");
      const kMax = Math.max(...conceptReport.scores.map((score) => score.k));
      const score = conceptReport.scores.find((candidate) => candidate.k === kMax)?.agreementScore;
      console.log(
        `   done ${conceptReport.deployment} temp=${conceptReport.temperature} tier=${conceptReport.tier} concept="${conceptReport.conceptLabel}" k=${kMax} score=${score?.toFixed(4) ?? "n/a"}`
      );
    }
  });
  const reportPath = path.join(outDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`   wrote ${path.relative(REPO_ROOT, reportPath)}`);
  for (const summary of report.tierSummaries) {
    if (summary.k !== Math.max(...report.kValues)) continue;
    const boundaryCounts = Object.entries(summary.boundaryCountsByThreshold)
      .map(([threshold, count]) => `${threshold}:${count}`)
      .join(" ");
    console.log(
      `   ${summary.deployment} temp=${summary.temperature} tier=${summary.tier} k=${summary.k} n=${summary.count} min=${summary.min.toFixed(4)} median=${summary.median.toFixed(4)} max=${summary.max.toFixed(4)} boundary@threshold=${boundaryCounts}`
    );
  }
}

const DEFAULT_DISCOVERY_COVERAGE_AUDIT_DIR = "tmp/2026-07-10-mimo-extraction-follow-ups";
const DEFAULT_SCAFFOLD_CONTENT_AUDIT_DIR = "tmp/2026-07-16-scaffold-content-audit";

// Discovery-coverage audit (plan 2026-07-10-004 U1): durable measurement command, the
// `calibrate-boundary-probe` precedent — every future extractor swap needs this same
// audit. K-sampled cross-family judgments over one run's admitted set; the report goes
// to gitignored tmp/ (rule 10) for human inspection (ADR-0013). Audit calls carry no
// operation_id, so they never pollute an operation's cost report.
async function auditDiscoveryCoverageCommand(ctx: Context, runId: string | undefined, flags: string[]) {
  if (!runId) {
    console.error("! audit-discovery-coverage requires <runId>.");
    process.exitCode = 1;
    return;
  }
  let k = 3;
  let outDir = DEFAULT_DISCOVERY_COVERAGE_AUDIT_DIR;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const next = () => {
      const value = flags[++i];
      if (!value) throw new Error(`${flag} requires a value.`);
      return value;
    };
    switch (flag) {
      case "--k":
        k = Math.trunc(Number(next()));
        break;
      case "--out":
        outDir = next();
        break;
      default:
        throw new Error(`unknown audit-discovery-coverage flag: ${flag}`);
    }
  }
  console.log(`\n>> discovery-coverage audit run=${runId} k=${k}`);
  const report = await auditDiscoveryCoverage({
    runId,
    k,
    runInspectionRead: ctx.inspectionRead,
    sourceInspectionRead: ctx.inspectionRead,
    audit: ctx.discoveryCoverageAudit,
    onSample: (sample) => console.log(`   sample ${sample.sampleIndex + 1}/${k}: misses=${sample.misses.length}`)
  });
  const resolvedOutDir = path.resolve(REPO_ROOT, outDir);
  await mkdir(resolvedOutDir, { recursive: true });
  const baseName = `discovery-coverage-${runId}`;
  const jsonPath = path.join(resolvedOutDir, `${baseName}.json`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdownPath = path.join(resolvedOutDir, `${baseName}.md`);
  await writeFile(markdownPath, discoveryCoverageMarkdown(report), "utf8");
  console.log(`   admitted=${report.admittedConcepts.length} judged-misses=${report.aggregated.length} recurring=${report.recurringCount}`);
  for (const miss of report.aggregated.filter((entry) => entry.recurring)) {
    console.log(`   recurring ${miss.occurrences}/${report.k}: ${miss.instances[0]?.missedObjective ?? miss.normalizedObjective}`);
  }
  console.log(`   wrote ${path.relative(REPO_ROOT, jsonPath)} and ${path.relative(REPO_ROOT, markdownPath)}`);
}

function discoveryCoverageMarkdown(report: DiscoveryCoverageAuditReport): string {
  const lines = [
    `# Discovery-coverage audit — ${report.sourceTitle}`,
    "",
    `- Run: \`${report.runId}\` (source \`${report.sourceResourceId}\`, domain "${report.declaredDomain}")`,
    `- Judge: \`${report.judgeModel}\`, K=${report.k}, generated ${report.generatedAt}`,
    `- Admitted concepts (core + optional): ${report.admittedConcepts.length}`,
    `- Judged misses: ${report.aggregated.length} (recurring ≥2/${report.k}: ${report.recurringCount})`,
    "",
    "A miss is a judge PROPOSAL for human inspection against the source (ADR-0013), not a verdict.",
    ""
  ];
  if (report.aggregated.length === 0) {
    lines.push("No misses reported in any sample: the admitted set preserves the source's principal learning structure per the judge.");
  }
  for (const miss of report.aggregated) {
    const instance = miss.instances[0];
    lines.push(`## ${instance?.missedObjective ?? miss.normalizedObjective} — ${miss.occurrences}/${report.k} samples${miss.recurring ? " (RECURRING)" : ""}`);
    for (const detail of miss.instances) {
      lines.push(`- grounding: ${detail.sourceGrounding}`);
      lines.push(`  - why standalone: ${detail.whyStandalone}`);
    }
    lines.push("");
  }
  lines.push("## Admitted set the judge saw", "");
  for (const concept of report.admittedConcepts) {
    lines.push(`- [${concept.tier}] ${concept.label}${concept.gist ? ` — ${concept.gist}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

async function auditScaffoldContentCommand(ctx: Context, enrichmentId: string | undefined, flags: string[]) {
  if (!enrichmentId) {
    console.error("! audit-scaffold-content requires <enrichmentId>.");
    process.exitCode = 1;
    return;
  }
  let k = 3;
  let outDir = DEFAULT_SCAFFOLD_CONTENT_AUDIT_DIR;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const next = () => {
      const value = flags[++i];
      if (!value) throw new Error(`${flag} requires a value.`);
      return value;
    };
    switch (flag) {
      case "--k":
        k = Math.trunc(Number(next()));
        break;
      case "--out":
        outDir = next();
        break;
      default:
        throw new Error(`unknown audit-scaffold-content flag: ${flag}`);
    }
  }
  // Audit-over-persisted-output (KTD1): read the generated Support Steps exactly as learners saw
  // them; the production learner-api generation path is never re-run here (rule 18).
  const steps = await ctx.scaffoldStore.listGeneratedStepsForAudit(enrichmentId);
  console.log(`\n>> scaffold-content audit enrichment=${enrichmentId} generated-steps=${steps.length} k=${k}`);
  if (steps.length === 0) {
    console.log("   no generated Support Steps for this enrichment — nothing to audit.");
    return;
  }
  const report = await auditScaffoldContent({
    enrichmentId,
    steps,
    k,
    judge: ctx.scaffoldContentCongruence,
    onSample: (progress) =>
      console.log(
        `   step ${progress.stepIndex + 1}/${progress.stepCount} sample ${progress.sampleIndex + 1}/${k}: ` +
          `teaches=${progress.verdict.teachesStepLabel} simpler=${progress.verdict.isSimplerPrerequisite}`
      )
  });
  const resolvedOutDir = path.resolve(REPO_ROOT, outDir);
  await mkdir(resolvedOutDir, { recursive: true });
  const baseName = `scaffold-content-${enrichmentId}`;
  const jsonPath = path.join(resolvedOutDir, `${baseName}.json`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdownPath = path.join(resolvedOutDir, `${baseName}.md`);
  await writeFile(markdownPath, scaffoldContentMarkdown(report), "utf8");
  const artifactTotal = Object.values(report.artifactTotals).reduce((sum, count) => sum + count, 0);
  console.log(
    `   steps=${report.stepCount} artifact-steps=${report.artifactStepCount} (${artifactTotal} tokens) ` +
      `congruence-recurring-steps=${report.congruenceRecurringStepCount}`
  );
  for (const step of report.steps.filter((entry) => entry.congruenceRecurring)) {
    console.log(`   recurring mismatch step "${step.stepLabel}" (term "${step.term}"): teach-no=${step.notTeachingCount}/${k} simpler-no=${step.notSimplerCount}/${k}`);
  }
  console.log(`   wrote ${path.relative(REPO_ROOT, jsonPath)} and ${path.relative(REPO_ROOT, markdownPath)}`);
}

function scaffoldContentMarkdown(report: ScaffoldContentAuditReport): string {
  const artifactTotal = Object.values(report.artifactTotals).reduce((sum, count) => sum + count, 0);
  const artifactBreakdown =
    Object.entries(report.artifactTotals).filter(([, count]) => count > 0).map(([type, count]) => `${type}=${count}`).join(", ") || "none";
  const lines = [
    `# Scaffold-content audit — enrichment ${report.enrichmentId ?? "(all)"}`,
    "",
    `- Judge: \`${report.judgeModel}\`, K=${report.k}, generated ${report.generatedAt}`,
    `- Generated steps audited: ${report.stepCount}`,
    `- Formatting artifacts: ${artifactTotal} token(s) across ${report.artifactStepCount} step(s) — ${artifactBreakdown}`,
    `- Recurring congruence problems (≥${report.k >= 2 ? 2 : 1}/${report.k} NO): ${report.congruenceRecurringStepCount} step(s)`,
    "",
    "Artifacts are objectively-decidable format-contract violations (reported, never a gate — rule 16).",
    "Congruence verdicts are judge PROPOSALS for human inspection against the content (ADR-0013), not verdicts.",
    ""
  ];
  for (const step of report.steps) {
    const flags = [
      step.artifacts.length > 0 ? `${step.artifacts.length} artifact(s)` : null,
      step.congruenceRecurring ? "RECURRING congruence problem" : null
    ].filter(Boolean);
    lines.push(`## "${step.stepLabel}" — term "${step.term}" under "${step.parentLabel}"${flags.length ? ` — ${flags.join(", ")}` : ""}`);
    lines.push(`- domain: ${step.declaredDomain} · step ${step.scaffoldStepId} · detour ${step.detourId}`);
    lines.push(`- congruence: teaches-step-label NO ${step.notTeachingCount}/${report.k}, simpler-prerequisite NO ${step.notSimplerCount}/${report.k}`);
    for (const finding of step.artifacts) {
      lines.push(`- artifact [${finding.field}/${finding.tokenType}]: \`${finding.excerpt}\``);
    }
    for (const sample of step.samples) {
      lines.push(`  - sample ${sample.sampleIndex + 1}: teaches=${sample.verdict.teachesStepLabel} simpler=${sample.verdict.isSimplerPrerequisite} — ${sample.verdict.rationale}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function synthesizeResponsesCommand(ctx: Context, enrichmentId?: string, targetDerivedNodeId?: string, learnerStateRef?: string) {
  if (!enrichmentId || !targetDerivedNodeId || !learnerStateRef) {
    console.error("! synthesize-responses requires <enrichmentId> <targetDerivedNodeId> <learnerStateRef>.");
    process.exitCode = 1;
    return;
  }
  const layer = await ctx.enrichmentStore.getLayer(enrichmentId);
  if (!layer) {
    console.error(`! enrichment ${enrichmentId} not found.`);
    process.exitCode = 1;
    return;
  }
  const targetNode = layer.derivedNodes.find((node) => node.derivedNodeId === targetDerivedNodeId);
  if (!targetNode) {
    console.error(`! target node ${targetDerivedNodeId} is not in enrichment ${enrichmentId}.`);
    process.exitCode = 1;
    return;
  }
  // Every learner-state table FKs to Better Auth's `user` (ADR-0041), so a synthetic demo
  // learner needs an identity row before any verdict is written. Idempotent insert with no
  // credential of any kind — this account cannot be signed into, which is the point: demo
  // learners are legitimate learner-state holders, not leaderboard rivals (KTD1) and not
  // people. A real learner is only ever created by Better Auth itself.
  await ctx.sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${learnerStateRef}, ${learnerStateRef}, ${`${learnerStateRef}@demo.invalid`}, false, now(), now())
    ON CONFLICT (id) DO NOTHING`;
  console.log(`\n>> synthesizing responses for learner ${learnerStateRef} toward ${targetDerivedNodeId}`);
  const result = await synthesizeResponses({
    learnerStateRef,
    layer,
    targetDerivedNodeId,
    profile: { difficultyCutoff: 0.6 },
    verdictStore: ctx.verdictStore
  });
  console.log(`   verdicts: known=${result.knownCount} learn=${result.learnCount}`);
}

// Cost & timings report renderer for code agents (ADR-0029): a per-stage table of
// wall-clock + calls + cost for one operation, or the same structured rows as `--json`.
// Both this CLI and the Admin Lab view call the SAME costTimingReport use-case; neither
// re-implements the join.
async function costTimingReportCommand(ctx: Context, operationId: string | undefined, flags: string[]) {
  if (!operationId) {
    console.error("! cost-timing-report requires <operationId> (an extraction run / graph version / enrichment id).");
    process.exitCode = 1;
    return;
  }
  const report = await costTimingReport({
    scope: { operationId },
    timelineRead: ctx.operationTimelineRead,
    operationStageSpendRead: ctx.operationStageSpendRead,
    journeyLineageRead: ctx.journeyLineageRead
  });
  if (!report) {
    console.error(`! no operation timeline found for ${operationId}.`);
    process.exitCode = 1;
    return;
  }
  emitReport(report, flags);
}

async function journeyCostReportCommand(ctx: Context, enrichmentId: string | undefined, flags: string[]) {
  if (!enrichmentId) {
    console.error("! journey-cost-report requires <enrichmentId>.");
    process.exitCode = 1;
    return;
  }
  const report = await costTimingReport({
    scope: { journeyAnchorEnrichmentId: enrichmentId },
    timelineRead: ctx.operationTimelineRead,
    operationStageSpendRead: ctx.operationStageSpendRead,
    journeyLineageRead: ctx.journeyLineageRead
  });
  if (!report) {
    console.error(`! no journey timeline found for enrichment ${enrichmentId}.`);
    process.exitCode = 1;
    return;
  }
  emitReport(report, flags);
}

// Shared flag dispatch for both report commands (U3). `--ranked` renders (or with `--json`,
// emits) the ranked cost + time target lists; `--json` alone emits the raw report; absent
// flags render the per-stage table. `--ranked --json` is the recording form for the baseline.
function emitReport(report: CostTimingReport, flags: string[]) {
  const ranked = flags.includes("--ranked");
  const json = flags.includes("--json");
  if (ranked) {
    if (json) console.log(JSON.stringify(rankBottleneckTargets(report), null, 2));
    else renderRankedTargets(report);
    return;
  }
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  renderCostTimingTable(report);
}

function renderCostTimingTable(report: CostTimingReport) {
  console.log(`\n>> ${report.scope} cost report — ${report.anchorId}`);
  if (!report.costAvailable) console.log("   ! LiteLLM spend logs unavailable — cost columns omitted, wall-clock only.");
  const fmtMs = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  const fmtUsd = (usd: number | null) => (usd === null ? "—" : `$${usd.toFixed(4)}`);
  // "≈" marks a figure containing a usage-derived estimate for zero-spend OpenRouter
  // BYOK rows (plan 2026-07-10-004 U4) — distinguishable from provider-billed spend.
  const fmtCost = (usd: number | null, estimated: boolean) => (usd === null ? "—" : `${estimated ? "≈" : ""}${fmtUsd(usd)}`);
  const header = `   ${"stage".padEnd(30)} ${"wall".padStart(9)} ${"calls".padStart(6)} ${"tokens".padStart(10)} ${"cost".padStart(11)}`;
  for (const operation of report.operations) {
    console.log(`\n   [${operation.operationType}] ${operation.operationId} (${operation.status})`);
    console.log(header);
    console.log(`   ${"-".repeat(30)} ${"-".repeat(9)} ${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(11)}`);
    for (const row of operation.stages) {
      console.log(`   ${row.stage.padEnd(30)} ${fmtMs(row.wallClockMs).padStart(9)} ${(row.calls ?? "—").toString().padStart(6)} ${(row.tokens ?? "—").toString().padStart(10)} ${fmtCost(row.costUsd, row.costEstimated).padStart(11)}`);
    }
    console.log(`   ${"subtotal".padEnd(30)} ${fmtMs(operation.subtotal.wallClockMs).padStart(9)} ${(operation.subtotal.calls ?? "—").toString().padStart(6)} ${(operation.subtotal.tokens ?? "—").toString().padStart(10)} ${fmtCost(operation.subtotal.costUsd, operation.subtotal.costEstimated).padStart(11)}`);
  }
  console.log(`\n   ${report.scope} total: wall=${fmtMs(report.total.wallClockMs)} calls=${report.total.calls ?? "—"} tokens=${report.total.tokens ?? "—"} cost=${fmtCost(report.total.costUsd, report.total.costEstimated)}${report.total.costEstimated ? " (≈ includes usage-derived estimate for BYOK rows)" : ""}`);
}

// Ranked-target renderer (U3): a cost-ranked and a wall-ranked list of (operation, stage)
// rows with each target's share of the journey total — the optimization-pass handoff view.
function renderRankedTargets(report: CostTimingReport) {
  const ranked = rankBottleneckTargets(report);
  const fmtMs = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  const fmtUsd = (usd: number | null) => (usd === null ? "—" : `$${usd.toFixed(4)}`);
  const fmtShare = (share: number | null) => (share === null ? "—" : `${(share * 100).toFixed(1)}%`);
  const target = (t: RankedTarget) =>
    `${t.operationType}/${t.stage}`.padEnd(46);
  console.log(`\n>> ${report.scope} ranked targets — ${report.anchorId}`);
  if (!report.costAvailable) console.log("   ! LiteLLM spend logs unavailable — cost ranking empty, wall-clock ranking only.");

  console.log(`\n   cost targets (desc)   ${"share".padStart(7)} ${"cost".padStart(10)} ${"wall".padStart(9)} ${"calls".padStart(6)} ${"tokens".padStart(10)}`);
  if (ranked.byCost.length === 0) console.log("   (none)");
  for (const t of ranked.byCost) {
    console.log(`   ${target(t)} ${fmtShare(t.costShare).padStart(7)} ${fmtUsd(t.costUsd).padStart(10)} ${fmtMs(t.wallClockMs).padStart(9)} ${(t.calls ?? "—").toString().padStart(6)} ${(t.tokens ?? "—").toString().padStart(10)}`);
  }

  console.log(`\n   time targets (desc)   ${"share".padStart(7)} ${"wall".padStart(9)} ${"cost".padStart(10)} ${"calls".padStart(6)} ${"tokens".padStart(10)}`);
  if (ranked.byWall.length === 0) console.log("   (none)");
  for (const t of ranked.byWall) {
    console.log(`   ${target(t)} ${fmtShare(t.wallShare).padStart(7)} ${fmtMs(t.wallClockMs).padStart(9)} ${fmtUsd(t.costUsd).padStart(10)} ${(t.calls ?? "—").toString().padStart(6)} ${(t.tokens ?? "—").toString().padStart(10)}`);
  }
}

async function generateStudyItemsCommand(ctx: Context, enrichmentId: string | undefined, flags: string[]) {
  let args;
  try {
    args = parseGenerateStudyItemsArgs(enrichmentId, flags);
  } catch (error) {
    console.error(`! ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n>> generating Study Item Bank for enrichment ${args.enrichmentId}`);
  if (args.concurrency !== undefined) console.log(`   concurrency=${args.concurrency}`);
  const result = await generateStudyItemBank({
    enrichmentId: args.enrichmentId,
    configHash: studyItemBankConfigHash(),
    graphStore: ctx.graphStore,
    enrichmentStore: ctx.enrichmentStore,
    conceptLessonGeneration: ctx.conceptLessonGeneration,
    studyItemBlueprint: ctx.studyItemBlueprint,
    answerKeyVerification: ctx.answerKeyVerification,
    matchingAssignmentVerification: ctx.matchingAssignmentVerification,
    conceptLessonStore: ctx.conceptLessonStore,
    layerPurposeGeneration: ctx.layerPurposeGeneration,
    layerPurposeStore: ctx.layerPurposeStore,
    studyItemGeneration: ctx.studyItemGeneration,
    studyItemBankStore: ctx.studyItemBankStore,
    concurrency: args.concurrency,
    reporter: ctx.runProgressReporter
  });
  console.log(`   lessons=${result.lessons.length} lessonAbsent=${result.lessonAbsent.length} items=${result.studyItems.length} rejected=${result.rejected.length} model=${ctx.studyItemGeneration.model}`);
  for (const item of result.studyItems) {
    if (item.itemType === "option_select") {
      const correct = item.options.find((option) => option.isCorrect);
      const distractors = item.options.filter((option) => !option.isCorrect).map((option) => option.text);
      console.log(`   option_select[${item.derivedNodeId}] provenance=${item.groundingProvenance}\n     Q: ${item.question}\n     correct: ${correct?.text}\n     distractors: ${distractors.join(" | ")}`);
    } else if (item.itemType === "matching") {
      console.log(`   matching[${item.derivedNodeId}] provenance=${item.groundingProvenance} pairs=${item.pairs.length}\n     Q: ${item.question}\n     prompts: ${item.pairs.map((pair) => pair.promptText).join(" | ")}\n     matches: ${item.pairs.map((pair) => pair.matchText).join(" | ")}`);
    } else {
      const impostor = item.statements.find((statement) => statement.isImpostor);
      const truths = item.statements.filter((statement) => !statement.isImpostor).map((statement) => statement.text);
      console.log(`   impostor[${item.derivedNodeId}] provenance=${item.groundingProvenance} lieSource=${impostor?.lieSource ?? "‼MISSING‼"}${impostor?.siblingLabel ? ` sibling=${impostor.siblingLabel}` : ""}\n     Q: ${item.question}\n     lie: ${impostor?.text}\n     truths: ${truths.join(" | ")}\n     reveal: ${impostor?.reveal ?? "‼MISSING‼"}`);
    }
  }
  for (const rejected of result.rejected) {
    console.log(`   ! rejected ${rejected.canonicalLabel} (${rejected.derivedNodeId}) [${rejected.itemType}]: ${rejected.reason}`);
  }
}

async function listSources(ctx: Context) {
  for (const source of await ctx.registrationStore.listSources()) {
    console.log(`${source.sourceResourceId}  [${source.declaredDomain}]  ${source.title}`);
  }
}

async function dispatch(ctx: Context, command: string | undefined, arg: string | undefined, rest: string[]) {
  switch (command) {
    case "register-from-manifest":
      await registerFromManifest(ctx, arg ?? "fixtures/manifest.json");
      break;
    case "run-extraction":
      await runExtraction(ctx, arg === "--all" || arg === undefined ? undefined : arg);
      break;
    case "build-graph-version":
      // All positional args after the command are run IDs to publish.
      await buildVersion(ctx, [arg, ...rest].filter((value): value is string => Boolean(value)));
      break;
    case "enrich-graph-version":
      await enrichGraphVersion(ctx, arg);
      break;
    case "generate-synthetic-layer":
      await generateSyntheticLayer(ctx, arg, rest[0]);
      break;
    case "calibrate-boundary-probe":
      await calibrateBoundaryProbeCommand(ctx, arg, rest);
      break;
    case "audit-discovery-coverage":
      await auditDiscoveryCoverageCommand(ctx, arg, rest);
      break;
    case "audit-scaffold-content":
      await auditScaffoldContentCommand(ctx, arg, rest);
      break;
    case "generate-study-items":
      await generateStudyItemsCommand(ctx, arg, rest);
      break;
    case "synthesize-responses":
      await synthesizeResponsesCommand(ctx, arg, rest[0], rest[1]);
      break;
    case "list-sources":
      await listSources(ctx);
      break;
    case "cost-timing-report":
      await costTimingReportCommand(ctx, arg, rest);
      break;
    case "journey-cost-report":
      await journeyCostReportCommand(ctx, arg, rest);
      break;
    default:
      console.log("Usage: worker:kg <register-from-manifest [path] | run-extraction [--all|<sourceResourceId>] | build-graph-version <runId> [<runId> ...] | enrich-graph-version [<graphVersionId>] | generate-synthetic-layer <topic> <declaredDomain> | calibrate-boundary-probe <ladder-file> [--out <dir>] [--deployments <csv>] [--temperatures <csv>] [--k <csv>] [--thresholds <csv>] [--sample-count <n>] [--draw-concurrency <n>] [--concept-concurrency <n>] | audit-discovery-coverage <runId> [--k <n>] [--out <dir>] | audit-scaffold-content <enrichmentId> [--k <n>] [--out <dir>] | generate-study-items <enrichmentId> [--concurrency <positiveInteger>] | synthesize-responses <enrichmentId> <targetDerivedNodeId> <learnerStateRef> | list-sources | cost-timing-report <operationId> [--json] [--ranked] | journey-cost-report <enrichmentId> [--json] [--ranked]>");
  }
}

function parseCalibrationFlags(flags: string[]) {
  const args = {
    outDir: DEFAULT_BOUNDARY_PROBE_CALIBRATION_DIR,
    deployments: DEFAULT_BOUNDARY_PROBE_DEPLOYMENTS,
    temperatures: [0.7, 1],
    kValues: [3, 5, 10],
    thresholds: undefined as number[] | undefined,
    sampleCount: 10,
    drawConcurrency: 5,
    conceptConcurrency: 1
  };
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const next = () => {
      const value = flags[++i];
      if (!value) throw new Error(`${flag} requires a value.`);
      return value;
    };
    switch (flag) {
      case "--out":
        args.outDir = next();
        break;
      case "--deployments":
        args.deployments = parseCsv(next());
        break;
      case "--temperatures":
        args.temperatures = parseNumberCsv(next(), "--temperatures");
        break;
      case "--k":
        args.kValues = parseNumberCsv(next(), "--k").map((value) => Math.trunc(value));
        break;
      case "--thresholds":
        args.thresholds = parseNumberCsv(next(), "--thresholds");
        break;
      case "--sample-count":
        args.sampleCount = Math.trunc(Number(next()));
        break;
      case "--draw-concurrency":
        args.drawConcurrency = Math.trunc(Number(next()));
        break;
      case "--concept-concurrency":
        args.conceptConcurrency = Math.trunc(Number(next()));
        break;
      default:
        throw new Error(`unknown calibrate-boundary-probe flag: ${flag}`);
    }
  }
  if (args.deployments.length === 0) throw new Error("--deployments must name at least one deployment.");
  if (args.temperatures.length === 0) throw new Error("--temperatures must name at least one temperature.");
  if (args.kValues.length === 0) throw new Error("--k must name at least one K value.");
  return args;
}

function parseCsv(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseNumberCsv(value: string, flag: string): number[] {
  return parseCsv(value).map((part) => {
    const number = Number(part);
    if (!Number.isFinite(number)) throw new Error(`${flag} contains a non-numeric value: ${part}`);
    return number;
  });
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "value";
}

async function main() {
  const [command, arg, ...rest] = process.argv.slice(2);
  const ctx = buildContext();
  try {
    // Per-stage wall-clock now lives in the durable operation_run_stages timeline,
    // written incrementally by each operation through the reporter (KTD7) — the old
    // whole-command stdout `stage_timing` bracket is superseded and removed.
    await dispatch(ctx, command, arg, rest);
  } finally {
    await ctx.spendLogsRead?.end();
    await ctx.sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
