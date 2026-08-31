import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { loadAndQualifyCatalog } from "./contentLoader";
import { qualifiedExpeditionRevision } from "./contentQualifier";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const contentRoot = resolve(repositoryRoot, "content");
const result = await loadAndQualifyCatalog(contentRoot);

if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(`${diagnostic.code}\t${diagnostic.path}\t${diagnostic.message}`);
  }
  console.error(`Authored catalog refused with ${result.diagnostics.length} diagnostic(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Qualified ${result.catalog.orderedKeys.length} authored Expedition(s); catalog revision ${result.catalog.catalogRevision}.`
  );
  for (const key of result.catalog.orderedKeys) {
    console.log(`${key}\t${qualifiedExpeditionRevision(result.catalog, key) ?? "missing"}`);
  }
}
