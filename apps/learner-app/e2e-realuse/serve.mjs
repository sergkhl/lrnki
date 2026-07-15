// Serves the real-use Expo web export (default: apps/learner-app/dist-u6, baked against the REAL
// api) with SPA fallback so hard loads of /expedition/:id and /guardian/:id boot the same bundle.
// The export is produced separately (see README.md); override the directory with U6_DIST_DIR.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.U6_DIST_DIR
  ? resolve(process.env.U6_DIST_DIR)
  : resolve(here, "..", "dist-u6"); // apps/learner-app/dist-u6
const indexHtml = join(outDir, "index.html");
const PORT = Number(process.env.U6_WEB_PORT ?? 8091);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf"
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(outDir, clean);
  if (!candidate.startsWith(outDir)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (extname(candidate) === "" && existsSync(`${candidate}.html`)) return `${candidate}.html`;
  return null;
}

if (!existsSync(indexHtml)) {
  console.error(`[realuse] export not found at ${outDir}. Build it first (see e2e-realuse/README.md).`);
  process.exit(1);
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? "/") ?? indexHtml;
  const type = MIME[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`[realuse] serving ${outDir} at http://localhost:${PORT}`));
