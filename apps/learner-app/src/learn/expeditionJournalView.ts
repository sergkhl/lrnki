import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application/projection";

type LearnerExpeditionRowModel = LearnerExpeditionEntry["learnerExpeditions"][number];

export type ExpeditionJournalView = {
  // Owned expeditions the learner has already engaged with (a graded attempt or a lesson read).
  started: LearnerExpeditionRowModel[];
  // Owned expeditions not yet started — includes still-generating/failed scouts and ready-but-untouched.
  yours: LearnerExpeditionRowModel[];
  // Shared enrichments the learner has NOT adopted; adopted ones surface under started/yours instead.
  shared: ExpeditionCandidate[];
};

function hasStudyActivity(expedition: LearnerExpeditionRowModel): boolean {
  const progress = expedition.progress;
  return Boolean(progress && (progress.itemsAttempted > 0 || progress.lessonsRead > 0));
}

// Partitions the journal into its three priority tiers WITHOUT re-sorting: learnerExpeditions arrive
// active-first from SQL and candidates arrive readiness-ranked from the use-case, so preserving input
// order keeps those guarantees. Only a ready expedition can be "started" (generating/failed carry no
// progress).
export function partitionExpeditionJournal(entry: LearnerExpeditionEntry): ExpeditionJournalView {
  const started: LearnerExpeditionRowModel[] = [];
  const yours: LearnerExpeditionRowModel[] = [];
  for (const expedition of entry.learnerExpeditions) {
    if (expedition.status === "ready" && hasStudyActivity(expedition)) {
      started.push(expedition);
    } else {
      yours.push(expedition);
    }
  }
  const shared = entry.candidates.filter((candidate) => !candidate.existingLearnerExpeditionId);
  return { started, yours, shared };
}
