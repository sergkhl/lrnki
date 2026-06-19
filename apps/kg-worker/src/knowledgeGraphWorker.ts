import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGraphVersion,
  computeLearnerPath,
  createIntrinsicDifficultyPort,
  emptyLearnerState,
  executeExtractionRun,
  generateCardBank,
  runGraphEnrichment
} from "@lrnki/application";
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
  LiteLlmEvidenceProfileExtractionAdapter,
  LiteLlmConceptAdmissionAdapter,
  LiteLlmCardGenerationAdapter,
  LiteLlmConceptDiscoveryAdapter,
  LiteLlmForcedToolClient,
  LiteLlmGroundingGenerationAdapter,
  LiteLlmIntrinsicDifficultyJudgmentAdapter,
  LiteLlmMissingPrerequisiteProposalAdapter,
  LiteLlmPrerequisiteJudgmentAdapter,
  LiteLlmRescueDurabilityJudgmentAdapter,
  GENERATED_PREREQUISITE_JUDGE_MODEL
} from "@lrnki/infrastructure-litellm";
import {
  PostgresArtifactRepository,
  PostgresEnrichmentRunStore,
  PostgresExtractionRunStore,
  PostgresCardBankStore,
  PostgresGraphVersionStore,
  PostgresLearnerPathStore,
  PostgresSourceRegistrationStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// Pipeline configuration identity — bump when prompts/models/schemas change so
// runs are attributable to a configuration (ADR-0017).
const PIPELINE_CONFIG_HASH = "structure-aware-neighborhood-v37";

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
    timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "300") * 1000
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
  return {
    sql,
    registrationStore,
    runStore,
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
    // Graph Enrichment ports (ADR-0019 reset). Every same-domain CEP pair is judged
    // exhaustively — no embedding clustering tier; the bounded judge proposes the
    // inferred DAG (deterministic decoding for stable re-derivation). Difficulty is
    // learner-neutral intrinsic: a cross-family neural subscore fused with
    // deterministic graph/evidence components.
    prerequisiteJudge: new LiteLlmPrerequisiteJudgmentAdapter(deterministicClient),
    // Cross-family generated-node ordering judge (ADR-0023, U7): any pair touching an
    // `llm_grounded` minted node routes here (gpt-oss-120b) so the DeepSeek generator
    // never grades its own minted output; anchor-only ordering stays on DeepSeek.
    generatedPrerequisiteJudge: new LiteLlmPrerequisiteJudgmentAdapter(deterministicClient, GENERATED_PREREQUISITE_JUDGE_MODEL),
    // Node-minting ports (U5): explicit prerequisite proposal (node identity) +
    // anchor-conditioned grounding generation, both DeepSeek-family (AGENTS rule 5).
    missingPrerequisiteProposal: new LiteLlmMissingPrerequisiteProposalAdapter(deterministicClient),
    groundingGeneration: new LiteLlmGroundingGenerationAdapter(deterministicClient),
    // Measured rescue durability judge (U3): cross-family independent judge
    // (kg-independent-judge) decides whether each aggregated source_mentioned rescue
    // candidate is a durable prerequisite before it becomes a derived node. Drop-only,
    // fail-open-with-flag; the DeepSeek generator never grades rescue durability.
    rescueDurabilityJudge: new LiteLlmRescueDurabilityJudgmentAdapter(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(new LiteLlmIntrinsicDifficultyJudgmentAdapter(deterministicClient)),
    enrichmentStore: new PostgresEnrichmentRunStore(sql),
    learnerState: emptyLearnerState,
    pathStore: new PostgresLearnerPathStore(sql),
    // Learner Recall Loop (U2): card generation stays DeepSeek-family (AGENTS rule 5);
    // a cross-family judge grades learner answers against the key (U5). Deterministic
    // decoding for stable re-derivation.
    cardGeneration: new LiteLlmCardGenerationAdapter(deterministicClient),
    cardBankStore: new PostgresCardBankStore(sql)
  };
}

// Card Bank configuration identity — bump when the card prompt/schema/model changes.
const CARD_BANK_CONFIG_HASH = "card-bank-v1";

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
  for (const { sourceResourceId: id } of sources) {
    const source = await ctx.registrationStore.getRegisteredSource(id);
    if (!source) {
      console.error(`! source not found: ${id}`);
      continue;
    }
    const runId = randomUUID();
    console.log(`\n>> extraction run ${runId} for ${id} [${source.declaredDomain}]`);
    const result = await executeExtractionRun({
      runId,
      source,
      pipelineConfigHash: PIPELINE_CONFIG_HASH,
      discovery: ctx.discovery,
      admission: ctx.admission,
      evidenceProfileExtraction: ctx.evidenceProfileExtraction,
      assertionEntailmentJudge: ctx.assertionEntailmentJudge,
      admissionLabelJudge: ctx.admissionLabelJudge,
      store: ctx.runStore
    });
    const core = result.candidates.filter((candidate) => candidate.admission.tier === "core").length;
    const profiles = result.evidenceProfiles;
    const incomplete = profiles.filter((profile) => !profile.complete).length;
    const definitions = profiles.reduce((sum, profile) => sum + profile.definitions.length, 0);
    const mentions = profiles.reduce((sum, profile) => sum + profile.mentions.length, 0);
    const assertions = profiles.reduce((sum, profile) => sum + profile.assertions.length, 0);
    console.log(`   status=${result.status} candidates=${result.candidates.length} core=${core} CEPs=${profiles.length}(incomplete=${incomplete}) defs=${definitions} mentions=${mentions} assertions=${assertions} latency=${result.latencyMs}ms`);
  }
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
  const snapshot = await buildGraphVersion({ graphVersionId, baseGraphVersionId, runIds, runStore: ctx.runStore, graphStore: ctx.graphStore });
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
    prerequisiteJudge: ctx.prerequisiteJudge,
    generatedPrerequisiteJudge: ctx.generatedPrerequisiteJudge,
    missingPrerequisiteProposal: ctx.missingPrerequisiteProposal,
    groundingGeneration: ctx.groundingGeneration,
    rescueDurabilityJudge: ctx.rescueDurabilityJudge,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore
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
    console.log(`   edge: ${edge.prerequisiteConceptId} -> ${edge.dependentConceptId} (conf=${edge.confidence.toFixed(2)})`);
  }
}

async function computeLearnerPathCommand(ctx: Context, enrichmentId?: string, targetConceptId?: string) {
  if (!enrichmentId || !targetConceptId) {
    console.error("! compute-learner-path requires <enrichmentId> <targetConceptId>.");
    process.exitCode = 1;
    return;
  }
  const learnerPathId = randomUUID();
  console.log(`\n>> learner path ${learnerPathId} for target ${targetConceptId} from enrichment ${enrichmentId}`);
  const path = await computeLearnerPath({
    learnerPathId,
    enrichmentId,
    targetConceptId,
    enrichmentStore: ctx.enrichmentStore,
    learnerState: ctx.learnerState,
    pathStore: ctx.pathStore,
    artifacts: ctx.artifacts
  });
  console.log(`   learnerState=${path.learnerStateRef} steps=${path.steps.length}`);
  for (const step of path.steps) {
    console.log(`   #${step.position} [${step.includedReason}] ${step.conceptId} (difficulty=${step.difficulty.toFixed(2)})`);
  }
}

async function generateCardsCommand(ctx: Context, graphVersionId?: string) {
  // Card Bank generation (U2): published version + its CEPs -> one learner-neutral
  // card per anchor Concept. Default to the latest published version when none named.
  let targetVersionId = graphVersionId;
  if (!targetVersionId) {
    const snapshot = await ctx.graphStore.getLatestPublishedSnapshot();
    if (!snapshot) {
      console.error("! no published graph version to generate cards for.");
      process.exitCode = 1;
      return;
    }
    targetVersionId = snapshot.graphVersionId;
  }
  console.log(`\n>> generating Card Bank for graph version ${targetVersionId}`);
  const result = await generateCardBank({
    graphVersionId: targetVersionId,
    configHash: CARD_BANK_CONFIG_HASH,
    graphStore: ctx.graphStore,
    cardGeneration: ctx.cardGeneration,
    cardBankStore: ctx.cardBankStore
  });
  console.log(`   cards=${result.cards.length} rejected=${result.rejected.length} model=${ctx.cardGeneration.model}`);
  for (const card of result.cards) {
    console.log(`   card[${card.conceptId}] citations=${card.citations.length}\n     Q: ${card.question}\n     A: ${card.answerKey}`);
  }
  for (const rejected of result.rejected) {
    console.log(`   ! rejected ${rejected.canonicalLabel} (${rejected.conceptId}): ${rejected.reason}`);
  }
}

async function listSources(ctx: Context) {
  for (const source of await ctx.registrationStore.listSources()) {
    console.log(`${source.sourceResourceId}  [${source.declaredDomain}]  ${source.title}`);
  }
}

async function main() {
  const [command, arg, ...rest] = process.argv.slice(2);
  const ctx = buildContext();
  try {
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
      case "generate-cards":
        await generateCardsCommand(ctx, arg);
        break;
      case "list-sources":
        await listSources(ctx);
        break;
      default:
        console.log("Usage: worker:kg <register-from-manifest [path] | run-extraction [--all|<sourceResourceId>] | build-graph-version <runId> [<runId> ...] | enrich-graph-version [<graphVersionId>] | compute-learner-path <enrichmentId> <targetConceptId> | generate-cards [<graphVersionId>] | list-sources>");
    }
  } finally {
    await ctx.sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
