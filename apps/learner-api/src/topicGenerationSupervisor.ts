import { operationStaleBefore } from "@lrnki/application";
import { PostgresLearnerExpeditionStore, PostgresRunProgressReporter } from "@lrnki/infrastructure-postgres";
import { sharedSql } from "./db";
import { generateLearnerTopicExpedition } from "./learnerGeneration";

const SUPERVISOR_INTERVAL_MS = 15 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
// Bounded parallelism per process. Multiple PROCESSES stay safe (DB claim + fencing
// token), but each adds this much parallelism — this disposable DB-claim seam is what
// a real workflow engine (Restate/Temporal) replaces later.
const MAX_CONCURRENT_GENERATIONS = 2;
const FAILURE_MESSAGE = "Scouting stopped after repeated launch attempts. Try again.";

// Plain module state — this is a single long-lived Node process (KTD1), so the
// globalThis re-registration guard the Next.js runtime needed is gone.
const state = {
  started: false,
  claiming: false,
  inFlight: new Set<Promise<void>>(),
  timer: null as ReturnType<typeof setInterval> | null
};

export function startTopicGenerationSupervisor(): void {
  if (!process.env.DATABASE_URL) return;
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
  if (state.claiming || !process.env.DATABASE_URL) return;
  state.claiming = true;
  try {
    const store = new PostgresLearnerExpeditionStore(sharedSql());
    const staleBefore = operationStaleBefore();
    await new PostgresRunProgressReporter(sharedSql()).failStaleOperations({ staleBefore });
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
      }, sharedSql())
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
