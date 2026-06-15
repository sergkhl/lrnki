import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGraphVersion,
  computeLearnerPath,
  dagDepthDifficultyPort,
  emptyLearnerState,
  executeExtractionRun,
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
  LiteLlmClaimEntailmentJudgmentAdapter,
  LiteLlmClaimExtractionAdapter,
  LiteLlmConceptAdmissionAdapter,
  LiteLlmConceptDiscoveryAdapter,
  LiteLlmEmbeddingAdapter,
  LiteLlmForcedToolClient,
  LiteLlmPrerequisiteJudgmentAdapter
} from "@lrnki/infrastructure-litellm";
import {
  PostgresArtifactRepository,
  PostgresEnrichmentRunStore,
  PostgresExtractionRunStore,
  PostgresGraphVersionStore,
  PostgresLearnerPathStore,
  PostgresSourceRegistrationStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// Pipeline configuration identity — bump when prompts/models/schemas change so
// runs are attributable to a configuration (ADR-0017).
const PIPELINE_CONFIG_HASH = "cep-reset-deepseek-v4-flash-no-thinking-atomic-admission-source-role-v31";

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
    // frozen oracle suite; bump DOCLING_IMAGE_TAG when docker/Dockerfile changes.
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
    claimExtraction: new LiteLlmClaimExtractionAdapter(deterministicClient),
    // Semantic claim-entailment judge (ADR-0007). Independent model (Mistral
    // Small via kg-oracle-judge) so the judge is not the extractor re-grading
    // itself; deterministic decoding for stable re-derivation.
    claimEntailmentJudge: new LiteLlmClaimEntailmentJudgmentAdapter(deterministicClient),
    // Concept-vs-proposition admission judge (ADR-0005). Same independent family
    // (kg-oracle-judge) and deterministic decoding; downgrade-only stage that
    // replaces the removed looksLikePropositionLabel lexical veto.
    admissionLabelJudge: new LiteLlmAdmissionLabelJudgmentAdapter(deterministicClient),
    // Graph Enrichment ports (ADR-0019). Embedding clusters/gates pairs; the
    // bounded judge proposes the inferred DAG (deterministic decoding for stable
    // re-derivation); difficulty + learner state are mocks behind real ports.
    embedding: new LiteLlmEmbeddingAdapter(baseClient),
    prerequisiteJudge: new LiteLlmPrerequisiteJudgmentAdapter(deterministicClient),
    difficulty: dagDepthDifficultyPort,
    enrichmentStore: new PostgresEnrichmentRunStore(sql),
    learnerState: emptyLearnerState,
    pathStore: new PostgresLearnerPathStore(sql)
  };
}

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
      claimExtraction: ctx.claimExtraction,
      claimEntailmentJudge: ctx.claimEntailmentJudge,
      admissionLabelJudge: ctx.admissionLabelJudge,
      store: ctx.runStore,
      artifacts: ctx.artifacts
    });
    const core = result.candidates.filter((candidate) => candidate.admission.tier === "core").length;
    const verified = result.claims.filter((claim) => claim.validationOutcome === "verified").length;
    const rejected = result.claims.length - verified;
    console.log(`   candidates=${result.candidates.length} core=${core} claims(verified/rejected)=${verified}/${rejected} proposals=${result.proposals.length} latency=${result.latencyMs}ms`);
  }
}

async function buildVersion(ctx: Context, runIds: string[]) {
  // Publication selects Extraction Runs explicitly by id. A run passing the
  // mechanical/evidence gates ('succeeded') is not automatically publishable —
  // the operator must name the runs they inspected and judged sound, so a
  // semantically-bad-but-valid run never silently mutates the graph (AGENTS
  // rule 11; ADR-0017 builds are a pure function of the selected runs).
  if (runIds.length === 0) {
    console.error("! build-graph-version requires one or more explicit run IDs (no automatic 'latest succeeded' selection).");
    console.error("  Inspect runs first, then: worker:kg build-graph-version <runId> [<runId> ...]");
    process.exitCode = 1;
    return;
  }
  const graphVersionId = randomUUID();
  const snapshot = await buildGraphVersion({ graphVersionId, runIds, runStore: ctx.runStore, graphStore: ctx.graphStore, artifacts: ctx.artifacts });
  console.log(`\n>> published graph version ${graphVersionId} from ${runIds.length} run(s): concepts=${snapshot.concepts.length} claims=${snapshot.claims.length}`);
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
    embedding: ctx.embedding,
    prerequisiteJudge: ctx.prerequisiteJudge,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore
  });
  const certain = layer.prerequisiteEdges.filter((edge) => !edge.uncertain).length;
  const uncertain = layer.prerequisiteEdges.length - certain;
  console.log(
    `   candidateGroups=${layer.prerequisiteCandidateGroups.length} edges(certain/uncertain)=${certain}/${uncertain} difficulties=${layer.difficulties.length} embedding=${layer.embeddingModel} judge=${layer.judgeModel}`
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
      case "list-sources":
        await listSources(ctx);
        break;
      default:
        console.log("Usage: worker:kg <register-from-manifest [path] | run-extraction [--all|<sourceResourceId>] | build-graph-version <runId> [<runId> ...] | enrich-graph-version [<graphVersionId>] | compute-learner-path <enrichmentId> <targetConceptId> | list-sources>");
    }
  } finally {
    await ctx.sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
