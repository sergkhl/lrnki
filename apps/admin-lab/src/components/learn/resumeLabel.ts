import type { LearnerExpeditionEntry } from "@lrnki/application";
import { learnerTerm } from "./vocabulary";

type ExpeditionProgress = NonNullable<LearnerExpeditionEntry["learnerExpeditions"][number]["progress"]>;

export function resumeLabel(progress: ExpeditionProgress | null | undefined): string {
  return progress && (progress.itemsAttempted > 0 || progress.lessonsRead > 0) ? learnerTerm("resumeExpedition") : learnerTerm("beginExpedition");
}
