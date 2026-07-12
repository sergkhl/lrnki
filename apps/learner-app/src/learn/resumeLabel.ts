import type { JournalView } from "@/lib/queries";
import { learnerTerm } from "./vocabulary";

type ExpeditionProgress = JournalView["started"][number]["progress"];

export function resumeLabel(progress: ExpeditionProgress | null | undefined): string {
  return progress && (progress.itemsAttempted > 0 || progress.lessonsRead > 0) ? learnerTerm("resumeExpedition") : learnerTerm("beginExpedition");
}
