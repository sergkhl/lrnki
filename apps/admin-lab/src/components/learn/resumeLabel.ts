import type { LearnerExpeditionEntry } from "@lrnki/application";

type ExpeditionProgress = NonNullable<LearnerExpeditionEntry["learnerExpeditions"][number]["progress"]>;

export function resumeLabel(progress: ExpeditionProgress | null | undefined): "Begin" | "Resume" {
  return progress && progress.itemsPassed > 0 ? "Resume" : "Begin";
}
