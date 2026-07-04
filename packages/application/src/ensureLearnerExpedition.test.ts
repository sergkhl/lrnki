import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphDetail, EnrichmentInspectionReadPort, LearnerExpedition, LearnerExpeditionStorePort, NewLearnerExpedition } from "@lrnki/ports";
import { ensureLearnerExpedition } from "./ensureLearnerExpedition";

test("ensureLearnerExpedition creates an admin expedition with the recommended ready target", async () => {
  const store = memoryStore();
  const result = await ensureLearnerExpedition({
    learnerStateRef: "admin",
    enrichmentId: "enrichment-1",
    enrichmentRead: readWith(detail()),
    expeditionStore: store,
    newLearnerExpeditionId: () => "learner-expedition-1"
  });

  assert.deepEqual(result, {
    status: "ready",
    learnerExpeditionId: "learner-expedition-1",
    enrichmentId: "enrichment-1",
    targetDerivedNodeId: "target"
  });
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].learnerStateRef, "admin");
  assert.equal(store.rows[0].kind, "topic");
  assert.equal(store.rows[0].status, "ready");
  assert.equal(store.rows[0].active, true);
  assert.equal(store.rows[0].title, "Target");
  assert.equal(store.rows[0].declaredDomain, "software engineering");
});

test("ensureLearnerExpedition reuses an existing learner expedition for the same enrichment", async () => {
  const store = memoryStore([row({ learnerExpeditionId: "existing", learnerStateRef: "admin", enrichmentId: "enrichment-1" })]);
  const result = await ensureLearnerExpedition({
    learnerStateRef: "admin",
    enrichmentId: "enrichment-1",
    enrichmentRead: readWith(detail()),
    expeditionStore: store
  });

  assert.equal(result.status, "existing");
  assert.equal(result.status === "existing" ? result.expedition.learnerExpeditionId : null, "existing");
  assert.equal(store.rows.length, 1);
});

test("ensureLearnerExpedition returns no_target when no playable study items exist", async () => {
  const store = memoryStore();
  const result = await ensureLearnerExpedition({
    learnerStateRef: "admin",
    enrichmentId: "enrichment-1",
    enrichmentRead: readWith(detail({ noStudyItems: true })),
    expeditionStore: store
  });

  assert.deepEqual(result, { status: "no_target" });
  assert.equal(store.rows.length, 0);
});

test("ensureLearnerExpedition for admin does not reuse another learner's row", async () => {
  const store = memoryStore([row({ learnerExpeditionId: "other", learnerStateRef: "learner", enrichmentId: "enrichment-1" })]);
  await ensureLearnerExpedition({
    learnerStateRef: "admin",
    enrichmentId: "enrichment-1",
    enrichmentRead: readWith(detail()),
    expeditionStore: store,
    newLearnerExpeditionId: () => "admin-row"
  });

  assert.deepEqual(store.rows.map((candidate) => candidate.learnerStateRef).sort(), ["admin", "learner"]);
});

function memoryStore(initial: LearnerExpedition[] = []): LearnerExpeditionStorePort & { rows: LearnerExpedition[] } {
  const rows = [...initial];
  return {
    rows,
    async upsert(expedition: NewLearnerExpedition) {
      const existingIndex = rows.findIndex((row) => row.learnerExpeditionId === expedition.learnerExpeditionId);
      const next = row(expedition);
      if (existingIndex >= 0) rows[existingIndex] = next;
      else rows.push(next);
    },
    async listForLearner(learnerStateRef: string) {
      return rows.filter((candidate) => candidate.learnerStateRef === learnerStateRef);
    },
    async getForLearner(input) {
      return rows.find((candidate) => candidate.learnerStateRef === input.learnerStateRef && candidate.learnerExpeditionId === input.learnerExpeditionId);
    },
    async getByEnrichment(input) {
      return rows.find((candidate) => candidate.learnerStateRef === input.learnerStateRef && candidate.enrichmentId === input.enrichmentId);
    },
    async setActive() {},
    async updateProgress() {}
  };
}

function row(input: Partial<LearnerExpedition> & Pick<LearnerExpedition, "learnerExpeditionId" | "learnerStateRef">): LearnerExpedition {
  return {
    learnerExpeditionId: input.learnerExpeditionId,
    learnerStateRef: input.learnerStateRef,
    kind: input.kind ?? "topic",
    title: input.title ?? "Target",
    declaredDomain: input.declaredDomain ?? "software engineering",
    status: input.status ?? "ready",
    currentOperationId: input.currentOperationId ?? null,
    currentOperationType: input.currentOperationType ?? null,
    enrichmentId: input.enrichmentId ?? "enrichment-1",
    targetDerivedNodeId: input.targetDerivedNodeId ?? "target",
    active: input.active ?? true,
    failureMessage: input.failureMessage ?? null,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z"
  };
}

function readWith(enrichmentDetail: DerivedGraphDetail | undefined): EnrichmentInspectionReadPort {
  return {
    async listEnrichmentSummaries() { return []; },
    async getDerivedGraphDetail() { return enrichmentDetail; }
  };
}

function detail(opts: { noStudyItems?: boolean } = {}): DerivedGraphDetail {
  return {
    summary: {
      enrichmentId: "enrichment-1",
      graphVersionId: null,
      enrichmentConfigHash: "test",
      judgeModel: "test",
      difficultyMethod: "test",
      status: "succeeded",
      edgeCount: 1,
      certainEdgeCount: 1,
      uncertainEdgeCount: 0,
      conceptCount: 2,
      studyItemCount: opts.noStudyItems ? 0 : 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z"
    },
    nodes: [
      {
        derivedNodeId: "prereq",
        label: "Prerequisite",
        aliases: [],
        declaredDomain: "software engineering",
        difficulty: null,
        difficultyRationale: null,
        nodeKind: "anchor",
        groundingOrigin: "document_anchored",
        role: "prerequisite",
        hasStudyItem: !opts.noStudyItems,
        grounding: null
      },
      {
        derivedNodeId: "target",
        label: "Target",
        aliases: [],
        declaredDomain: "software engineering",
        difficulty: null,
        difficultyRationale: null,
        nodeKind: "enrichment",
        groundingOrigin: "llm_grounded",
        role: "prerequisite",
        hasStudyItem: !opts.noStudyItems,
        grounding: null
      }
    ],
    edges: [{
      prerequisiteDerivedNodeId: "prereq",
      dependentDerivedNodeId: "target",
      confidence: 0.9,
      uncertain: false,
      judgeModel: "test"
    }],
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}
