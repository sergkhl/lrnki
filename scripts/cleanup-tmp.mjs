import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const daysFlag = process.argv.indexOf("--days");
const days = daysFlag >= 0 ? Number(process.argv[daysFlag + 1]) : 3;
if (!Number.isFinite(days) || days < 0) throw new Error("--days must be a non-negative number");
const root = path.resolve("tmp");
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
  const target = path.join(root, entry.name);
  const info = await stat(target);
  if (info.mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
}
