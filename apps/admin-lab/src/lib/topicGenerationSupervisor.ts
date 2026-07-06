import { createDatabaseClient, PostgresLearnerExpeditionStore } from "@lrnki/infrastructure-postgres";
import { generateLearnerTopicExpedition } from "./learnerGeneration";

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;
const SUPERVISOR_INTERVAL_MS = 15 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
// Bounded parallelism per process. Multiple PROCESSES stay safe (DB claim + fencing
// token), but each adds this much parallelism — this disposable DB-claim seam is what
// a real workflow engine (Restate/Temporal) replaces later.
const MAX_CONCURRENT_GENERATIONS = 2;
const FAILURE_MESSAGE = "Scouting stopped after repeated launch attempts. Try again.";

type SupervisorState = {
  started: boolean;
  claiming: boolean;
  inFlight: Set<Promise<void>>;
  timer: ReturnType<typeof setInterval> | null;
  sql: DatabaseClient | null;
};

const SUPERVISOR_KEY = Symbol.for("lrnki.topicGenerationSupervisor");

function supervisorState(): SupervisorState {
  const globalScope = globalThis as typeof globalThis & { [SUPERVISOR_KEY]?: SupervisorState };
  globalScope[SUPERVISOR_KEY] ??= { started: false, claiming: false, inFlight: new Set(), timer: null, sql: null };
  return globalScope[SUPERVISOR_KEY]!;
}

// One shared postgres.js pool for tick bookkeeping AND generation runs — the previous
// per-tick/per-run createDatabaseClient()/end() churned connections every 15s.
function supervisorSql(): DatabaseClient {
  const state = supervisorState();
  state.sql ??= createDatabaseClient();
  return state.sql;
}

export function startTopicGenerationSupervisor(): void {
  if (!process.env.DATABASE_URL) return;
  const state = supervisorState();
  if (state.started) return;
  state.started = true;
  state.timer = setInterval(() => {
    void runSupervisorOnce();
  }, SUPERVISOR_INTERVAL_MS);
  void runSupervisorOnce();
}

export function wakeTopicGenerationSupervisor(): void {
  startTopicGenerationSupervisor();
  void runSupervisorOnce();
}

// Top-up scheduler: claim rows until the in-flight cap or an empty queue. Runs are
// tracked in a set and each completion re-enters here, so a freed slot is refilled
// immediately instead of waiting for the serial loop that starved queued topics
// behind one long healthy run. `claiming` guards only the claim step.
export async function runSupervisorOnce(): Promise<void> {
  const state = supervisorState();
  if (state.claiming || !process.env.DATABASE_URL) return;
  state.claiming = true;
  try {
    const store = new PostgresLearnerExpeditionStore(supervisorSql());
    const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS);
    await store.failExhaustedGenerating({
      staleBefore,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      failureMessage: FAILURE_MESSAGE
    });
    while (state.inFlight.size < MAX_CONCURRENT_GENERATIONS) {
      const claimed = await store.claimNextGenerating({
        staleBefore,
        maxAttempts: MAX_GENERATION_ATTEMPTS
      });
      if (!claimed) return;
      const run: Promise<void> = generateLearnerTopicExpedition({
        learnerExpeditionId: claimed.learnerExpeditionId,
        topic: claimed.title,
        declaredDomain: claimed.declaredDomain
      }, supervisorSql())
        .catch((error) => {
          console.error("Learner topic generation attempt failed.", error);
        })
        .finally(() => {
          state.inFlight.delete(run);
          void runSupervisorOnce();
        });
      state.inFlight.add(run);
    }
  } finally {
    state.claiming = false;
  }
}
