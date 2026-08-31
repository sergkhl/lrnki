import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadQualifiedCatalogOrThrow } from "@lrnki/learner-runtime/content-node";

import { createLearnerApp } from "./app";
import { authSql, sharedSql } from "./db";

const contentRoot = fileURLToPath(new URL("../../../content/", import.meta.url));
const catalog = await loadQualifiedCatalogOrThrow(contentRoot);
const port = Number(process.env.LEARNER_API_PORT ?? 8787);
const app = createLearnerApp(sharedSql(), authSql(), { catalog });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`learner-api listening on :${info.port}`);
});
