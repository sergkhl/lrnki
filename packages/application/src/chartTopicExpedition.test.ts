import assert from "node:assert/strict";
import test from "node:test";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { chartTopicExpedition } from "./chartTopicExpedition";

test("chartTopicExpedition runs synthetic generation then study item generation and marks the row ready", async () => {
  const calls: string[] = [];
  const store = progressStore(calls);
  const result = await chartTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: store,
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => {
        calls.push("synthetic");
        return { derivedNodes: [{ derivedNodeId: "node-1" }], prerequisiteEdges: [], difficulties: [] } as never;
      },
      generateStudyItems: async () => {
        calls.push("items");
        return { graphVersionId: null, enrichmentId: "enrichment-1", studyItems: [{ derivedNodeId: "node-1" }], rejected: [], lessons: [], lessonAbsent: [] } as never;
      }
    }
  } as never);

  assert.equal(result.enrichmentId, "enrichment-1");
  assert.equal(result.targetDerivedNodeId, "node-1");
  assert.deepEqual(calls, ["progress:enrichment", "synthetic", "progress:study_items", "items", "progress:ready"]);
});

test("chartTopicExpedition marks a failed row when a stage throws", async () => {
  const calls: string[] = [];
  await assert.rejects(() => chartTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: progressStore(calls),
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => {
        throw new Error("model down");
      }
    }
  } as never), /model down/);
  assert.deepEqual(calls, ["progress:enrichment", "progress:failed:model down"]);
});

test("chartTopicExpedition fails before ready when no target node is available", async () => {
  const calls: string[] = [];
  await assert.rejects(() => chartTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: progressStore(calls),
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => ({ derivedNodes: [], prerequisiteEdges: [], difficulties: [] }) as never,
      generateStudyItems: async () => ({ graphVersionId: null, enrichmentId: "enrichment-1", studyItems: [], rejected: [], lessons: [], lessonAbsent: [] }) as never
    }
  } as never), /no target stop/);
  assert.deepEqual(calls, ["progress:enrichment", "progress:study_items", "progress:failed:Charting produced no target stop."]);
});

function progressStore(calls: string[]): LearnerExpeditionStorePort {
  return {
    async upsert() {},
    async listForLearner() { return []; },
    async getForLearner() { return undefined; },
    async getByEnrichment() { return undefined; },
    async setActive() {},
    async updateProgress(input) {
      calls.push(`progress:${input.status === "ready" || input.status === "failed" ? [input.status, input.failureMessage].filter(Boolean).join(":") : input.currentOperationType}`);
    }
  };
}
