import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_TAGS, type ConceptIdentityDecision } from "@lrnki/domain-core";
import {
  buildGraphVersion,
  computeLearnerPath,
  createIntrinsicDifficultyPort,
  emptyLearnerState,
  resolveConceptIdentity,
  runExtractionOverSources,
  type ExtractionSourceUnit,
  generateStudyItemBank,
  loadResponseLogLearnerState,
  synthesizeResponses,
  ADAPTIVE_MASTERY_THRESHOLD,
  runGraphEnrichment,
  bottleneckReport,
  rankBottleneckTargets,
  type BottleneckReport,
  type RankedTarget
} from "@lrnki/application";
import { identityCandidatesFromBuildInputs } from "./identityCandidateMapping";
import {
  DoclingStructuredDocumentParser,
  HtmlStructuredDocumentParser,
  MarkdownStructuredDocumentParser,
  StructuredDocumentParserRegistry,
  TextStructuredDocumentParser
} from "@lrnki/infrastructure-ingestion";
import {
  LiteLlmAdmissionLabelJudgmentAdapter,
  LiteLlmAssertionEntailmentJudgmentAdapter,
  LiteLlmDefinitionPassageQualityJudgmentAdapter,
  LiteLlmEvidenceProfileExtractionAdapter,
  LiteLlmConceptAdmissionAdapter,
  LiteLlmStudyItemGenerationAdapter,
  LiteLlmConceptLessonGenerationAdapter,
  LiteLlmConceptDiscoveryAdapter,
  LiteLlmForcedToolClient,
  LiteLlmSpendLogsReadAdapter,
  LiteLlmEmbeddingClient,
  LiteLlmNodeEmbeddingAdapter,
  LiteLlmNodeMergeAdjudicationAdapter,
  LiteLlmGroundingGenerationAdapter,
  LiteLlmIntrinsicDifficultyJudgmentAdapter,
  LiteLlmMissingPrerequisiteProposalAdapter,
  LiteLlmPrerequisiteOrderingAdapter,
  LiteLlmMintingDurabilityJudgmentAdapter,
  LiteLlmRescueDurabilityJudgmentAdapter
} from "@lrnki/infrastructure-litellm";
import {
  PostgresArtifactRepository,
  PostgresEnrichmentRunStore,
  PostgresExtractionRunStore,
  PostgresStudyItemBankStore,
  PostgresConceptLessonStore,
  PostgresResponseLogStore,
  PostgresCalibrationVerdictStore,
  PostgresGraphVersionStore,
  PostgresLearnerPathStore,
  PostgresSourceRegistrationStore,
  PostgresRunProgressReporter,
  PostgresOperationTimelineRead,
  PostgresJourneyLineageRead,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// Pipeline configuration identity — bump when prompts/models/schemas change so
// runs are attributable to a configuration (ADR-0017).
const PIPELINE_CONFIG_HASH = "definition-quality-judge-v38";

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
  // timeline that the live progress view and bottleneck report read.
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
  const baseClient = {
    baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY ?? "sk-local",
    timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "600") * 1000
  };
  // Discovery stays at default sampling. It is the recall stage and, empirically,
  // greedy decoding (temperature 0) makes DeepSeek emit a MORE exhaustive candidate
  // list (~26 → ~40 candidates), which inflates downstream over-admission of generic
  // primitives. Determinism here is also moot: discovery output is not reproducible
  // across processes even at temperature 0 (MoE non-determinism), and the replayable
  // unit is the graph-version build, not the extraction run (ADR-0017).
  const discoveryClient = new LiteLlmForcedToolClient(baseClient);
  // Determinism lever (TODO 1, ADR-0018) applied where it is both effective and
  // beneficial: admission is the precision gate and, GIVEN a fixed candidate set,
  // greedy decoding collapses its core-set drift (probe: spread 3→1/4→0/1→0 across
  // the three fixtures); claims are per-subject and benefit from stable text. Not
  // bit-exact on DeepSeek's MoE, so a small residual remains.
  const deterministicClient = new LiteLlmForcedToolClient({ ...baseClient, temperature: 0, seed: 7 });
  // Embedding transport for the semantic-dedup PROPOSE signal (plan U1). Same base
  // options as the forced-tool clients; embeddings have no sampling knobs.
  const embeddingClient = new LiteLlmEmbeddingClient(baseClient);
  const spendLogsRead = process.env.LITELLM_DATABASE_URL
    ? new LiteLlmSpendLogsReadAdapter(process.env.LITELLM_DATABASE_URL)
    : undefined;
  return {
    sql,
    registrationStore,
    runStore,
    runProgressReporter,
    // Bottleneck-report read surfaces: the per-operation timeline read-model and
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
    discovery: new LiteLlmConceptDiscoveryAdapter(discoveryClient),
    admission: new LiteLlmConceptAdmissionAdapter(deterministicClient),
    evidenceProfileExtraction: new LiteLlmEvidenceProfileExtractionAdapter(deterministicClient),
    // Assertion-entailment judge (ADR-0007 reset). Independent production judge
    // (gpt-oss-120b via kg-independent-judge) so the judge is not the extractor
    // re-grading itself; deterministic decoding for stable re-derivation. Guards
    // only the optional typed assertions inside a Concept Evidence Profile.
    assertionEntailmentJudge: new LiteLlmAssertionEntailmentJudgmentAdapter(deterministicClient),
    // Concept-vs-proposition admission judge (ADR-0005). Same independent
    // production judge (kg-independent-judge) and deterministic decoding;
    // downgrade-only stage that replaces the removed looksLikePropositionLabel veto.
    admissionLabelJudge: new LiteLlmAdmissionLabelJudgmentAdapter(deterministicClient),
    // Definition-Passage quality judge (ADR-0007 extension). Same independent
    // production judge (kg-independent-judge) and deterministic decoding; runs after
    // the verbatim floor and drops hollow Definition Passages (bare name, heading,
    // title, citation), routing a last-passage veto into the existing demotion with a
    // distinct reason code.
    definitionPassageQualityJudge: new LiteLlmDefinitionPassageQualityJudgmentAdapter(deterministicClient),
    // Graph Enrichment ports (ADR-0019 amended — whole-set ordering, plan U5). ONE
    // non-DeepSeek ordering call per Declared Domain (kg-prerequisite-ordering) returns
    // the directed prerequisite DAG over the deduplicated node set; it is cross-family
    // from the DeepSeek extractor + grounding generator (ADR-0023), so a single judge
    // never grades its own minted output and the per-pair routing split is gone.
    // Deterministic decoding for stable re-derivation. Difficulty is learner-neutral
    // intrinsic: a cross-family neural subscore fused with deterministic components.
    prerequisiteOrdering: new LiteLlmPrerequisiteOrderingAdapter(deterministicClient),
    // Node-minting ports (U5): explicit prerequisite proposal (node identity) +
    // anchor-conditioned grounding generation, both DeepSeek-family (AGENTS rule 5).
    missingPrerequisiteProposal: new LiteLlmMissingPrerequisiteProposalAdapter(deterministicClient),
    groundingGeneration: new LiteLlmGroundingGenerationAdapter(deterministicClient),
    // Measured rescue durability judge (U3): cross-family independent judge
    // (kg-independent-judge) decides whether each aggregated source_mentioned rescue
    // candidate is a durable prerequisite before it becomes a derived node. Drop-only,
    // fail-open-with-flag; the DeepSeek generator never grades rescue durability.
    rescueDurabilityJudge: new LiteLlmRescueDurabilityJudgmentAdapter(deterministicClient),
    // Rescue-seam Definition-Passage quality judge (plan 2026-06-26-001 U3). The SAME
    // independent meaning judge (kg-independent-judge) and deterministic decoding as the
    // extraction-time core gate — no new alias — but tagged `rescue-definition-quality` so
    // its spend joins the enrichment operation (ADR-0029). Drops hollow rescued optional
    // definitions before they reach study items; fails closed = preserve.
    rescuedDefinitionQualityJudge: new LiteLlmDefinitionPassageQualityJudgmentAdapter(deterministicClient, undefined, STAGE_TAGS.rescueDefinitionQuality),
    // Measured minting durability judge: cross-family independent judge gates
    // reserved assumed-prerequisite proposals before grounding generation. Drop-only,
    // fail-open-with-flag; disable with ENRICH_DISABLE_MINTING_DURABILITY for the
    // judge-off baseline.
    mintingDurabilityJudge: new LiteLlmMintingDurabilityJudgmentAdapter(deterministicClient),
    // Semantic-dedup ports (plan U1/U2, AGENTS rule 20). Embeddings PROPOSE within-domain
    // near-duplicate pairs (qwen3-embedding-8b via kg-node-embedding); a cross-family
    // adjudicator DECIDES each merge (kg-independent-judge / gpt-oss-120b, deterministic
    // decoding) so the DeepSeek family never decides its own merges. Both opt-in: enrich
    // without them for the U7 baseline.
    nodeEmbedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    nodeMergeAdjudicator: new LiteLlmNodeMergeAdjudicationAdapter(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(new LiteLlmIntrinsicDifficultyJudgmentAdapter(deterministicClient)),
    enrichmentStore: new PostgresEnrichmentRunStore(sql),
    learnerState: emptyLearnerState,
    pathStore: new PostgresLearnerPathStore(sql),
    // Learner Study Loop (ADR-0026): option-select study-item generation stays
    // DeepSeek-family (AGENTS rule 5). Deterministic decoding for stable re-derivation.
    // The Concept Lesson substrate (ADR-0031) is generated in the same operation, before
    // option-select, and persisted through its own store; option-select derives FROM it.
    conceptLessonGeneration: new LiteLlmConceptLessonGenerationAdapter(deterministicClient),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    studyItemGeneration: new LiteLlmStudyItemGenerationAdapter(deterministicClient),
    studyItemBankStore: new PostgresStudyItemBankStore(sql),
    responseLogStore: new PostgresResponseLogStore(sql),
    // Mutable calibration verdict store (R10): the synthetic prefill seeds verdicts here,
    // separate from the append-only graded log.
    verdictStore: new PostgresCalibrationVerdictStore(sql)
  };
}

// Study Item Bank configuration identity — bump when an item prompt/schema/model changes.
const STUDY_ITEM_BANK_CONFIG_HASH = "study-item-bank-v1";

type Context = ReturnType<typeof buildContext>;
type Manifest = { fixtures: { path: string; contentType: string; declaredDomain: string; title: string; source?: string; license?: string }[] };

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
    pipelineConfigHash: PIPELINE_CONFIG_HASH,
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
    groundingGeneration: ctx.groundingGeneration,
    rescueDurabilityJudge: ctx.rescueDurabilityJudge,
    rescuedDefinitionQualityJudge: ctx.rescuedDefinitionQualityJudge,
    mintingDurabilityJudge: process.env.ENRICH_DISABLE_MINTING_DURABILITY ? undefined : ctx.mintingDurabilityJudge,
    // Dedup is opt-in (plan U3): ENRICH_DISABLE_DEDUP unsets both ports to produce the
    // exact-label baseline run for the U7 rule-14 comparison (same command, ports unset).
    nodeEmbedding: process.env.ENRICH_DISABLE_DEDUP ? undefined : ctx.nodeEmbedding,
    nodeMergeAdjudicator: process.env.ENRICH_DISABLE_DEDUP ? undefined : ctx.nodeMergeAdjudicator,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore,
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

async function computeLearnerPathCommand(ctx: Context, enrichmentId?: string, targetRef?: string) {
  if (!enrichmentId || !targetRef) {
    console.error("! compute-learner-path requires <enrichmentId> <target>.");
    process.exitCode = 1;
    return;
  }
  const layer = await ctx.enrichmentStore.getLayer(enrichmentId);
  if (!layer) {
    console.error(`! enrichment ${enrichmentId} not found.`);
    process.exitCode = 1;
    return;
  }
  // `target` is an operator-friendly reference: an anchor concept_id (resolved to its
  // derived node) or a derived_node_id directly. The learner path subject identity is
  // always the derived node (ADR-0026).
  const resolvedTargetId =
    layer.derivedNodes.find((node) => node.nodeKind === "anchor" && node.conceptId === targetRef)?.derivedNodeId ??
    targetRef;
  const learnerPathId = randomUUID();
  console.log(`\n>> learner path ${learnerPathId} for target ${targetRef} from enrichment ${enrichmentId}`);
  const path = await computeLearnerPath({
    learnerPathId,
    enrichmentId,
    targetDerivedNodeId: resolvedTargetId,
    enrichmentStore: ctx.enrichmentStore,
    learnerState: ctx.learnerState,
    pathStore: ctx.pathStore,
    artifacts: ctx.artifacts
  });
  console.log(`   learnerState=${path.learnerStateRef} steps=${path.steps.length}`);
  for (const step of path.steps) {
    console.log(`   #${step.position} [${step.includedReason}] ${step.derivedNodeId} (difficulty=${step.difficulty.toFixed(2)})`);
  }
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

async function computeAdaptivePathCommand(ctx: Context, enrichmentId?: string, targetRef?: string, learnerStateRef?: string) {
  if (!enrichmentId || !targetRef || !learnerStateRef) {
    console.error("! compute-adaptive-path requires <enrichmentId> <target> <learnerStateRef>.");
    process.exitCode = 1;
    return;
  }
  const layer = await ctx.enrichmentStore.getLayer(enrichmentId);
  if (!layer) {
    console.error(`! enrichment ${enrichmentId} not found.`);
    process.exitCode = 1;
    return;
  }
  // `target` is an anchor concept_id; the projection works in derived-node space, so
  // resolve it to the goal anchor's derived node (ADR-0026).
  const targetNodeId = layer.derivedNodes.find((node) => node.nodeKind === "anchor" && node.conceptId === targetRef)?.derivedNodeId;
  if (!targetNodeId) {
    console.error(`! target concept ${targetRef} is not an anchor in enrichment ${enrichmentId}.`);
    process.exitCode = 1;
    return;
  }
  const learnerState = await loadResponseLogLearnerState({
    responseLog: ctx.responseLogStore,
    learnerStateRef
  });

  const learnerPathId = randomUUID();
  console.log(`\n>> adaptive path ${learnerPathId} for goal ${targetRef} / learner ${learnerStateRef} (threshold=${ADAPTIVE_MASTERY_THRESHOLD})`);
  const path = await computeLearnerPath({
    learnerPathId,
    enrichmentId,
    targetDerivedNodeId: targetNodeId,
    enrichmentStore: ctx.enrichmentStore,
    learnerState,
    pathStore: ctx.pathStore,
    artifacts: ctx.artifacts,
    masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD,
    frontierAdvance: true
  });
  console.log(`   advancedTarget=${path.targetDerivedNodeId} learnerState=${path.learnerStateRef} steps=${path.steps.length}`);
  for (const step of path.steps) {
    console.log(`   #${step.position} [${step.includedReason}] ${step.derivedNodeId} (difficulty=${step.difficulty.toFixed(2)})`);
  }
}

// Bottleneck report renderer for code agents (ADR-0029): a per-stage table of
// wall-clock + calls + cost for one operation, or the same structured rows as `--json`.
// Both this CLI and the Admin Lab view call the SAME bottleneckReport use-case; neither
// re-implements the join.
async function bottleneckReportCommand(ctx: Context, operationId: string | undefined, flags: string[]) {
  if (!operationId) {
    console.error("! bottleneck-report requires <operationId> (an extraction run / graph version / enrichment id).");
    process.exitCode = 1;
    return;
  }
  const report = await bottleneckReport({
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
  const report = await bottleneckReport({
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
function emitReport(report: BottleneckReport, flags: string[]) {
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
  renderBottleneckTable(report);
}

function renderBottleneckTable(report: BottleneckReport) {
  console.log(`\n>> ${report.scope} cost report — ${report.anchorId}`);
  if (!report.costAvailable) console.log("   ! LiteLLM spend logs unavailable — cost columns omitted, wall-clock only.");
  const fmtMs = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  const fmtUsd = (usd: number | null) => (usd === null ? "—" : `$${usd.toFixed(4)}`);
  const header = `   ${"stage".padEnd(30)} ${"wall".padStart(9)} ${"calls".padStart(6)} ${"tokens".padStart(10)} ${"cost".padStart(10)}`;
  for (const operation of report.operations) {
    console.log(`\n   [${operation.operationType}] ${operation.operationId} (${operation.status})`);
    console.log(header);
    console.log(`   ${"-".repeat(30)} ${"-".repeat(9)} ${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(10)}`);
    for (const row of operation.stages) {
      console.log(`   ${row.stage.padEnd(30)} ${fmtMs(row.wallClockMs).padStart(9)} ${(row.calls ?? "—").toString().padStart(6)} ${(row.tokens ?? "—").toString().padStart(10)} ${fmtUsd(row.costUsd).padStart(10)}`);
    }
    console.log(`   ${"subtotal".padEnd(30)} ${fmtMs(operation.subtotal.wallClockMs).padStart(9)} ${(operation.subtotal.calls ?? "—").toString().padStart(6)} ${(operation.subtotal.tokens ?? "—").toString().padStart(10)} ${fmtUsd(operation.subtotal.costUsd).padStart(10)}`);
  }
  console.log(`\n   ${report.scope} total: wall=${fmtMs(report.total.wallClockMs)} calls=${report.total.calls ?? "—"} tokens=${report.total.tokens ?? "—"} cost=${fmtUsd(report.total.costUsd)}`);
}

// Ranked-target renderer (U3): a cost-ranked and a wall-ranked list of (operation, stage)
// rows with each target's share of the journey total — the optimization-pass handoff view.
function renderRankedTargets(report: BottleneckReport) {
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

async function generateStudyItemsCommand(ctx: Context, enrichmentId?: string) {
  if (!enrichmentId) {
    console.error("! generate-study-items requires <enrichmentId>.");
    process.exitCode = 1;
    return;
  }
  console.log(`\n>> generating Study Item Bank for enrichment ${enrichmentId}`);
  const result = await generateStudyItemBank({
    enrichmentId,
    configHash: STUDY_ITEM_BANK_CONFIG_HASH,
    graphStore: ctx.graphStore,
    enrichmentStore: ctx.enrichmentStore,
    conceptLessonGeneration: ctx.conceptLessonGeneration,
    conceptLessonStore: ctx.conceptLessonStore,
    studyItemGeneration: ctx.studyItemGeneration,
    studyItemBankStore: ctx.studyItemBankStore,
    reporter: ctx.runProgressReporter
  });
  console.log(`   lessons=${result.lessons.length} lessonAbsent=${result.lessonAbsent.length} items=${result.studyItems.length} rejected=${result.rejected.length} model=${ctx.studyItemGeneration.model}`);
  for (const item of result.studyItems) {
    if (item.itemType === "option_select") {
      const correct = item.options.find((option) => option.isCorrect);
      const distractors = item.options.filter((option) => !option.isCorrect).map((option) => option.text);
      console.log(`   option_select[${item.derivedNodeId}] provenance=${item.groundingProvenance}\n     Q: ${item.question}\n     correct: ${correct?.text}\n     distractors: ${distractors.join(" | ")}`);
    } else {
      const impostor = item.statements.find((statement) => statement.isImpostor);
      const truths = item.statements.filter((statement) => !statement.isImpostor).map((statement) => statement.text);
      console.log(`   impostor[${item.derivedNodeId}] provenance=${item.groundingProvenance} lieSource=${item.lieSource}${item.siblingLabel ? ` sibling=${item.siblingLabel}` : ""}\n     Q: ${item.question}\n     lie: ${impostor?.text}\n     truths: ${truths.join(" | ")}\n     reveal: ${item.reveal}`);
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
    case "compute-learner-path":
      await computeLearnerPathCommand(ctx, arg, rest[0]);
      break;
    case "generate-study-items":
      await generateStudyItemsCommand(ctx, arg);
      break;
    case "synthesize-responses":
      await synthesizeResponsesCommand(ctx, arg, rest[0], rest[1]);
      break;
    case "compute-adaptive-path":
      await computeAdaptivePathCommand(ctx, arg, rest[0], rest[1]);
      break;
    case "list-sources":
      await listSources(ctx);
      break;
    case "bottleneck-report":
      await bottleneckReportCommand(ctx, arg, rest);
      break;
    case "journey-cost-report":
      await journeyCostReportCommand(ctx, arg, rest);
      break;
    default:
      console.log("Usage: worker:kg <register-from-manifest [path] | run-extraction [--all|<sourceResourceId>] | build-graph-version <runId> [<runId> ...] | enrich-graph-version [<graphVersionId>] | compute-learner-path <enrichmentId> <targetDerivedNodeId> | generate-study-items <enrichmentId> | synthesize-responses <enrichmentId> <targetDerivedNodeId> <learnerStateRef> | compute-adaptive-path <enrichmentId> <targetDerivedNodeId> <learnerStateRef> | list-sources | bottleneck-report <operationId> [--json] [--ranked] | journey-cost-report <enrichmentId> [--json] [--ranked]>");
  }
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
