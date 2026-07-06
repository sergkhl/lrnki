import { createDatabaseClient, PostgresLearnerExpeditionStore } from "@lrnki/infrastructure-postgres";
import { generateLearnerTopicExpedition } from "./learnerGeneration";

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;
const SUPERVISOR_INTERVAL_MS = 15 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
const FAILURE_MESSAGE = "Scouting stopped after repeated launch attempts. Try again.";

type SupervisorState = {
  started: boolean;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

const SUPERVISOR_KEY = Symbol.for("lrnki.topicGenerationSupervisor");

function supervisorState(): SupervisorState {
  const globalScope = globalThis as typeof globalThis & { [SUPERVISOR_KEY]?: SupervisorState };
  globalScope[SUPERVISOR_KEY] ??= { started: false, running: false, timer: null };
  return globalScope[SUPERVISOR_KEY]!;
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

export async function runSupervisorOnce(): Promise<void> {
  const state = supervisorState();
  if (state.running || !process.env.DATABASE_URL) return;
  state.running = true;
  try {
    while (true) {
      const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS);
      await failExhausted(staleBefore);
      const claimed = await claimNext(staleBefore);
      if (!claimed) return;
      try {
        await generateLearnerTopicExpedition({
          learnerExpeditionId: claimed.learnerExpeditionId,
          topic: claimed.title,
          declaredDomain: claimed.declaredDomain
        });
      } catch (error) {
        console.error("Learner topic generation attempt failed.", error);
      }
    }
  } finally {
    state.running = false;
  }
}

async function claimNext(staleBefore: Date) {
  const sql = createDatabaseClient();
  try {
    return await new PostgresLearnerExpeditionStore(sql).claimNextGenerating({
      staleBefore,
      maxAttempts: MAX_GENERATION_ATTEMPTS
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function failExhausted(staleBefore: Date): Promise<void> {
  const sql = createDatabaseClient();
  try {
    await new PostgresLearnerExpeditionStore(sql).failExhaustedGenerating({
      staleBefore,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      failureMessage: FAILURE_MESSAGE
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
