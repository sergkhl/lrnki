import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  parseSourceMaterialClaimSupportQualificationMatrix,
  qualifySourceMaterialClaimSupport,
  type SourceMaterialClaimSupportQualificationMatrix
} from "@lrnki/application";
import { classifyEvidenceMatch, evidenceQuoteMatches } from "@lrnki/domain-core";
import {
  HtmlStructuredDocumentParser,
  MarkdownStructuredDocumentParser,
  StructuredDocumentParserRegistry,
  TextStructuredDocumentParser
} from "@lrnki/infrastructure-ingestion";
import {
  createNeuralClients,
  createSourceMaterialClaimSupportVerificationPort,
  modelAssignmentIdentity,
  modelRoutingBehaviorIdentity,
  resolveNeuralClientBaseOptions
} from "@lrnki/infrastructure-litellm";

const repoRoot = findRepoRoot();
const tmpRoot = resolve(repoRoot, "tmp");
const matrixPath = resolve(repoRoot, "fixtures/source-material-claim-support-qualification.json");

try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // The caller may supply the same variables through the ambient environment.
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolveOutputPath(args.output ?? defaultOutputPath());
  const matrixBytes = await readFile(matrixPath);
  const matrix = parseSourceMaterialClaimSupportQualificationMatrix(JSON.parse(matrixBytes.toString("utf8")));
  const evidenceResolution = await resolveMatrixEvidence(matrix);
  const base = resolveNeuralClientBaseOptions();
  const verifier = createSourceMaterialClaimSupportVerificationPort(
    createNeuralClients().deterministicClient,
    args.model
  );
  const routingIdentity = modelRoutingBehaviorIdentity(verifier.model);
  const assignmentIdentity = modelAssignmentIdentity(verifier.model);
  const registryEvidence = await readExactProviderRegistryEvidence(routingIdentity);
  const advertisedModels = await readAdvertisedModels(base.baseUrl, base.apiKey);
  if (!advertisedModels.has(verifier.model)) {
    throw new Error(`LiteLLM does not advertise the source-support alias ${JSON.stringify(verifier.model)}.`);
  }

  const qualification = await qualifySourceMaterialClaimSupport({
    matrix,
    verifier,
    resolveEvidence(testCase) {
      const evidence = evidenceResolution.byCase.get(testCase.id);
      if (!evidence) throw new Error(`No resolved evidence for ${JSON.stringify(testCase.id)}.`);
      return evidence;
    },
    onObservation(observation) {
      process.stdout.write([
        observation.caseId,
        `draw=${observation.draw}/${matrix.drawsPerCase}`,
        `expected=${observation.expected}`,
        `observed=${observation.disposition}`,
        `elapsed=${observation.elapsedMs}ms`
      ].join(" ") + "\n");
    }
  });
  const report = {
    schemaVersion: "lrnki.source-material-claim-support-live-qualification.v1",
    authority: "Repeated live qualification of the exact production forced-tool port through the configured LiteLLM alias. It is model-contract and named-harm evidence, not learner-asset usefulness or deployment evidence.",
    matrix: {
      path: relative(repoRoot, matrixPath),
      sha256: createHash("sha256").update(matrixBytes).digest("hex")
    },
    candidate: {
      requestedModel: verifier.model,
      forcedNamedTool: "submit_source_material_claim_support",
      clientSampling: { temperature: 0, seed: 7 },
      proxyAliasAdvertised: true,
      routingIdentity,
      assignmentIdentity,
      registryEvidence
    },
    evidenceResolution: evidenceResolution.report,
    qualification
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    output: relative(repoRoot, outputPath),
    summary: qualification.summary
  }, null, 2)}\n`);
  process.exitCode = qualification.summary.passed ? 0 : 1;
}

async function resolveMatrixEvidence(matrix: SourceMaterialClaimSupportQualificationMatrix): Promise<{
  byCase: Map<string, Array<{ blockText: string; citedQuote: string }>>;
  report: Array<{
    caseId: string;
    evidenceOrdinal: number;
    source: string;
    blockId: string;
    matchKind: "exact" | "normalized";
    blockSha256: string;
  }>;
}> {
  const parsers = new StructuredDocumentParserRegistry([
    new TextStructuredDocumentParser(),
    new HtmlStructuredDocumentParser(),
    new MarkdownStructuredDocumentParser()
  ]);
  const blocksBySource = new Map<string, Array<{ blockId: string; text: string }>>();
  for (const source of matrix.sources) {
    const bytes = new Uint8Array(await readFile(resolve(repoRoot, source.path)));
    const document = await parsers.parserFor(source.contentType).parse({
      sourceResourceId: source.path,
      bytes,
      contentType: source.contentType
    });
    blocksBySource.set(source.path, document.blocks);
  }
  const byCase = new Map<string, Array<{ blockText: string; citedQuote: string }>>();
  const report: Array<{
    caseId: string;
    evidenceOrdinal: number;
    source: string;
    blockId: string;
    matchKind: "exact" | "normalized";
    blockSha256: string;
  }> = [];
  for (const testCase of matrix.cases) {
    const resolved = testCase.evidenceQuotes.map((citedQuote, evidenceOrdinal) => {
      const matches = (blocksBySource.get(testCase.source) ?? [])
        .filter((block) => evidenceQuoteMatches(block.text, citedQuote));
      if (matches.length !== 1) {
        throw new Error(`Qualification case ${JSON.stringify(testCase.id)} evidence ${evidenceOrdinal} resolved ${matches.length} native-parser blocks.`);
      }
      const block = matches[0]!;
      const matchKind = classifyEvidenceMatch(block.text, citedQuote);
      if (matchKind === "none") throw new Error(`Qualification case ${JSON.stringify(testCase.id)} lost its evidence match.`);
      report.push({
        caseId: testCase.id,
        evidenceOrdinal,
        source: testCase.source,
        blockId: block.blockId,
        matchKind,
        blockSha256: createHash("sha256").update(block.text).digest("hex")
      });
      return { blockText: block.text, citedQuote };
    });
    byCase.set(testCase.id, resolved);
  }
  return { byCase, report };
}

async function readAdvertisedModels(baseUrl: string, apiKey: string): Promise<Set<string>> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`LiteLLM model catalog returned HTTP ${response.status}.`);
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return new Set((payload.data ?? []).flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []));
}

async function readExactProviderRegistryEvidence(
  routing: ReturnType<typeof modelRoutingBehaviorIdentity>
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for exact provider preflight.");
  const requiredParameters = ["reasoning", "reasoning_effort", "temperature", "seed", "tools", "tool_choice"];
  const routes = [routing.primary, ...routing.fallbacks];
  const registryByModel = new Map<string, { id?: string; endpoints?: Array<Record<string, unknown>> }>();
  const routeEvidence = [];
  for (const route of routes) {
    const deployment = route.deployments[0];
    if (!deployment || route.deployments.length !== 1) {
      throw new Error(`Source-support route ${JSON.stringify(route.modelGroup)} requires exactly one deployment.`);
    }
    const params = record(record(deployment.behavior, "deployment behavior").litellmParams, "litellmParams");
    const provider = record(record(params.extra_body, "extra_body").provider, "provider");
    const only = stringArray(provider.only, "provider.only");
    const quantizations = stringArray(provider.quantizations, "provider.quantizations");
    if (only.length !== 1 || quantizations.length !== 1) {
      throw new Error(`Source-support route ${JSON.stringify(route.modelGroup)} requires one exact provider tag and quantization.`);
    }
    const upstreamModel = deployment.model.replace(/^openrouter\//, "");
    let registry = registryByModel.get(upstreamModel);
    if (!registry) {
      const response = await fetch(`https://openrouter.ai/api/v1/models/${upstreamModel}/endpoints`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`OpenRouter endpoint registry returned HTTP ${response.status}.`);
      const payload = await response.json() as {
        data?: { id?: string; endpoints?: Array<Record<string, unknown>> };
      };
      registry = payload.data ?? {};
      registryByModel.set(upstreamModel, registry);
    }
    const endpoint = registry.endpoints?.find((entry) => entry.tag === only[0]);
    if (registry.id !== upstreamModel || !endpoint) {
      throw new Error(`Configured source-support route ${JSON.stringify(route.modelGroup)} is absent from the live registry.`);
    }
    if (endpoint.quantization !== quantizations[0]) {
      throw new Error(`Live endpoint quantization differs for ${JSON.stringify(route.modelGroup)}.`);
    }
    const supportedParameters = stringArray(endpoint.supported_parameters, "endpoint.supported_parameters");
    const missing = requiredParameters.filter((parameter) => !supportedParameters.includes(parameter));
    if (missing.length > 0) {
      throw new Error(`Live endpoint ${JSON.stringify(route.modelGroup)} omits ${missing.join(", ")}.`);
    }
    routeEvidence.push({
      modelGroup: route.modelGroup,
      model: registry.id,
      endpoint: {
        name: endpoint.name,
        providerName: endpoint.provider_name,
        tag: endpoint.tag,
        quantization: endpoint.quantization,
        status: endpoint.status,
        contextLength: endpoint.context_length,
        maxCompletionTokens: endpoint.max_completion_tokens,
        supportedParameters
      }
    });
  }
  return {
    verifiedAt: new Date().toISOString(),
    requiredParameters,
    routes: routeEvidence
  };
}

function parseArgs(args: readonly string[]): { output?: string; model?: string } {
  const parsed: { output?: string; model?: string } = {};
  for (const argument of args) {
    if (argument === "--") continue;
    if (argument.startsWith("--output=")) {
      const output = argument.slice("--output=".length).trim();
      if (!output) throw new Error("--output requires a path under tmp/.");
      parsed.output = output;
      continue;
    }
    if (argument.startsWith("--model=")) {
      const model = argument.slice("--model=".length).trim();
      if (!model) throw new Error("--model requires an advertised LiteLLM model group or alias.");
      parsed.model = model;
      continue;
    }
    throw new Error(`Unknown argument ${JSON.stringify(argument)}. Use --output=tmp/<file>.json and optionally --model=<model>.`);
  }
  return parsed;
}

function resolveOutputPath(output: string): string {
  const outputPath = isAbsolute(output) ? resolve(output) : resolve(repoRoot, output);
  if (outputPath !== tmpRoot && !outputPath.startsWith(`${tmpRoot}${sep}`)) {
    throw new Error(`Qualification output must stay under gitignored tmp/, got ${JSON.stringify(output)}.`);
  }
  return outputPath;
}

function defaultOutputPath(): string {
  return `tmp/source-material-claim-support-qualification-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function findRepoRoot(): string {
  for (let directory = process.cwd(), index = 0; index < 6; index += 1, directory = dirname(directory)) {
    if (existsSync(resolve(directory, "pnpm-workspace.yaml"))) return directory;
  }
  throw new Error("Could not find the lrnki repository root.");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value as string[];
}

await main();
