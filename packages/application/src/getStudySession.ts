import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  EnrichmentInspectionReadPort,
  LessonReadStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { composeStudySession, type StudySession } from "./studySessionProjection";

// The reading use-case for the Study Session (ADR-0027, KTD1/KTD3). It loads through injected
// ports and composes the adaptation with the pure `composeStudySession`, so the Admin Lab and
// the forthcoming Learner App share ONE study orchestration — each app injects its own
// adapters. It CONSUMES the finished
// `DerivedGraphDetail` inspection read model as graph input (a projection may read a read model
// and add compute; ADR-0027 forbids only serving a projection THROUGH a read port), which proves
// existence in one read — no redundant `getLayer` (R4). No write port is imported, so it
// structurally cannot mutate a published graph or the Derived Graph Layer (R10).
export async function getStudySession(input: {
  enrichmentId: string;
  learnerStateRef: string;
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  lessonReadStore?: LessonReadStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
}): Promise<StudySession | undefined> {
  const detail = await input.enrichmentRead.getDerivedGraphDetail(input.enrichmentId);
  if (!detail) return undefined;

  const [studyItems, lessons, lessonAbsent, lessonReads, rows, verdicts] = await Promise.all([
    input.studyItemStore.listStudyItemsForEnrichment(input.enrichmentId),
    input.conceptLessonStore.listLessonsForEnrichment(input.enrichmentId),
    input.conceptLessonStore.listAbsentForEnrichment(input.enrichmentId),
    input.lessonReadStore ? input.lessonReadStore.listForLearner(input.learnerStateRef) : Promise.resolve([]),
    input.responseLog.listForLearner(input.learnerStateRef),
    input.verdictStore.listForLearner(input.learnerStateRef)
  ]);

  return composeStudySession({
    enrichmentId: input.enrichmentId,
    learnerStateRef: input.learnerStateRef,
    detail,
    studyItems,
    lessons,
    lessonAbsent,
    lessonReads: lessonReads.map((read) => read.derivedNodeId),
    rows,
    verdicts
  });
}
