import assert from "node:assert/strict";
import test from "node:test";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { generateTopicExpedition } from "./generateTopicExpedition";

test("generateTopicExpedition runs synthetic generation then study item generation and marks the row ready", async () => {
  const calls: string[] = [];
  const store = progressStore(calls);
  const result = await generateTopicExpedition({
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
  assert.deepEqual(calls, ["progress:enrichment", "synthetic", "progress:study_items", "items", "progress:ready"]);
});

test("generateTopicExpedition infers and persists a missing declared domain inside the enrichment operation", async () => {
  const calls: string[] = [];
  const store = progressStore(calls);
  await generateTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: null,
    declaredDomainInference: {
      model: "test-domain",
      async infer() {
        calls.push("infer-domain");
        return { declaredDomain: "software engineering" };
      }
    },
    expeditionStore: store,
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async (input: { declaredDomain?: string | null; onDeclaredDomain?: (declaredDomain: string) => Promise<void> }) => {
        calls.push(`synthetic:${input.declaredDomain}`);
        await input.onDeclaredDomain?.("software engineering");
        return { derivedNodes: [{ derivedNodeId: "node-1" }], prerequisiteEdges: [], difficulties: [] } as never;
      },
      generateStudyItems: async () => {
        calls.push("items");
        return { graphVersionId: null, enrichmentId: "enrichment-1", studyItems: [{ derivedNodeId: "node-1" }], rejected: [], lessons: [], lessonAbsent: [] } as never;
      }
    }
  } as never);

  assert.deepEqual(calls, [
    "progress:enrichment",
    "synthetic:null",
    "progress:domain:software engineering",
    "progress:study_items",
    "items",
    "progress:ready"
  ]);
});

test("generateTopicExpedition marks a failed row when a stage throws", async () => {
  const calls: string[] = [];
  await assert.rejects(() => generateTopicExpedition({
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

test("generateTopicExpedition fails loudly when the layer produced no concepts", async () => {
  const calls: string[] = [];
  await assert.rejects(() => generateTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: progressStore(calls),
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => ({ derivedNodes: [], prerequisiteEdges: [], difficulties: [] }) as never,
      generateStudyItems: async () => ({ graphVersionId: null, enrichmentId: "enrichment-1", studyItems: [], rejected: [], lessons: [], lessonAbsent: [] }) as never
    }
  } as never), /no concepts/);
  // The empty-layer check fires right after synthetic generation, before study items run.
  assert.deepEqual(calls, ["progress:enrichment", "progress:failed:Scouting produced no concepts."]);
});

function progressStore(calls: string[]): LearnerExpeditionStorePort {
  return {
    async upsert() {},
    async listForLearner() { return []; },
    async getForLearner() { return undefined; },
    async getByEnrichment() { return undefined; },
    async setActive() {},
    async claimNextGenerating() { return undefined; },
    async failExhaustedGenerating() { return 0; },
    async resetGeneration() {},
    async updateProgress(input) {
      if (input.status === "ready" || input.status === "failed") {
        calls.push(`progress:${[input.status, input.failureMessage].filter(Boolean).join(":")}`);
        return;
      }
      if (input.declaredDomain) {
        calls.push(`progress:domain:${input.declaredDomain}`);
        return;
      }
      calls.push(`progress:${input.currentOperationType}`);
    }
  };
}
