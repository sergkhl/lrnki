import { serve } from "@hono/node-server";
import { createLearnerApp } from "./app";
import { authSql, sharedSql } from "./db";
import { startScaffoldGenerationSupervisor } from "./scaffoldGenerationSupervisor";
import { startTopicGenerationSupervisor } from "./topicGenerationSupervisor";

const port = Number(process.env.LEARNER_API_PORT ?? 8787);
const app = createLearnerApp(sharedSql(), authSql());

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`learner-api listening on :${info.port}`);
});

// The relocated topic-generation supervisor (R4): same claim/fencing/staleness semantics,
// now living in the one long-lived learner process.
startTopicGenerationSupervisor();

// The scaffold-detour generation supervisor (plan 2026-07-12-002 U3): drains requested Scaffold
// Detours through the same process-level scheduler.
startScaffoldGenerationSupervisor();
