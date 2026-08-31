import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import appConfig from "../app.config";
import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD } from "../src/lib/e2eFixture";

// Canonical iOS Debug-simulator smoke. It deliberately drives exactly one flow in one Maestro
// process: Maestro 2.6.x can lose its XCUITest port between flows in directory-batch mode on iOS
// 26.x. The Android runner likewise invokes each scenario separately.
//
// Maestro enumerates Android endpoints even for an explicitly selected iOS simulator. Its bundled
// DADB client probes IPv4 localhost:5555 directly; Docker Desktop also owns that port on this host,
// and the non-ADB listener accepts the socket without completing the ADB handshake. Prefer IPv6 for
// hostname resolution inside Maestro so that probe refuses immediately on ::1. XCUITest itself
// uses an explicit 127.0.0.1 driver endpoint and remains unaffected.

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..");
const FLOW = join(appRoot, ".maestro", "flows-ios", "authored-runtime-smoke.yaml");
const EVIDENCE = join(repoRoot, "tmp", "2026-08-31-authored-learner-runtime", "native-ios");
const FIXTURE_PORT = "8799";
const METRO_ORIGIN = process.env.IOS_METRO_ORIGIN ?? "http://127.0.0.1:8881";
const DEV_CLIENT_URL = `exp+lrnki://expo-development-client/?url=${encodeURIComponent(METRO_ORIGIN)}`;
const APP_ID = appConfig.ios?.bundleIdentifier ?? fail("app.config.ts does not define ios.bundleIdentifier.");

function fail(message: string): never {
  console.error(`\n[native-ios] ${message}\n`);
  process.exit(1);
}

function tool(bin: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(bin, args, { encoding: "utf8", env });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    error: result.error
  };
}

function which(bin: string): string | null {
  const result = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function requestedDevice(): string | null {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--device");
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  const inline = argv.find((arg) => arg.startsWith("--device="));
  return inline?.slice("--device=".length) ?? process.env.NATIVE_IOS_DEVICE ?? null;
}

type Simulator = Readonly<{ name: string; udid: string; state: string; isAvailable?: boolean }>;

function bootedSimulators(): Simulator[] {
  const listed = tool("xcrun", ["simctl", "list", "--json", "devices", "available"]);
  if (!listed.ok) fail(`could not list iOS simulators:\n${listed.out}`);
  const parsed = JSON.parse(listed.out) as { devices: Record<string, Simulator[]> };
  return Object.values(parsed.devices)
    .flat()
    .filter((device) => device.state === "Booted" && device.isAvailable !== false);
}

async function preflight(): Promise<{ maestro: string; device: Simulator }> {
  if (process.platform !== "darwin") fail("the iOS simulator gate requires macOS and Xcode.");
  if (!existsSync(FLOW)) fail(`Maestro flow is missing at ${FLOW}.`);

  const maestro = process.env.NATIVE_MAESTRO ?? which("maestro") ?? join(process.env.HOME ?? "", ".maestro", "bin", "maestro");
  if (!existsSync(maestro)) fail("maestro not found. Install it or set NATIVE_MAESTRO to an exact CLI binary.");

  const simulators = bootedSimulators();
  const requested = requestedDevice();
  if (requested !== null && !simulators.some((device) => device.udid === requested)) {
    fail(`requested simulator ${requested} is not booted. Booted: ${simulators.map((device) => `${device.name} (${device.udid})`).join(", ") || "none"}.`);
  }
  if (requested === null && simulators.length !== 1) {
    fail(`${simulators.length} iOS simulators are booted. Choose one: pnpm e2e:native:maestro:ios --device <udid>.`);
  }
  const device = requested === null ? simulators[0] : simulators.find((candidate) => candidate.udid === requested);
  if (!device) fail("no booted iOS simulator. Boot one, then rebuild with pnpm dev:ios.");

  const installed = tool("xcrun", ["simctl", "get_app_container", device.udid, APP_ID, "app"]);
  if (!installed.ok) fail(`${APP_ID} is not installed on ${device.name}. Build and install it with pnpm dev:ios.`);

  try {
    const status = await fetch(`${METRO_ORIGIN}/status`);
    if (!status.ok || (await status.text()).trim() !== "packager-status:running") throw new Error(`HTTP ${status.status}`);
  } catch {
    fail(`Metro is not running at ${METRO_ORIGIN}. Keep pnpm dev:ios running while this gate executes.`);
  }
  return { maestro, device };
}

let server: ChildProcess | null = null;
type FixtureMeta = Readonly<{ expeditionKey: string; legChallengeId: string; expeditionChallengeId: string }>;

async function startFixture(): Promise<FixtureMeta> {
  try {
    const occupied = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/health`);
    if (occupied.ok) fail(`fixture port ${FIXTURE_PORT} is already serving. Stop the old native fixture before running this owned gate.`);
  } catch {
    // Expected: the runner owns the port from here.
  }

  const tsx = join(repoRoot, "node_modules", ".bin", "tsx");
  server = spawn(tsx, [join(here, "server.ts")], {
    stdio: "inherit",
    env: { ...process.env, NATIVE_FIXTURE_PORT: FIXTURE_PORT }
  });
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = async (): Promise<void> => {
      if (server?.exitCode !== null) return reject(new Error(`fixture server exited with ${server?.exitCode}.`));
      try {
        const health = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/health`);
        if (health.ok) {
          const meta = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/fixture`);
          if (!meta.ok) return reject(new Error("fixture metadata endpoint refused"));
          return resolvePromise(await meta.json() as FixtureMeta);
        }
      } catch {
        // Not listening yet.
      }
      if (Date.now() > deadline) return reject(new Error(`fixture server did not become healthy on :${FIXTURE_PORT}`));
      setTimeout(() => void poll(), 250);
    };
    void poll();
  });
}

function stopFixture(): void {
  if (server && !server.killed) server.kill("SIGTERM");
}

async function main(): Promise<void> {
  const { maestro, device } = await preflight();
  const fixture = await startFixture();
  mkdirSync(EVIDENCE, { recursive: true });

  console.log(`[native-ios] ${device.name} (${device.udid})`);
  console.log(`[native-ios] Debug client ${APP_ID} → ${METRO_ORIGIN}; fixture identity ${E2E_FIXTURE_EMAIL} (password withheld)`);

  const existingOpts = process.env.MAESTRO_OPTS?.trim();
  const maestroOpts = [existingOpts, "-Djava.net.preferIPv6Addresses=true"].filter(Boolean).join(" ");
  const run = spawnSync(
    maestro,
    [
      "--platform", "ios",
      "--device", device.udid,
      "test", FLOW,
      "-e", `IOS_DEV_CLIENT_URL=${DEV_CLIENT_URL}`,
      "-e", `LEARNER_EMAIL=${E2E_FIXTURE_EMAIL}`,
      "-e", `LEARNER_PASSWORD=${E2E_FIXTURE_PASSWORD}`,
      "-e", `EXPEDITION_KEY=${fixture.expeditionKey}`,
      "-e", `GUARDIAN_CHALLENGE_ID=${fixture.legChallengeId}`,
      "-e", `SUMMIT_CHALLENGE_ID=${fixture.expeditionChallengeId}`,
      "--debug-output", join(EVIDENCE, "debug"),
      "--flatten-debug-output",
      "--test-output-dir", EVIDENCE,
      "--format", "JUNIT",
      "--output", join(EVIDENCE, "maestro-report.xml")
    ],
    {
      stdio: "inherit",
      cwd: EVIDENCE,
      timeout: 5 * 60_000,
      env: { ...process.env, MAESTRO_OPTS: maestroOpts, MAESTRO_DRIVER_STARTUP_TIMEOUT: "60000" }
    }
  );

  stopFixture();
  if (run.error) fail(`Maestro could not complete: ${run.error.message}. Evidence under ${EVIDENCE}.`);
  if (run.status !== 0) fail(`Maestro iOS smoke failed (exit ${run.status}). Evidence under ${EVIDENCE}.`);
  console.log(`\n[native-ios] PASS. Evidence under ${EVIDENCE}.`);
}

process.on("SIGINT", () => {
  stopFixture();
  process.exit(130);
});

main().catch((error) => {
  stopFixture();
  fail(error instanceof Error ? error.message : String(error));
});
