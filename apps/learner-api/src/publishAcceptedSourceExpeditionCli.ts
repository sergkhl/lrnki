import { readFile } from "node:fs/promises";
import path from "node:path";
import { CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY } from "@lrnki/application";
import { parseAcceptedPathManifest } from "@lrnki/infrastructure-ingestion";
import { createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(repoRoot, args.manifest);
  const manifest = parseAcceptedPathManifest(
    JSON.parse(await readFile(manifestPath, "utf8"))
  );
  const fixture = manifest.fixtures.find((entry) => entry.catalogKey === args.catalogKey);
  if (!fixture) {
    throw new Error(`Accepted catalog key ${JSON.stringify(args.catalogKey)} is not in the manifest.`);
  }

  const sql = createDatabaseClient();
  try {
    const sourceExpeditions = createLearnerSourceExpeditions(
      sql,
      CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
    );
    const result = await sourceExpeditions.publishAccepted({
      enrichmentId: args.enrichmentId,
      catalogKey: fixture.catalogKey,
      title: fixture.title,
      teaser: fixture.teaser,
      catalogRole: fixture.catalogRole,
      audience: fixture.audience,
      sortOrder: fixture.catalogOrder,
      sourceProvenance: {
        authorship: manifest.sourcePolicy.authorship,
        knowledgeBasis: manifest.sourcePolicy.knowledgeBasis,
        externalClaimVerificationRequired:
          manifest.sourcePolicy.externalClaimVerificationRequired,
        acceptanceScope: manifest.sourcePolicy.acceptanceScope
      }
    });
    if (!result.published) {
      throw new Error(`Accepted publication refused: ${result.refused}.`);
    }
    process.stdout.write(`${JSON.stringify({
      published: true,
      catalogKey: fixture.catalogKey,
      enrichmentId: args.enrichmentId
    })}\n`);
  } finally {
    await sql.end();
  }
}

function parseArgs(args: readonly string[]): {
  catalogKey: string;
  enrichmentId: string;
  manifest: string;
} {
  let catalogKey: string | undefined;
  let enrichmentId: string | undefined;
  let manifest = "fixtures/accepted-paths/manifest.json";
  for (const arg of args) {
    if (arg === "--") continue;
    if (arg.startsWith("--catalog-key=")) {
      catalogKey = requiredValue(arg, "--catalog-key=");
    } else if (arg.startsWith("--enrichment-id=")) {
      enrichmentId = requiredValue(arg, "--enrichment-id=");
    } else if (arg.startsWith("--manifest=")) {
      manifest = requiredValue(arg, "--manifest=");
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(arg)}.`);
    }
  }
  if (!catalogKey || !enrichmentId) {
    throw new Error("Use --catalog-key=<key> and --enrichment-id=<uuid>.");
  }
  return { catalogKey, enrichmentId, manifest };
}

function requiredValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

await main();
