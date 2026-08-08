import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { cleanupReservedLearners, reservedLearnerEmails } from "@lrnki/infrastructure-postgres/test-support";
import { selectCandidate } from "./preflight";

// The ONE opt-in real-backend web gate command (plan 2026-07-15-001 U2). It loads the repo `.env`
// into its OWN process (the learner-app script uses `tsx --env-file`), owns the generated run id +
// ephemeral password, prints only the safe run id, starts a supervisor-free learner-api over real
// Postgres + a shared static server for the production Expo export, runs capability preflight and
// Playwright, and — on success OR failure — deletes exactly this run's three reserved learners and
// stops its children. No DATABASE_URL or provider secret ever reaches the browser/export/static
// processes; the API never receives a LiteLLM/Expo secret. See e2e-realuse/README.md.

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(here, "../../..");
const learnerApiRoot = resolve(repoRoot, "apps/learner-api");
// Invoke tsx directly (the hoisted workspace bin) rather than through `pnpm run`, so teardown
// signals the real node process — no pnpm wrapper to orphan or to print a spurious SIGTERM error.
const tsxBin = resolve(repoRoot, "node_modules/.bin/tsx");
const distDir = resolve(appRoot, "dist-realuse");

const API_PORT = Number(process.env.REALUSE_API_PORT ?? 8790);
const WEB_PORT = Number(process.env.REALUSE_WEB_PORT ?? 8091);
const API_BASE = `http://127.0.0.1:${API_PORT}`;
// Web and API must share a HOST, differing only in port (ADR-0041). The session is a cookie now,
// and cookies are scoped by host, not by origin: same host + different port is same-SITE, so a
// `SameSite=Lax` session cookie rides the XHR, while the differing port keeps it cross-ORIGIN so
// the credentialed CORS path (exact-origin echo, never "*") is still the one under test. That
// mirrors production, where `lrnki.` and `api.lrnki.globesoul.com` share a registrable domain.
// `localhost` here instead of `127.0.0.1` would silently make the two cross-site and the whole
// gate would fail signed out. Both servers bind 127.0.0.1 explicitly, so this also avoids the
// `localhost` → ::1 resolution split.
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

// Keys never handed to any child. The base child env is the toolchain env MINUS these, so expo /
// pnpm / tsx keep the vars they need while no secret leaks; each child then re-adds only what it
// requires (the API alone re-adds DATABASE_URL). Denylist over allowlist keeps the toolchain
// working while still proving secret ABSENCE (R4/AE5).
const SECRET_KEY_RE = /(SECRET|TOKEN|API_KEY|APIKEY|PASSWORD|DATABASE_URL|LITELLM|OPENROUTER|DEEPSEEK|ANTHROPIC|OPENAI|EXPO_TOKEN|_KEY$)/i;
function secretFreeEnv(): NodeJS.ProcessEnv {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !SECRET_KEY_RE.test(k)) out[k] = v;
  }
  return out as NodeJS.ProcessEnv;
}

const children: ChildProcess[] = [];
function track(child: ChildProcess): ChildProcess {
  children.push(child);
  return child;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolvePort(false); });
    socket.once("timeout", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(true));
  });
}

async function waitForHttp(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[realuse] ${label} did not become ready at ${url} within ${timeoutMs}ms.`);
}

// Long-lived children (API, static server, Playwright) are spawned in their OWN process group
// (`detached`) so teardown can signal the whole group — otherwise killing a `pnpm`/`pnpm exec`
// wrapper would orphan the real tsx/node/playwright grandchild that holds the port.
function spawnGroup(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  return track(spawn(cmd, args, { cwd, env, stdio: "inherit", detached: true }));
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

// Playwright's own non-zero exit (a failed assertion) must NOT skip cleanup, so it resolves the
// exit code instead of rejecting.
function runPlaywright(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawnGroup("pnpm", ["exec", "playwright", "test", "--config=e2e-realuse/realuse.config.ts"], appRoot, env);
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

// Signal a child's whole process group, falling back to the pid if the group is gone.
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* already gone */ } }
}

async function stopChildren(): Promise<void> {
  await Promise.all(children.map((child) => new Promise<void>((resolveChild) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolveChild();
    const killTimer = setTimeout(() => signalGroup(child, "SIGKILL"), 5000);
    child.once("exit", () => { clearTimeout(killTimer); resolveChild(); });
    signalGroup(child, "SIGTERM");
  })));
}

// Delete exactly this run's three reserved learners. Returns true on success; on failure prints the
// exact retry command (R9) so an operator can reclaim the rows without guessing the run id.
async function cleanupRun(runId: string): Promise<boolean> {
  const emails = reservedLearnerEmails(runId);
  const sql = createDatabaseClient(process.env.DATABASE_URL);
  try {
    const deleted = await cleanupReservedLearners(sql, Object.values(emails));
    console.log(`[realuse] cleanup removed ${deleted.length} learner row(s) for run ${runId}.`);
    return true;
  } catch (err) {
    console.error(`[realuse] cleanup FAILED for run ${runId}:`, err instanceof Error ? err.message : err);
    console.error(`[realuse] retry teardown with:\n  pnpm --filter @lrnki/learner-app run e2e:realuse -- --cleanup-run=${runId}`);
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function orchestrate(runId: string, password: string, authSecret: string): Promise<number> {
  const emails = reservedLearnerEmails(runId);
  console.log(`[realuse] run id: ${runId} (API ${API_BASE}, web ${WEB_ORIGIN})`);

  for (const [port, label] of [[API_PORT, "API"], [WEB_PORT, "web"]] as const) {
    if (!(await isPortFree(port))) {
      throw new Error(`[realuse] port ${port} (${label}) is occupied. Free it or set REALUSE_${label === "API" ? "API" : "WEB"}_PORT; the runner refuses to reuse an unknown process.`);
    }
  }

  const base = secretFreeEnv();

  // 1. Export the production web bundle baked against the REAL api origin (127.0.0.1:<apiPort>).
  //    `--clear` is required: Metro caches the inlined EXPO_PUBLIC_LEARNER_API_URL.
  console.log(`[realuse] exporting web bundle → ${distDir}`);
  await run("pnpm", ["exec", "expo", "export", "--clear", "--platform", "web", "--output-dir", "dist-realuse"], appRoot, {
    ...base,
    EXPO_PUBLIC_LEARNER_API_URL: API_BASE
  });

  // 2. Supervisor-free API over real Postgres — the only child that receives DATABASE_URL, and
  //    the only one that receives this run's signing secret. `BETTER_AUTH_URL` is the loopback
  //    API base, which is also what makes Better Auth drop the cookie's `Secure` flag (it derives
  //    that from the base URL's scheme), so an http rig gets a usable cookie without any override.
  spawnGroup(tsxBin, ["src/realuseServer.ts"], learnerApiRoot, {
    ...base,
    DATABASE_URL: process.env.DATABASE_URL,
    LEARNER_API_PORT: String(API_PORT),
    LEARNER_WEB_ORIGIN: WEB_ORIGIN,
    BETTER_AUTH_URL: API_BASE,
    BETTER_AUTH_SECRET: authSecret
  });
  await waitForHttp(`${API_BASE}/health`, "learner-api");

  // 3. Shared static server for the export (no DATABASE_URL/secret).
  spawnGroup("node", ["e2e/static-server.mjs"], appRoot, {
    ...base, E2E_DIST_DIR: distDir, E2E_WEB_PORT: String(WEB_PORT), E2E_API_ORIGIN: API_BASE
  });
  await waitForHttp(`${WEB_ORIGIN}/`, "static server");

  // 4. Capability preflight against public routes — selects a ready enrichment or fails closed.
  const candidate = await selectCandidate({ apiBase: API_BASE, probeEmail: emails.probe, password });
  console.log(`[realuse] selected enrichment ${candidate.enrichmentId} (${candidate.totalStopCount} stops).`);

  // 5. Playwright — only public origins + this run's ephemeral addresses/password/selected
  //    metadata. `REALUSE_PASSWORD` is re-added explicitly because `secretFreeEnv` strips every
  //    PASSWORD-shaped key: the denylist exists to keep REPO secrets out of children, and this is
  //    a run-scoped credential deleted at teardown — the same explicit re-add DATABASE_URL gets
  //    for the one child that needs it.
  return runPlaywright({
    ...base,
    REALUSE_RUN_ID: runId,
    REALUSE_PASSWORD: password,
    REALUSE_API_BASE: API_BASE,
    REALUSE_EMAIL_PHONE: emails.phone,
    REALUSE_EMAIL_DESKTOP: emails.desktop,
    REALUSE_WEB_PORT: String(WEB_PORT),
    REALUSE_ENRICHMENT_ID: candidate.enrichmentId,
    REALUSE_ENRICHMENT_TITLE: candidate.title,
    REALUSE_ENRICHMENT_DOMAIN: candidate.declaredDomain,
    REALUSE_GRADED_KIND: candidate.gradedKind
  });
}

async function main(): Promise<number> {
  const cleanupArg = process.argv.find((a) => a.startsWith("--cleanup-run="));
  if (cleanupArg) {
    // Validated teardown-only mode: derive the three exact reserved names from the run id and do
    // nothing else. reservedLearnerRefs/cleanupReservedLearners reject a malformed or wildcard id.
    const runId = cleanupArg.slice("--cleanup-run=".length);
    return (await cleanupRun(runId)) ? 0 : 1;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("[realuse] DATABASE_URL is required. Run via `pnpm e2e:web:realuse` so the repo .env is loaded.");
  }
  // Domain-neutral, format-locked ids held only in process memory. The run id is safe to print; the
  // password is not. Both are derived here so a mid-flight failure still reaches the exact-address
  // cleanup, which needs the run id and nothing else.
  const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  // Comfortably over Better Auth's 8-character minimum, and random per run so no reserved account
  // is reachable after teardown even if a row somehow survived.
  const password = randomBytes(18).toString("base64url");
  // A signing secret of this run's OWN, never the deployment's. The rig's sessions become
  // unverifiable the moment it exits, and the production key is not handed to a test process —
  // the secret's value is not behavior, so the code path under test is identical either way.
  // It also keeps this gate runnable before the deployment secret exists (BLOCKERS).
  const authSecret = randomBytes(32).toString("base64");

  let exitCode = 1;
  try {
    exitCode = await orchestrate(runId, password, authSecret);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    const ok = await cleanupRun(runId);
    if (!ok && exitCode === 0) exitCode = 1;
    await stopChildren();
  }
  return exitCode;
}

// Best-effort teardown on Ctrl-C: children are killed; a SIGINT during orchestration also triggers
// the finally path above because the awaited child rejects. The reserved-name cleanup still runs
// through the normal finally when possible.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void stopChildren().then(() => process.exit(130)); });
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1); });
