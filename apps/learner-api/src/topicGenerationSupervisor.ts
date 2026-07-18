import { operationStaleBefore, type TopicExpeditionGeneration } from "@lrnki/application";
import { PostgresLearnerExpeditionStore, PostgresRunProgressReporter } from "@lrnki/infrastructure-postgres";
import { sharedSql } from "./db";
import { createGenerationSupervisor } from "./generationSupervisor";
import { createLearnerTopicExpeditionGeneration } from "./learnerGeneration";

// Process-lived generation callable (plan 2026-07-13-001 KTD5): constructed lazily on the
// first claimed row — not at module import, so DB-free route imports never touch
// `sharedSql()` or neural client construction — then reused across the supervisor's
// concurrent claims. Per-expedition state lives inside each call.
let topicGeneration: TopicExpeditionGeneration | undefined;

const SUPERVISOR_INTERVAL_MS = 15 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
// Bounded parallelism per process (see generationSupervisor for the multi-process story).
const MAX_CONCURRENT_GENERATIONS = 2;
const FAILURE_MESSAGE = "Scouting stopped after repeated launch attempts. Try again.";

// The topic-expedition queue over the shared scheduler (KTD7): reap stale/exhausted rows, claim
// the next generating expedition, run the full topic generation. Claim/fencing/staleness live in
// the expedition store; only the hooks are topic-specific.
const supervisor = createGenerationSupervisor({
  intervalMs: SUPERVISOR_INTERVAL_MS,
  maxConcurrent: MAX_CONCURRENT_GENERATIONS,
  label: "Learner topic",
  reap: async () => {
    const staleBefore = operationStaleBefore();
    await new PostgresRunProgressReporter(sharedSql()).failStaleOperations({ staleBefore });
    await new PostgresLearnerExpeditionStore(sharedSql()).failExhaustedGenerating({
      staleBefore,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      failureMessage: FAILURE_MESSAGE
    });
  },
  claimNext: () =>
    new PostgresLearnerExpeditionStore(sharedSql()).claimNextGenerating({
      staleBefore: operationStaleBefore(),
      maxAttempts: MAX_GENERATION_ATTEMPTS
    }),
  run: (claimed) => {
    topicGeneration ??= createLearnerTopicExpeditionGeneration(sharedSql());
    return topicGeneration({
      learnerExpeditionId: claimed.learnerExpeditionId,
      enrichmentId: claimed.currentOperationId,
      topic: claimed.title,
      declaredDomain: claimed.declaredDomain
    });
  }
});

export function startTopicGenerationSupervisor(): void {
  supervisor.start();
}

export function wakeTopicGenerationSupervisor(): void {
  supervisor.wake();
}

export function runSupervisorOnce(): Promise<void> {
  return supervisor.runOnce();
}
