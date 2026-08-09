// Serves the production Expo web export for the Playwright gate (plan 2026-07-14-001 U5).
//
// The export is baked ONCE against a sentinel API origin (`http://127.0.0.1:8788`) that is
// never actually served — every call to it is intercepted with deterministic fixtures in the
// spec (KTD8). Baking a localhost sentinel instead of the production origin means any request
// the test forgot to mock fails fast (connection refused) rather than silently reaching
// production, which is the safety property the gate depends on.
//
// This is the webServer command for playwright.config.ts. The `e2e` script normally exports
// `dist-e2e/` first (via `export:web:e2e`), so this server just serves it with an SPA fallback so
// hard loads of client routes — including dynamic `/expedition/:id` and `/guardian/:id` — boot the
// same bundle and let expo-router render from the URL. As a convenience for a bare local
// `playwright test`, it also (re)builds `dist-e2e/` when it is missing (or E2E_FORCE_EXPORT is set).
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Parameterized so BOTH web suites share this one static Expo server (plan 2026-07-15-001 U1,
// R14): the intercepted `pnpm e2e` gate keeps every default below, while the opt-in real-backend
// runner overrides E2E_DIST_DIR/E2E_WEB_PORT/E2E_API_ORIGIN to serve its own export against the
// real api origin. This replaces the deleted `e2e-realuse/serve.mjs` copy.
const here = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(here, "..");
const outDir = process.env.E2E_DIST_DIR ? resolve(process.env.E2E_DIST_DIR) : join(appRoot, "dist-e2e");
const indexHtml = join(outDir, "index.html");
const PORT = Number(process.env.E2E_WEB_PORT ?? 8099);
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:8788";

if (process.env.E2E_FORCE_EXPORT || !existsSync(indexHtml)) {
  console.log(`[e2e] exporting Expo web to ${outDir} (API origin ${API_ORIGIN})…`);
  // `--clear` is REQUIRED, not optional: Metro caches the babel transform that inlines
  // `process.env.EXPO_PUBLIC_LEARNER_API_URL` into the bundle, so a stale cache from a prior
  // session (e.g. a dev export against :8790) would silently bake the wrong API origin and the
  // interception would never match. Clearing the cache makes the sentinel origin deterministic.
  // The real-backend runner pre-exports its own dir, so this convenience path is normally only
  // hit by the intercepted suite with the default dist-e2e.
  execFileSync("pnpm", ["exec", "expo", "export", "--clear", "--platform", "web", "--output-dir", outDir], {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_LEARNER_API_URL: API_ORIGIN }
  });
}

// ADR-0035 requires Expo's client-rendered `single` output. A static/prerendered index is unsafe
// behind an SPA fallback because React would hydrate route-specific client content over the root
// route's server tree. Refuse that artifact before Playwright can accidentally normalize the race.
if (readFileSync(indexHtml, "utf8").includes("__EXPO_ROUTER_HYDRATE__")) {
  throw new Error(
    `[e2e] ${indexHtml} is a prerendered Expo artifact; expected web.output \"single\" without the hydration marker`
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

// Resolve a request path to a real file inside the export, or null for the SPA fallback.
function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(outDir, clean);
  if (!candidate.startsWith(outDir)) return null; // path traversal guard
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? "/") ?? indexHtml;
  const type = MIME[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e] serving ${outDir} at http://127.0.0.1:${PORT}`);
});
