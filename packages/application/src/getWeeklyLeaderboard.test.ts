import assert from "node:assert/strict";
import test from "node:test";
import type { StudyItem } from "@lrnki/domain-core";
import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  LearnerAwardsStorePort,
  LearnerExpeditionStorePort,
  LearnerProfileReadPort,
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

  const learnerProfileRead: LearnerProfileReadPort = {
    async list() { return input.learnerRefs.map((learnerRef) => ({ learnerRef, displayName: learnerRef, createdAt: "2026-06-01T00:00:00.000Z" })); },
    async listRefsWithStudyEvidence() { return input.evidenceRefs; }
  };
  const expeditionStore = {
    async listForLearner(learnerStateRef: string) {
      return (input.readyEnrichmentIdsByLearner[learnerStateRef] ?? []).map((enrichmentId) => ({
        status: "ready",
        kind: "source",
        enrichmentId,
        assetSetIdentity: `assets-${enrichmentId}`
      } as never));
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
  const sourceExpeditions = {
    async qualify(enrichmentId: string) {
      // One qualification owns the detail/item/lesson reads and route derivation for every learner
      // sharing this enrichment; count its internal source reads explicitly for AE5.
      bump(counts.detail, enrichmentId);
      bump(counts.studyItems, enrichmentId);
      bump(counts.lessons, enrichmentId);
      bump(counts.absent, enrichmentId);
      return {
        status: "available" as const,
        candidate: {
          enrichmentId,
          title: enrichmentId,
          declaredDomain: "test",
          totalConceptCount: 0,
          searchTerms: []
        },
        assets: {
          detail: emptyDetail,
          studyItems: [],
          lessons: [],
          lessonAbsent: [],
          trailNodeIds: new Set<string>(),
          routePlan: {
            policyIdentity: "source-expedition-route-test",
            orderedDerivedNodeIds: [],
            legs: [],
            summitDerivedNodeId: null
          },
          expectedAssets: {
            assetSetIdentity: `assets-${enrichmentId}`,
            currentConceptLessonIds: [],
            currentStudyItemIds: []
          }
        }
      };
    }
  } as Parameters<typeof getWeeklyLeaderboard>[0]["sourceExpeditions"];

  return {
    counts,
    deps: {
      learnerProfileRead,
      expeditionStore,
      awardsStore,
      enrichmentRead,
      studyItemStore,
      conceptLessonStore,
      responseLog,
      verdictStore,
      lessonReadStore,
      sourceExpeditions
    }
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

test("source mastery projects only when the learner's pinned asset identity is current", async () => {
  const board = async (qualifiedAssetSetIdentity: string) => {
    const { deps } = fakeDeps({
      learnerRefs: ["A"],
      evidenceRefs: ["A"],
      readyEnrichmentIdsByLearner: { A: ["E1"] }
    });
    const detail: DerivedGraphDetail = {
      summary: {
        enrichmentId: "E1",
        graphVersionId: "G1",
        enrichmentConfigHash: "cfg",
        judgeModel: "test",
        difficultyMethod: "test",
        status: "succeeded",
        edgeCount: 0,
        certainEdgeCount: 0,
        uncertainEdgeCount: 0,
        conceptCount: 1,
        studyItemCount: 1,
        startedAt: "2026-07-01T00:00:00.000Z",
        completedAt: "2026-07-01T00:00:00.000Z"
      },
      nodes: [{
        derivedNodeId: "N1",
        label: "Current Concept",
        aliases: [],
        declaredDomain: "test",
        difficulty: 0.5,
        difficultyRationale: null,
        nodeKind: "anchor",
        groundingOrigin: "document_anchored",
        role: "anchor",
        hasStudyItem: true,
        grounding: null
      }],
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    };
    const item: StudyItem = {
      studyItemId: "I1",
      graphVersionId: "G1",
      enrichmentId: "E1",
      derivedNodeId: "N1",
      groundingProvenance: "source_cep",
      generatingModel: "test",
      configHash: "cfg",
      itemType: "option_select",
      question: "Which answer is current?",
      explanation: "The current answer is selected.",
      explorableTerms: [],
      options: [
        { optionId: "correct", text: "Current", isCorrect: true, provenance: "source" },
        { optionId: "wrong", text: "Stale", isCorrect: false, provenance: "generated" }
      ]
    };
    return getWeeklyLeaderboard({
      now: new Date("2026-07-06T12:00:00.000Z"),
      ...deps,
      responseLog: {
        async listForLearner() {
          return [{
            responseId: "R1",
            learnerStateRef: "A",
            scope: "neutral",
            studyItemId: "I1",
            derivedNodeId: "N1",
            signalType: "graded",
            judgedOutcome: "correct",
            gradedScore: 1,
            responseSource: "human",
            graderIdentity: "auto",
            batchId: null,
            attemptSeq: 1,
            submittedAnswer: "correct",
            createdAt: "2026-07-06T10:00:00.000Z"
          }];
        }
      } as unknown as ResponseLogStorePort,
      sourceExpeditions: {
        async qualify() {
          return {
            status: "available",
            candidate: {
              enrichmentId: "E1",
              title: "Current Concept",
              declaredDomain: "test",
              totalConceptCount: 1,
              searchTerms: ["Current Concept"]
            },
            assets: {
              detail,
              studyItems: [item],
              lessons: [],
              lessonAbsent: [],
              trailNodeIds: new Set(["N1"]),
              routePlan: {
                policyIdentity: "source-expedition-route-test",
                orderedDerivedNodeIds: ["N1"],
                legs: [{
                  legIndex: 0,
                  anchorDerivedNodeId: "N1",
                  derivedNodeIds: ["N1"],
                  selectedBonusStudyItemIds: []
                }],
                summitDerivedNodeId: "N1"
              },
              expectedAssets: {
                assetSetIdentity: qualifiedAssetSetIdentity,
                currentConceptLessonIds: [],
                currentStudyItemIds: ["I1"]
              }
            }
          };
        }
      }
    });
  };

  const current = await board("assets-E1");
  assert.ok((current.rows.find((row) => row.learnerRef === "A")?.points ?? 0) > 0);
  const stale = await board("new-assets-E1");
  assert.equal(stale.rows.find((row) => row.learnerRef === "A")?.points, 0);
  assert.deepEqual(stale.contributionsByLearner.get("A"), []);
});
