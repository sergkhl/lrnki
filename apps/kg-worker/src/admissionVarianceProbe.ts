import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { applyAdmissionPolicy } from "@lrnki/application";
import {
  HtmlStructuredDocumentParser,
  MarkdownStructuredDocumentParser,
  StructuredDocumentParserRegistry,
  TextStructuredDocumentParser
} from "@lrnki/infrastructure-ingestion";
import {
  LiteLlmConceptAdmissionAdapter,
  LiteLlmConceptDiscoveryAdapter,
  LiteLlmForcedToolClient
} from "@lrnki/infrastructure-litellm";
import { randomUUID } from "node:crypto";
import type { DiscoveredCandidate } from "@lrnki/domain-core";

// Admission-variance probe (TODO 1). Isolates the variable under test: discover
// candidates ONCE so the input to admission is frozen, then run admission N
// times per arm and measure how much the `core` set drifts. This is the cheap,
// focused alternative to re-running the full pipeline end-to-end.
//
// Arm A (baseline): default sampling — no temperature/seed sent (current prod).
// Arm B (fixed):    temperature 0 + fixed seed (the determinism lever).

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
  /* optional */
}

const FIXTURES: Record<string, { path: string; contentType: string; declaredDomain: string }> = {
  rust: { path: "fixtures/markdown/rust-book-ch04-01-what-is-ownership.md", contentType: "text/markdown", declaredDomain: "software engineering" },
  biology: { path: "fixtures/html/openstax-biology-2e-14-3-dna-replication.html", contentType: "text/html", declaredDomain: "molecular biology" },
  economics: { path: "fixtures/plaintext/wealth-of-nations-book1-ch1-3.txt", contentType: "text/plain", declaredDomain: "economics" }
};

const parsers = new StructuredDocumentParserRegistry([
  new MarkdownStructuredDocumentParser(),
  new HtmlStructuredDocumentParser(),
  new TextStructuredDocumentParser()
]);

function makeClient(deterministic: boolean): LiteLlmForcedToolClient {
  return new LiteLlmForcedToolClient({
    baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY ?? "sk-local",
    timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "300") * 1000,
    ...(deterministic ? { temperature: 0, seed: 7 } : {})
  });
}

type ArmResult = {
  arm: string;
  runs: number;
  coreCounts: number[];
  coreCountMin: number;
  coreCountMax: number;
  coreCountSpread: number;
  // candidateKey -> number of runs it was classified `core`
  coreFrequency: Record<string, number>;
  unstableCandidates: { candidateKey: string; coreRuns: number }[];
  flipRate: number; // fraction of candidates that were core in some runs but not all
};

async function runArm(
  arm: string,
  candidates: DiscoveredCandidate[],
  document: import("@lrnki/domain-core").StructuredDocument,
  declaredDomain: string,
  deterministic: boolean,
  runs: number
): Promise<ArmResult> {
  const admission = new LiteLlmConceptAdmissionAdapter(makeClient(deterministic));
  const coreFrequency: Record<string, number> = {};
  for (const candidate of candidates) coreFrequency[candidate.candidateKey] = 0;
  const coreCounts: number[] = [];

  for (let i = 0; i < runs; i++) {
    const decisions = await admission.admit({ document, declaredDomain, candidates });
    const decisionByKey = new Map(decisions.map((decision) => [decision.candidateKey, decision] as const));
    const blockText = new Map(document.blocks.map((block) => [block.blockId, block.text] as const));
    const coreKeys = candidates
      .map((candidate) => applyAdmissionPolicy({ candidate, proposal: decisionByKey.get(candidate.candidateKey), blockText }))
      .filter((candidate) => candidate.admission.tier === "core")
      .map((candidate) => candidate.candidateKey);
    coreCounts.push(coreKeys.length);
    for (const key of coreKeys) coreFrequency[key] = (coreFrequency[key] ?? 0) + 1;
    console.log(`   [${arm}] run ${i + 1}/${runs}: core=${coreKeys.length}`);
  }

  const unstableCandidates = Object.entries(coreFrequency)
    .filter(([, n]) => n > 0 && n < runs)
    .map(([candidateKey, coreRuns]) => ({ candidateKey, coreRuns }))
    .sort((a, b) => b.coreRuns - a.coreRuns);
  const everCore = Object.values(coreFrequency).filter((n) => n > 0).length;

  return {
    arm,
    runs,
    coreCounts,
    coreCountMin: Math.min(...coreCounts),
    coreCountMax: Math.max(...coreCounts),
    coreCountSpread: Math.max(...coreCounts) - Math.min(...coreCounts),
    coreFrequency,
    unstableCandidates,
    flipRate: everCore === 0 ? 0 : unstableCandidates.length / everCore
  };
}

async function main() {
  const fixtureKey = process.argv[2] ?? "rust";
  const runs = Number(process.argv[3] ?? "5");
  const fixture = FIXTURES[fixtureKey];
  if (!fixture) throw new Error(`Unknown fixture '${fixtureKey}'. Choices: ${Object.keys(FIXTURES).join(", ")}`);

  console.log(`# Admission variance probe: fixture=${fixtureKey} runs/arm=${runs}`);
  const bytes = new Uint8Array(await readFile(path.resolve(REPO_ROOT, fixture.path)));
  const document = await parsers.parserFor(fixture.contentType).parse({ sourceResourceId: randomUUID(), bytes, contentType: fixture.contentType });

  // Discover ONCE — freeze the admission input so we measure admission variance only.
  const discovery = new LiteLlmConceptDiscoveryAdapter(makeClient(true));
  const candidates = await discovery.discover({ document, declaredDomain: fixture.declaredDomain });
  console.log(`Discovered ${candidates.length} candidates (frozen for both arms).\n`);

  console.log("Arm A — baseline (default sampling):");
  const baseline = await runArm("baseline", candidates, document, fixture.declaredDomain, false, runs);
  console.log("\nArm B — fixed (temperature 0 + seed):");
  const fixed = await runArm("fixed", candidates, document, fixture.declaredDomain, true, runs);

  const report = {
    fixture: fixtureKey,
    runsPerArm: runs,
    discoveredCandidates: candidates.length,
    baseline,
    fixed,
    generatedAt: new Date().toISOString()
  };
  const outDir = path.join(REPO_ROOT, "tmp");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `admission-variance-${fixtureKey}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n===== SUMMARY =====");
  for (const arm of [baseline, fixed]) {
    console.log(`${arm.arm}: core counts=[${arm.coreCounts.join(",")}] spread=${arm.coreCountSpread} flipRate=${(arm.flipRate * 100).toFixed(0)}% unstable=${arm.unstableCandidates.length}`);
    if (arm.unstableCandidates.length) {
      console.log(`   unstable: ${arm.unstableCandidates.map((u) => `${u.candidateKey}(${u.coreRuns}/${arm.runs})`).join(", ")}`);
    }
  }
  console.log(`\nReport: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
