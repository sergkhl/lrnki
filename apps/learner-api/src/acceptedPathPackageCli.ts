import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  createAcceptedPathPackageModule,
  qualifiedSourceExpeditionAssetConfigHash
} from "@lrnki/application";
import {
  parseAcceptedPathManifest,
  type AcceptedPathFixture,
  type AcceptedPathManifest
} from "@lrnki/infrastructure-ingestion";
import { studyItemBankConfigHash } from "@lrnki/infrastructure-litellm";
import {
  PostgresAcceptedPathPackageStore,
  PostgresSourceExpeditionCatalog,
  createDatabaseClient,
  parseCanonicalAcceptedPathPackage,
  serializeAcceptedPathPackage,
  validateAcceptedPathPackageSet
} from "@lrnki/infrastructure-postgres";
import type { AcceptedPathPackage } from "@lrnki/ports";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

type Command = "export" | "validate" | "install";
type Options = {
  command: Command;
  manifest: string;
  catalogKey?: string;
  allowPartial: boolean;
};

const repoRoot = findRepoRoot();

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(repoRoot, options.manifest);
  const manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as {
    fixtures: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  const manifest = parseAcceptedPathManifest(manifestValue);
  if (options.command === "export") {
    await exportAccepted(manifest, manifestValue, manifestPath, options);
    return;
  }

  // Package/digest/completeness validation intentionally precedes environment loading or any
  // database connection. The destructive seed wrapper depends on this ordering.
  const packages = await loadValidatedPackages(manifest, !options.allowPartial);
  if (options.command === "validate") {
    process.stdout.write(`${JSON.stringify({
      valid: true,
      complete: packages.length === manifest.fixtures.length,
      catalogKeys: packages.map((entry) => entry.catalog.catalogKey)
    })}\n`);
    return;
  }

  loadRepoEnv();
  const sql = createDatabaseClient();
  try {
    await assertGuardedDatabase(sql);
    const qualifiedAssetConfigHash = currentQualifiedAssetConfigHash();
    const sourceExpeditions = createLearnerSourceExpeditions(
      sql,
      CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
    );
    const packageModule = createAcceptedPathPackageModule({
      sourceExpeditions,
      catalog: new PostgresSourceExpeditionCatalog(sql),
      packageStore: new PostgresAcceptedPathPackageStore(sql),
      qualifiedAssetConfigHash
    });
    const result = await packageModule.install(packages);
    process.stdout.write(`${JSON.stringify({ installed: true, ...result })}\n`);
  } finally {
    await sql.end();
  }
}

async function exportAccepted(
  manifest: AcceptedPathManifest,
  manifestValue: { fixtures: Array<Record<string, unknown>>; [key: string]: unknown },
  manifestPath: string,
  options: Options
): Promise<void> {
  if (!options.catalogKey) throw new Error("export requires --catalog-key=<key>.");
  const fixture = manifest.fixtures.find((entry) => entry.catalogKey === options.catalogKey);
  if (!fixture) throw new Error(`Unknown accepted catalog key ${JSON.stringify(options.catalogKey)}.`);
  const sourceBytes = await readFile(path.resolve(repoRoot, fixture.path));
  const sourceContentHash = createHash("sha256").update(sourceBytes).digest("hex");

  loadRepoEnv();
  const sql = createDatabaseClient();
  try {
    await assertGuardedDatabase(sql);
    const qualifiedAssetConfigHash = currentQualifiedAssetConfigHash();
    const sourceExpeditions = createLearnerSourceExpeditions(
      sql,
      CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
    );
    const packageModule = createAcceptedPathPackageModule({
      sourceExpeditions,
      catalog: new PostgresSourceExpeditionCatalog(sql),
      packageStore: new PostgresAcceptedPathPackageStore(sql),
      qualifiedAssetConfigHash
    });
    const acceptedPackage = await packageModule.exportAccepted({
      catalogKey: fixture.catalogKey,
      source: {
        fixtureId: fixture.fixtureId,
        path: fixture.path,
        contentHash: sourceContentHash,
        contentType: fixture.contentType,
        declaredDomain: fixture.declaredDomain,
        title: fixture.title,
        sourceUri: fixture.source,
        license: fixture.license
      }
    });
    const text = serializeAcceptedPathPackage(acceptedPackage);
    const sha256 = createHash("sha256").update(text).digest("hex");
    const packagePath = `fixtures/accepted-paths/packages/${fixture.catalogKey}.json`;
    await mkdir(path.dirname(path.resolve(repoRoot, packagePath)), { recursive: true });
    await writeFile(path.resolve(repoRoot, packagePath), text, "utf8");

    const updated = {
      ...manifestValue,
      fixtures: manifestValue.fixtures.map((entry) => entry.catalogKey === fixture.catalogKey
        ? { ...entry, acceptedPackage: { path: packagePath, sha256 } }
        : entry)
    };
    parseAcceptedPathManifest(updated);
    await writeFile(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      exported: true,
      catalogKey: fixture.catalogKey,
      path: packagePath,
      sha256
    })}\n`);
  } finally {
    await sql.end();
  }
}

async function loadValidatedPackages(
  manifest: AcceptedPathManifest,
  requireComplete: boolean
): Promise<AcceptedPathPackage[]> {
  const missing = manifest.fixtures
    .filter((fixture) => !fixture.acceptedPackage)
    .map((fixture) => fixture.catalogKey);
  if (requireComplete && missing.length > 0) {
    throw new Error(`Accepted package set is incomplete: ${missing.join(", ")}.`);
  }
  const packages: AcceptedPathPackage[] = [];
  for (const fixture of manifest.fixtures) {
    if (!fixture.acceptedPackage) continue;
    const text = await readFile(path.resolve(repoRoot, fixture.acceptedPackage.path), "utf8");
    const parsed = parseCanonicalAcceptedPathPackage(text);
    if (parsed.sha256 !== fixture.acceptedPackage.sha256) {
      throw new Error(`Accepted package digest changed for ${JSON.stringify(fixture.catalogKey)}.`);
    }
    await validateManifestBinding(manifest, fixture, parsed.package);
    packages.push(parsed.package);
  }
  if (packages.length === 0) throw new Error("Accepted package set contains no package files.");
  validateAcceptedPathPackageSet(packages);
  return packages;
}

async function validateManifestBinding(
  manifest: AcceptedPathManifest,
  fixture: AcceptedPathFixture,
  acceptedPackage: AcceptedPathPackage
): Promise<void> {
  const expectedCatalog = {
    catalogKey: fixture.catalogKey,
    title: fixture.title,
    teaser: fixture.teaser,
    catalogRole: fixture.catalogRole,
    audience: fixture.audience,
    sortOrder: fixture.catalogOrder,
    sourceProvenance: {
      authorship: manifest.sourcePolicy.authorship,
      knowledgeBasis: manifest.sourcePolicy.knowledgeBasis,
      externalClaimVerificationRequired: manifest.sourcePolicy.externalClaimVerificationRequired,
      acceptanceScope: manifest.sourcePolicy.acceptanceScope
    }
  };
  for (const [field, value] of Object.entries(expectedCatalog)) {
    if (JSON.stringify(acceptedPackage.catalog[field as keyof typeof acceptedPackage.catalog]) !== JSON.stringify(value)) {
      throw new Error(`Accepted package ${JSON.stringify(fixture.catalogKey)} disagrees with manifest ${field}.`);
    }
  }
  const sourceBytes = await readFile(path.resolve(repoRoot, fixture.path));
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  const expectedSource = {
    fixtureId: fixture.fixtureId,
    path: fixture.path,
    contentHash: sourceHash,
    contentType: fixture.contentType,
    declaredDomain: fixture.declaredDomain,
    title: fixture.title,
    sourceUri: fixture.source,
    license: fixture.license
  };
  if (JSON.stringify(acceptedPackage.source) !== JSON.stringify(expectedSource)) {
    throw new Error(`Accepted package ${JSON.stringify(fixture.catalogKey)} disagrees with its source fixture.`);
  }
}

async function assertGuardedDatabase(sql: ReturnType<typeof createDatabaseClient>): Promise<void> {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("DATABASE_URL is required.");
  const target = decodeURIComponent(new URL(targetUrl).pathname.slice(1));
  if (target !== "lrnki" && target !== "lrnki_test") {
    throw new Error(`Accepted package operations require lrnki or lrnki_test, got ${target}.`);
  }
  const rows = await sql<{ current_database: string }[]>`SELECT current_database()`;
  if (rows[0]?.current_database !== target) {
    throw new Error(`Connected to ${rows[0]?.current_database ?? "unknown"} instead of ${target}.`);
  }
}

function currentQualifiedAssetConfigHash(): string {
  return qualifiedSourceExpeditionAssetConfigHash(studyItemBankConfigHash());
}

function loadRepoEnv(): void {
  try {
    process.loadEnvFile(path.join(repoRoot, ".env"));
  } catch {
    // Ambient DATABASE_URL remains valid for explicit test or operator environments.
  }
}

function parseArgs(args: readonly string[]): Options {
  const command = args[0];
  if (command !== "export" && command !== "validate" && command !== "install") {
    throw new Error("Use accepted-paths <export|validate|install>.");
  }
  let manifest = "fixtures/accepted-paths/manifest.json";
  let catalogKey: string | undefined;
  let allowPartial = false;
  for (const argument of args.slice(1)) {
    if (argument === "--") continue;
    if (argument === "--allow-partial") allowPartial = true;
    else if (argument.startsWith("--manifest=")) manifest = requiredValue(argument, "--manifest=");
    else if (argument.startsWith("--catalog-key=")) {
      catalogKey = requiredValue(argument, "--catalog-key=");
    } else throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }
  if (command === "export" && allowPartial) throw new Error("export does not accept --allow-partial.");
  return { command, manifest, catalogKey, allowPartial };
}

function requiredValue(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

function findRepoRoot(): string {
  for (let directory = process.cwd(), depth = 0; depth < 7; depth += 1) {
    if (existsSync(path.join(directory, "pnpm-workspace.yaml"))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error("Could not locate repository root.");
}

await main();
