import { isGenerationClaimLostError } from "@lrnki/application";
import { databaseConnectivityFailureCode } from "@lrnki/infrastructure-postgres";

// Shared process-level claim/top-up scheduler (plan 2026-07-12-002 U3, KTD7). Both the topic
// expedition and the scaffold detour queues are drained by the SAME loop: a `reap` step fails
// stale/exhausted rows, then a bounded top-up claims rows until the in-flight cap or an empty
// queue. Each claimed run is tracked in a set and re-enters the loop on completion, so a freed
// slot refills immediately instead of waiting for a serial pass (the starvation the topic
// supervisor already fixed). Multiple PROCESSES stay safe through the DB claim + fencing token;
// each process adds `maxConcurrent` parallelism. This disposable DB-claim seam is what a real
// workflow engine (Restate/Temporal) replaces later.
//
// Only the SCHEDULER lives here (KTD7); every queue provides its own reap/claim/run hooks so
// claim, retry classification, and terminal writes stay in their owning modules.

export type GenerationSupervisorHooks<T> = {
  intervalMs: number;
  maxConcurrent: number;
  // Human label for error logs (e.g. "Learner topic", "Learner scaffold").
  label: string;
  // Fail stale operations + exhausted rows before claiming. Runs once per top-up pass.
  reap(): Promise<void>;
  // Claim the next queued unit for one attempt, or return undefined when the queue is empty.
  claimNext(): Promise<T | undefined>;
  // Run one claimed unit to completion (owns its own retry classification + terminal write).
  run(unit: T): Promise<void>;
};

export type GenerationSupervisor = {
  start(): void;
  wake(): void;
  runOnce(): Promise<void>;
};

export function createGenerationSupervisor<T>(hooks: GenerationSupervisorHooks<T>): GenerationSupervisor {
  // Plain module-closure state — a single long-lived Node process, so no re-registration guard.
  const state = {
    started: false,
    claiming: false,
    // Edge-triggered outage reporting: an outage is a STATE, so the operator gets its two edges
    // rather than the same stack every 15s for as long as Postgres is away. Per supervisor, so the
    // two labels report independently.
    databaseUnreachable: false,
    inFlight: new Set<Promise<void>>(),
    timer: null as ReturnType<typeof setInterval> | null
  };

  function start(): void {
    if (!process.env.DATABASE_URL) return;
    if (state.started) return;
    state.started = true;
    state.timer = setInterval(() => {
      void runOnce();
    }, hooks.intervalMs);
    void runOnce();
  }

  function wake(): void {
    start();
    void runOnce();
  }

  async function runOnce(): Promise<void> {
    if (state.claiming || !process.env.DATABASE_URL) return;
    state.claiming = true;
    try {
      await hooks.reap();
      // Connectivity is proven HERE, and this is the one point every pass reaches — the top-up loop
      // below can return early on an empty queue.
      if (state.databaseUnreachable) {
        state.databaseUnreachable = false;
        console.log(`${hooks.label} generation resumed: database reachable.`);
      }
      while (state.inFlight.size < hooks.maxConcurrent) {
        const unit = await hooks.claimNext();
        if (!unit) return;
        const run: Promise<void> = hooks
          .run(unit)
          .catch((error) => {
            reportGenerationAttemptError(hooks.label, error);
          })
          .finally(() => {
            state.inFlight.delete(run);
            void runOnce();
          });
        state.inFlight.add(run);
      }
    } catch (error) {
      // A reap/claim failure must never kill the process. These hooks touch the DB before any
      // unit is claimed, so a down/restarting Postgres surfaces HERE, and `void runOnce()` at the
      // interval would turn it into an unhandled rejection (= uncaught exception) that takes the
      // whole learner-api down with it. postgres.js reconnects on its own, so the next tick is
      // the retry; nothing is lost because an unclaimed unit stays queued.
      const unreachable = databaseConnectivityFailureCode(error);
      if (unreachable === undefined) {
        reportGenerationAttemptError(hooks.label, error);
      } else if (!state.databaseUnreachable) {
        // The falling edge only. Anything the classifier does not recognize keeps its full report
        // above, so a real defect is never quietly reduced to an outage line.
        state.databaseUnreachable = true;
        console.warn(
          `${hooks.label} generation paused: database unreachable (${unreachable}). Retrying every ${Math.round(hooks.intervalMs / 1000)}s.`
        );
      }
    } finally {
      state.claiming = false;
    }
  }

  return { start, wake, runOnce };
}

export function reportGenerationAttemptError(label: string, error: unknown): void {
  if (isGenerationClaimLostError(error)) {
    console.warn(`${label} generation claim lost; a newer attempt is authoritative.`);
    return;
  }
  console.error(`${label} generation attempt failed.`, error);
}
