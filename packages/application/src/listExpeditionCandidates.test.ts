import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphDetail, EnrichmentInspectionReadPort, EnrichmentSummary, LearnerExpedition, LearnerExpeditionStorePort } from "@lrnki/ports";
import { listExpeditionCandidates } from "./listExpeditionCandidates";

test("listExpeditionCandidates ranks fully ready targets above larger unready targets and caps the result", async () => {
  const read = fakeRead([
    summary("unready", "2026-01-02T00:00:00.000Z"),
    summary("ready", "2026-01-01T00:00:00.000Z")
  ], {
    unready: detail("unready", [
      node("u-a", "Unready prerequisite", true),
      node("u-b", "Unready target", false)
    ], [{ prerequisiteDerivedNodeId: "u-a", dependentDerivedNodeId: "u-b", confidence: 0.9, uncertain: false, judgeModel: "test" }]),
    ready: detail("ready", [
      node("r-a", "Ready prerequisite", true),
      node("r-b", "Ready target", true)
    ], [{ prerequisiteDerivedNodeId: "r-a", dependentDerivedNodeId: "r-b", confidence: 0.9, uncertain: false, judgeModel: "test" }])
  });

  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: read,
    expeditionStore: fakeStore([]),
    limit: 1
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].enrichmentId, "ready");
  assert.equal(result.candidates[0].readinessRank, 1);
});

test("listExpeditionCandidates returns only the learner's own expedition rows", async () => {
  const own = expedition("learner-one", "mine");
  const result = await listExpeditionCandidates({
    learnerStateRef: "learner-one",
    enrichmentRead: fakeRead([], {}),
    expeditionStore: fakeStore([own, expedition("learner-two", "theirs")])
  });

  assert.deepEqual(result.learnerExpeditions.map((row) => row.learnerExpeditionId), ["mine"]);
});

function fakeRead(summaries: EnrichmentSummary[], details: Record<string, DerivedGraphDetail>): EnrichmentInspectionReadPort {
  return {
    async listEnrichmentSummaries() {
      return summaries;
    },
    async getDerivedGraphDetail(enrichmentId: string) {
      return details[enrichmentId];
    }
  };
}

function fakeStore(rows: LearnerExpedition[]): LearnerExpeditionStorePort {
  return {
    async upsert() {},
    async listForLearner(learnerStateRef: string) {
      return rows.filter((row) => row.learnerStateRef === learnerStateRef);
    },
    async getForLearner() {
      return undefined;
    },
    async getByEnrichment() {
      return undefined;
    },
    async setActive() {},
    async updateProgress() {}
  };
}

function summary(enrichmentId: string, startedAt: string): EnrichmentSummary {
  return {
    enrichmentId,
    graphVersionId: null,
    enrichmentConfigHash: "test",
    judgeModel: "test",
    difficultyMethod: "test",
    status: "succeeded",
    edgeCount: 1,
    certainEdgeCount: 1,
    uncertainEdgeCount: 0,
    conceptCount: 2,
    studyItemCount: 1,
    startedAt,
    completedAt: startedAt
  };
}

function detail(enrichmentId: string, nodes: DerivedGraphDetail["nodes"], edges: DerivedGraphDetail["edges"]): DerivedGraphDetail {
  return {
    summary: summary(enrichmentId, "2026-01-01T00:00:00.000Z"),
    nodes,
    edges,
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

function node(derivedNodeId: string, label: string, hasStudyItem: boolean): DerivedGraphDetail["nodes"][number] {
  return {
    derivedNodeId,
    label,
    aliases: [],
    declaredDomain: "test",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment",
    groundingOrigin: "llm_grounded",
    role: "prerequisite",
    hasStudyItem,
    grounding: null
  };
}

function expedition(learnerStateRef: string, learnerExpeditionId: string): LearnerExpedition {
  return {
    learnerExpeditionId,
    learnerStateRef,
    kind: "topic",
    title: "Topic",
    declaredDomain: "test",
    status: "charting",
    currentOperationId: null,
    currentOperationType: null,
    enrichmentId: null,
    targetDerivedNodeId: null,
    active: false,
    failureMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
