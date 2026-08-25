import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  evaluateQualifiedSourceExpedition
} from "@lrnki/application";
import {
  createAnswerKeyVerificationPort,
  createNeuralClients,
  createSourceMaterialClaimSupportVerificationPort,
  LiteLlmSpendLogsReadAdapter
} from "@lrnki/infrastructure-litellm";
import {
  createDatabaseClient,
  PostgresEnrichmentInspectionRead,
  PostgresInspectionRead,
  PostgresJourneyLineageRead,
  PostgresOperationTimelineRead
} from "@lrnki/infrastructure-postgres";
import type { OperationStageSpendReadPort } from "@lrnki/ports";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tmpRoot = resolve(repoRoot, "tmp");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required; load the repo-root .env before running the evaluation.");
  }
  const sql = createDatabaseClient(databaseUrl);
  const spendLogsRead = process.env.LITELLM_DATABASE_URL
    ? new LiteLlmSpendLogsReadAdapter(process.env.LITELLM_DATABASE_URL)
    : undefined;
  const operationStageSpendRead: OperationStageSpendReadPort = spendLogsRead ?? {
    async readOperationStageSpend() {
      throw new Error("LITELLM_DATABASE_URL is not loaded; cost is unavailable.");
    }
  };
  try {
    const enrichmentRead = new PostgresEnrichmentInspectionRead(sql);
    const sourceExpeditions = createLearnerSourceExpeditions(
      sql,
      CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
    );
    const summaries = (await enrichmentRead.listEnrichmentSummaries())
      .filter((summary) => summary.status === "succeeded" && summary.graphVersionId !== null)
      .sort((left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
        left.enrichmentId.localeCompare(right.enrichmentId)
      );
    const selected = args.enrichmentId
      ? await sourceExpeditions.qualify(args.enrichmentId)
      : await firstQualified(summaries.map((summary) => summary.enrichmentId), sourceExpeditions.qualify);
    if (!selected || selected.status !== "available") {
      const detail = selected?.status === "unavailable" ? ` (${selected.reason})` : "";
      throw new Error(`No structurally qualified Source Expedition candidate was found${detail}.`);
    }

    const { deterministicClient } = createNeuralClients();
    // Read-only post-generation evaluation reuses the exact production ports. It cannot mutate,
    // adopt, or activate learner assets; the resulting model decisions remain report evidence.
    const report = await evaluateQualifiedSourceExpedition({
      qualification: selected,
      sourceEvidenceRead: new PostgresInspectionRead(sql),
      sourceSupportVerifier: createSourceMaterialClaimSupportVerificationPort(deterministicClient),
      answerKeyVerifier: createAnswerKeyVerificationPort(deterministicClient),
      operationEvidence: {
        timelineRead: new PostgresOperationTimelineRead(sql),
        journeyLineageRead: new PostgresJourneyLineageRead(sql),
        operationStageSpendRead
      }
    });
    const outputPath = resolveOutputPath(
      args.output ?? `tmp/source-asset-evaluation-${selected.candidate.enrichmentId}.json`
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      output: relative(repoRoot, outputPath),
      enrichmentId: selected.candidate.enrichmentId,
      claims: report.positiveControls.projectedClaimRows,
      resolvedEvidence: report.positiveControls.resolvedEvidenceRows,
      evaluationCalls: report.evaluationCalls.total,
      activation: report.activation
    })}\n`);
  } finally {
    await sql.end();
    await spendLogsRead?.end();
  }
}

async function firstQualified<T>(
  enrichmentIds: readonly string[],
  qualify: (enrichmentId: string) => Promise<T & { status: "available" | "unavailable" }>
): Promise<(T & { status: "available" | "unavailable" }) | undefined> {
  for (const enrichmentId of enrichmentIds) {
    const candidate = await qualify(enrichmentId);
    if (candidate.status === "available") return candidate;
  }
  return undefined;
}

function parseArgs(args: readonly string[]): { enrichmentId?: string; output?: string } {
  const parsed: { enrichmentId?: string; output?: string } = {};
  for (const arg of args) {
    if (arg === "--") {
      continue;
    } else if (arg.startsWith("--enrichment-id=")) {
      parsed.enrichmentId = requiredValue(arg, "--enrichment-id=");
    } else if (arg.startsWith("--output=")) {
      parsed.output = requiredValue(arg, "--output=");
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(arg)}. Use --enrichment-id=<id> and --output=tmp/<file>.json.`);
    }
  }
  return parsed;
}

function requiredValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

function resolveOutputPath(output: string): string {
  const outputPath = isAbsolute(output) ? resolve(output) : resolve(repoRoot, output);
  if (outputPath !== tmpRoot && !outputPath.startsWith(`${tmpRoot}${sep}`)) {
    throw new Error(`Evaluation output must stay under the gitignored tmp directory, got ${JSON.stringify(output)}.`);
  }
  return outputPath;
}

await main();
