import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { NATIVE_CHALLENGE_ID, NATIVE_SUMMIT_CHALLENGE_ID } from "./guardianFixture";

// Native Maestro runner (plan 2026-07-15-001 U5). It owns fixture-only login values, the loopback
// fixture server lifetime, APK installation, the Maestro process, and evidence paths. It passes the
// ephemeral login to BOTH the fixture server and Maestro's `-e` params without writing it into flow
// YAML. It fails BEFORE UI execution when any prerequisite is missing, with an exact setup command.
// The APK and UI are real; only the upstream data service is deterministic (KTD7). Run:
//   pnpm e2e:native:maestro   (from repo root; requires a booted emulator + installed Maestro)
//   pnpm e2e:native:maestro --device emulator-5554     (when more than one device is attached)
//
// Device selection is explicit because `adb` and Maestro disagree about ambient configuration: adb
// honours `ANDROID_SERIAL`, Maestro does not. Rather than let the two tools silently drive different
// devices, this runner resolves ONE serial and passes it to both, and fails closed when several are
// attached and none was chosen — a run whose target is ambiguous is evidence about nothing.

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const FIXTURE_PORT = process.env.NATIVE_FIXTURE_PORT ?? "8799";
const APK = process.env.NATIVE_APK ?? join(appRoot, "lrnki-learner-e2e.apk");
// The whole flows directory: each file is one scenario with its own ADR-0038 claim, and mixing an
// unproven visual-evidence capture into the adopted-authority flow would blur what a green run
// means. Maestro reports them as separate entries.
const FLOWS = join(appRoot, ".maestro", "flows");
const EVIDENCE = resolve(appRoot, "..", "..", "tmp", "2026-07-15-durable-learner-e2e-gates", "native");

function fail(message: string): never {
  console.error(`\n[native] ${message}\n`);
  process.exit(1);
}

function tool(bin: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function which(bin: string): string | null {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The requested serial, from `--device <serial>` / `--device=<serial>` or `NATIVE_DEVICE`.
function requestedDevice(): string | null {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--device");
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  const inline = argv.find((arg) => arg.startsWith("--device="));
  if (inline) return inline.slice("--device=".length);
  return process.env.NATIVE_DEVICE ?? null;
}

// Serials in the `device` state only: `offline`, `unauthorized`, and `bootloader` entries are not
// runnable targets, and counting them would make the multiple-device check fire spuriously.
function readyDevices(adb: string): string[] {
  return tool(adb, ["devices"]).out
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
}

function preflight(): { adb: string; maestro: string; device: string } {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME ?? "", "Library/Android/sdk");
  const adb = which("adb") ?? join(sdk, "platform-tools", "adb");
  if (!existsSync(adb)) fail(`adb not found. Install the Android SDK platform-tools or set ANDROID_HOME. Looked at ${adb}.`);

  const maestro = which("maestro") ?? join(process.env.HOME ?? "", ".maestro/bin/maestro");
  if (!existsSync(maestro)) fail("maestro not found. Install it: curl -fsSL https://get.maestro.mobile.dev | bash");

  const ready = readyDevices(adb);
  if (ready.length === 0) fail("no booted Android emulator/device. Start one: $ANDROID_HOME/emulator/emulator -avd <name>");

  const requested = requestedDevice();
  if (requested !== null && !ready.includes(requested)) {
    fail(`requested device ${requested} is not attached and ready. Attached: ${ready.join(", ")}.`);
  }
  if (requested === null && ready.length > 1) {
    fail(`${ready.length} devices attached (${ready.join(", ")}). Choose one: pnpm e2e:native:maestro --device ${ready[0]} (or set NATIVE_DEVICE).`);
  }
  const device = requested ?? ready[0];

  if (!existsSync(APK)) fail(`e2e APK not found at ${APK}. Build it: scripts/build-learner-android.sh e2e (set NATIVE_APK to override).`);
  return { adb, maestro, device };
}

let server: ChildProcess | null = null;
function startFixture(ref: string, pin: string): Promise<void> {
  const tsx = join(appRoot, "..", "..", "node_modules", ".bin", "tsx");
  server = spawn(tsx, [join(here, "server.ts")], {
    stdio: "inherit",
    env: { ...process.env, NATIVE_FIXTURE_REF: ref, NATIVE_FIXTURE_PIN: pin, NATIVE_FIXTURE_PORT: FIXTURE_PORT }
  });
  // Wait for the loopback health endpoint before installing/running.
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/health`);
        if (res.ok) return resolvePromise();
      } catch {
        /* not up yet */
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
  const { adb, maestro, device } = preflight();
  console.log(`[native] device ${device}`);
  // `takeScreenshot` writes relative to Maestro's working directory, so the flow's Guardian
  // evidence lands beside the JUnit report instead of in the repository.
  mkdirSync(EVIDENCE, { recursive: true });

  // Ephemeral fixture-only login (R18): generated here, given only to the fixture server and
  // Maestro's `-e` params, never persisted or committed.
  const ref = `native-fixture-${randomBytes(4).toString("hex")}`;
  const pin = String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));
  console.log(`[native] fixture login ref=${ref} (pin withheld)`);

  await startFixture(ref, pin);

  // Emulator reaches the host fixture via 10.0.2.2; nothing else is needed for host loopback.
  console.log(`[native] installing ${APK}`);
  const install = tool(adb, ["-s", device, "install", "-r", "-g", APK]);
  if (!install.ok) {
    stopFixture();
    fail(`adb install failed:\n${install.out}`);
  }

  console.log(`[native] running Maestro flows in ${FLOWS}`);
  const maestroRun = spawnSync(
    maestro,
    [
      "--device", device,
      "test", FLOWS,
      "-e", `LEARNER_REF=${ref}`,
      "-e", `PIN=${pin}`,
      "-e", `GUARDIAN_CHALLENGE_ID=${NATIVE_CHALLENGE_ID}`,
      "-e", `SUMMIT_CHALLENGE_ID=${NATIVE_SUMMIT_CHALLENGE_ID}`,
      "--format", "junit",
      "--output", join(EVIDENCE, "maestro-report.xml")
    ],
    { stdio: "inherit", cwd: EVIDENCE, env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: "60000" } }
  );

  stopFixture();
  if (maestroRun.status !== 0) fail(`Maestro flow failed (exit ${maestroRun.status}). Evidence under ${EVIDENCE}.`);
  console.log(`\n[native] PASS. Evidence under ${EVIDENCE}.`);
  process.exit(0);
}

process.on("SIGINT", () => {
  stopFixture();
  process.exit(130);
});
main().catch((err) => {
  stopFixture();
  fail(err instanceof Error ? err.message : String(err));
});
