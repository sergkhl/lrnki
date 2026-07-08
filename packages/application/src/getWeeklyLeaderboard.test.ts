import assert from "node:assert/strict";
import test from "node:test";
import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  LearnerAwardsStorePort,
  LearnerExpeditionStorePort,
  LearnerStorePort,
  LessonReadStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { getWeeklyLeaderboard } from "./getWeeklyLeaderboard";

// A count of how many times each per-enrichment read fired, so the dedup (AE5) is observable.
type Counts = { detail: Map<string, number>; studyItems: Map<string, number>; lessons: Map<string, number>; absent: Map<string, number> };

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function fakeDeps(input: {
  learnerRefs: string[];
  evidenceRefs: string[];
  readyEnrichmentIdsByLearner: Record<string, string[]>;
}): { deps: Omit<Parameters<typeof getWeeklyLeaderboard>[0], "now">; counts: Counts } {
  const counts: Counts = { detail: new Map(), studyItems: new Map(), lessons: new Map(), absent: new Map() };
  const emptyDetail = { nodes: [], edges: [] } as unknown as DerivedGraphDetail;

  const learnerStore: LearnerStorePort = {
    async create() { return { created: false }; },
    async get() { return undefined; },
    async list() { return input.learnerRefs.map((learnerRef) => ({ learnerRef, displayName: learnerRef, pinHash: "h", createdAt: "2026-06-01T00:00:00.000Z" })); },
    async listRefsWithStudyEvidence() { return input.evidenceRefs; }
  };
  const expeditionStore = {
    async listForLearner(learnerStateRef: string) {
      return (input.readyEnrichmentIdsByLearner[learnerStateRef] ?? []).map((enrichmentId) => ({ status: "ready", enrichmentId } as never));
    }
  } as unknown as LearnerExpeditionStorePort;
  const awardsStore: LearnerAwardsStorePort = {
    async record() { return { recorded: true }; },
    async listForLearner() { return []; },
    async listForLearners() { return []; }
  };
  const enrichmentRead = {
    async getDerivedGraphDetail(enrichmentId: string) { bump(counts.detail, enrichmentId); return emptyDetail; }
  } as unknown as EnrichmentInspectionReadPort;
  const studyItemStore = {
    async listStudyItemsForEnrichment(enrichmentId: string) { bump(counts.studyItems, enrichmentId); return []; }
  } as unknown as StudyItemBankStorePort;
  const conceptLessonStore = {
    async listLessonsForEnrichment(enrichmentId: string) { bump(counts.lessons, enrichmentId); return []; },
    async listAbsentForEnrichment(enrichmentId: string) { bump(counts.absent, enrichmentId); return []; }
  } as unknown as ConceptLessonStorePort;
  const responseLog = { async listForLearner() { return []; } } as unknown as ResponseLogStorePort;
  const verdictStore = { async listForLearner() { return []; } } as unknown as CalibrationVerdictStorePort;
  const lessonReadStore = { async listForLearner() { return []; } } as unknown as LessonReadStorePort;

  return {
    counts,
    deps: { learnerStore, expeditionStore, awardsStore, enrichmentRead, studyItemStore, conceptLessonStore, responseLog, verdictStore, lessonReadStore }
  };
}

test("reads each distinct enrichment's detail/study-items/lessons exactly once regardless of how many learners hold it (AE5)", async () => {
  const { deps, counts } = fakeDeps({
    learnerRefs: ["A", "B", "C"],
    evidenceRefs: ["A", "B", "C"],
    // All three learners hold E1; two also hold E2.
    readyEnrichmentIdsByLearner: { A: ["E1", "E2"], B: ["E1", "E2"], C: ["E1"] }
  });
  await getWeeklyLeaderboard({ now: new Date("2026-07-06T12:00:00.000Z"), ...deps });

  assert.deepEqual([...counts.detail.entries()].sort(), [["E1", 1], ["E2", 1]], "detail read once per distinct enrichment");
  assert.deepEqual([...counts.studyItems.entries()].sort(), [["E1", 1], ["E2", 1]]);
  assert.deepEqual([...counts.lessons.entries()].sort(), [["E1", 1], ["E2", 1]]);
});

test("skips the projection for learners with no evidence but still emits their 0-point row", async () => {
  const { deps, counts } = fakeDeps({
    learnerRefs: ["A", "Dormant"],
    evidenceRefs: ["A"], // Dormant has no evidence
    readyEnrichmentIdsByLearner: { A: ["E1"], Dormant: ["E1"] }
  });
  const { rows } = await getWeeklyLeaderboard({ now: new Date("2026-07-06T12:00:00.000Z"), ...deps });

  const dormant = rows.find((row) => row.learnerRef === "Dormant");
  assert.ok(dormant, "the dormant learner still gets a row");
  assert.equal(dormant?.points, 0, "with 0 points");
  // Only the active learner's expedition drives the (single) E1 read; the dormant duplicate holder does not add a second read.
  assert.deepEqual([...counts.detail.entries()], [["E1", 1]], "no extra enrichment read for the no-evidence learner");
});
