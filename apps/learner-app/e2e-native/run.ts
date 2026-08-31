import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD } from "../src/lib/e2eFixture";
import appConfig from "../app.config";

// Native Maestro runner. It owns the loopback fixture server lifetime, APK installation, the
// Maestro process, and evidence paths. It passes the
// shared fixture identity only to the dedicated manual sign-in flow. It fails BEFORE UI execution
// when any prerequisite is missing, with an exact setup command.
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
// Read from the canonical Expo config rather than restated here, so the id this runner uninstalls
// is by construction the one the APK installs as.
const APP_ID = appConfig.android?.package ?? fail("app.config.ts does not define android.package.");
// One Maestro PROCESS per flow, not one directory-batch process. A fresh driver session keeps an
// opaque driver failure in one scenario from poisoning later scenarios and makes the README's
// evidence boundary mechanically true. Keep the order explicit: auth first, the adopted Support
// authority second, and judgment-only Guardian screenshots last.
const FLOWS = [
  "signin.yaml",
  "android-runtime-reliability.yaml",
  "crystal-guardian-obelisk.yaml"
].map((name) => ({ name: name.replace(/\.yaml$/, ""), path: join(appRoot, ".maestro", "flows", name) }));
const EVIDENCE = resolve(appRoot, "..", "..", "tmp", "2026-08-31-authored-learner-runtime", "native");

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
  const adb = process.env.NATIVE_ADB ?? which("adb") ?? join(sdk, "platform-tools", "adb");
  if (!existsSync(adb)) {
    fail(`adb not found. Install platform-tools or set NATIVE_ADB to an exact binary. Looked at ${adb}.`);
  }

  const maestro = process.env.NATIVE_MAESTRO
    ?? which("maestro")
    ?? join(process.env.HOME ?? "", ".maestro/bin/maestro");
  if (!existsSync(maestro)) {
    fail("maestro not found. Install it or set NATIVE_MAESTRO to an exact CLI binary.");
  }

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

// Android identifies an installed app by package name AND signing certificate jointly, so a package
// left behind by a differently-signed build cannot be updated: `pm` answers
// INSTALL_FAILED_UPDATE_INCOMPATIBLE whatever the version code, and neither `-r` nor `-d` overrides
// it. That collision is routine here, because two legitimate pipelines claim the same id — this gate
// installs the EAS-signed `e2e` APK, while `pnpm dev:android` installs a local build signed with the
// React Native template debug keystore. Uninstalling the resident copy is the only resolution, so do
// it and retry once instead of aborting a run whose fixture server is already up. Every other
// install failure still fails closed on the first attempt: this recovers from one identified cause,
// it is not a blanket retry.
function installApk(adb: string, device: string): { ok: boolean; out: string } {
  const first = tool(adb, ["-s", device, "install", "-r", "-g", APK]);
  if (first.ok || !first.out.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) return first;

  console.log(`[native] ${APP_ID} is installed from a differently-signed build; uninstalling it (its app data is erased) and retrying`);
  const removed = tool(adb, ["-s", device, "uninstall", APP_ID]);
  if (!removed.ok) return { ok: false, out: `${first.out}\nuninstall ${APP_ID} failed:\n${removed.out}` };

  const second = tool(adb, ["-s", device, "install", "-r", "-g", APK]);
  return second.ok ? second : { ok: false, out: `${first.out}\nafter uninstalling ${APP_ID}:\n${second.out}` };
}

let server: ChildProcess | null = null;
type FixtureMeta = Readonly<{
  expeditionKey: string;
  legChallengeId: string;
  expeditionChallengeId: string;
}>;

function startFixture(): Promise<FixtureMeta> {
  const tsx = join(appRoot, "..", "..", "node_modules", ".bin", "tsx");
  server = spawn(tsx, [join(here, "server.ts")], {
    stdio: "inherit",
    env: { ...process.env, NATIVE_FIXTURE_PORT: FIXTURE_PORT }
  });
  // Wait for the loopback health endpoint before installing/running.
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/health`);
        if (res.ok) {
          const meta = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/fixture`);
          if (!meta.ok) return reject(new Error("fixture metadata endpoint refused"));
          return resolvePromise(await meta.json() as FixtureMeta);
        }
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

  console.log(`[native] fixture login ${E2E_FIXTURE_EMAIL} (fixture-only password withheld)`);

  const fixture = await startFixture();

  // Emulator reaches the host fixture via 10.0.2.2; nothing else is needed for host loopback.
  console.log(`[native] installing ${APK}`);
  const install = installApk(adb, device);
  if (!install.ok) {
    stopFixture();
    fail(`adb install failed:\n${install.out}`);
  }

  for (const flow of FLOWS) {
    if (!existsSync(flow.path)) {
      stopFixture();
      fail(`Maestro flow is missing at ${flow.path}.`);
    }
    console.log(`[native] running ${flow.name} in a fresh Maestro session`);
    const maestroRun = spawnSync(
      maestro,
      [
        "--device", device,
        "test", flow.path,
        "-e", `LEARNER_EMAIL=${E2E_FIXTURE_EMAIL}`,
        "-e", `LEARNER_PASSWORD=${E2E_FIXTURE_PASSWORD}`,
        "-e", `EXPEDITION_KEY=${fixture.expeditionKey}`,
        "-e", `GUARDIAN_CHALLENGE_ID=${fixture.legChallengeId}`,
        "-e", `SUMMIT_CHALLENGE_ID=${fixture.expeditionChallengeId}`,
        "--format", "JUNIT",
        "--output", join(EVIDENCE, `maestro-${flow.name}.xml`)
      ],
      {
        stdio: "inherit",
        cwd: EVIDENCE,
        timeout: 5 * 60_000,
        env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: "60000" }
      }
    );

    if (maestroRun.error) {
      stopFixture();
      fail(`Maestro ${flow.name} could not complete: ${maestroRun.error.message}. Evidence under ${EVIDENCE}.`);
    }
    if (maestroRun.status !== 0) {
      stopFixture();
      fail(`Maestro ${flow.name} failed (exit ${maestroRun.status}). Evidence under ${EVIDENCE}.`);
    }
  }

  stopFixture();
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
