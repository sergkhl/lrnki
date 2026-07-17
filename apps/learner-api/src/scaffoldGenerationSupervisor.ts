import { operationStaleBefore, type ScaffoldGeneration } from "@lrnki/application";
import { PostgresLearnerScaffoldStore, PostgresRunProgressReporter } from "@lrnki/infrastructure-postgres";
import { sharedSql } from "./db";
import { createGenerationSupervisor } from "./generationSupervisor";
import { createLearnerScaffoldGeneration } from "./learnerScaffoldGeneration";

const SUPERVISOR_INTERVAL_MS = 15 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
// Scaffold generation is short (one small outline + up to three compact contents) relative to a
// full topic expedition, so a slightly higher per-process cap keeps requested detours responsive.
const MAX_CONCURRENT_GENERATIONS = 3;

// The scaffold-detour queue over the shared scheduler (KTD7/KTD8): reap stale operations +
// exhausted detours, claim the next generating detour (minting its fresh operation/fencing UUID
// inside the store), and run the process-lived deep generation callable. The detour ID survives
// retries; the operation id is the fence. Constructed lazily at process scope (matching Topic
// Expedition generation) so DB-free imports remain hermetic.
let generation: ScaffoldGeneration | undefined;

const supervisor = createGenerationSupervisor({
  intervalMs: SUPERVISOR_INTERVAL_MS,
  maxConcurrent: MAX_CONCURRENT_GENERATIONS,
  label: "Learner scaffold",
  reap: async () => {
    const staleBefore = operationStaleBefore();
    await new PostgresRunProgressReporter(sharedSql()).failStaleOperations({ staleBefore });
    await new PostgresLearnerScaffoldStore(sharedSql()).failExhaustedGenerating({
      staleBefore,
      maxAttempts: MAX_GENERATION_ATTEMPTS
    });
  },
  claimNext: () =>
    new PostgresLearnerScaffoldStore(sharedSql()).claimNextGenerating({
      staleBefore: operationStaleBefore(),
      maxAttempts: MAX_GENERATION_ATTEMPTS
    }),
  run: (claimed) => {
    // A claimed row contributes only its identity — claimNextGenerating installed the fresh
    // operation id, which IS the fencing token the deep callable re-verifies (KTD7/KTD8).
    if (!claimed.latestOperationId) return Promise.resolve();
    generation ??= createLearnerScaffoldGeneration(sharedSql());
    return generation({ detourId: claimed.detourId, operationId: claimed.latestOperationId });
  }
});

export function startScaffoldGenerationSupervisor(): void {
  supervisor.start();
}

export function wakeScaffoldGenerationSupervisor(): void {
  supervisor.wake();
}

export function runScaffoldSupervisorOnce(): Promise<void> {
  return supervisor.runOnce();
}
