import assert from "node:assert/strict";
import test from "node:test";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { generateTopicExpedition, isTransientGenerationError } from "./generateTopicExpedition";

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
        return 1;
      }
      if (input.declaredDomain) {
        calls.push(`progress:domain:${input.declaredDomain}`);
        return 1;
      }
      calls.push(`progress:${input.currentOperationType}`);
      return 1;
    }
  };
}

test("generateTopicExpedition releases the claim (stays generating) on transient exhaustion", async () => {
  const calls: string[] = [];
  const transient = Object.assign(new Error("timed out"), {
    stageErrorDetail: {
      kind: "forced_tool_exhaustion",
      message: "timed out",
      attempts: [{ attempt: 0, kind: "timeout", code: "UND_ERR_HEADERS_TIMEOUT" }]
    }
  });
  await assert.rejects(() => generateTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: progressStore(calls),
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => {
        throw transient;
      }
    }
  } as never), /timed out/);
  // No failed write: the operation id is cleared and the row stays `generating`
  // for the supervisor's attempt budget to re-claim.
  assert.deepEqual(calls, ["progress:enrichment", "progress:null"]);
});

test("generateTopicExpedition aborts without writes when a fenced write loses the claim", async () => {
  const calls: string[] = [];
  const store = progressStore(calls);
  // Every write affects 0 rows: a competing claim owns the row.
  store.updateProgress = async () => 0;
  await assert.rejects(() => generateTopicExpedition({
    learnerExpeditionId: "expedition",
    topic: "Rust ownership",
    declaredDomain: "software engineering",
    expeditionStore: store,
    newEnrichmentId: () => "enrichment-1",
    deps: {
      runSynthetic: async () => {
        calls.push("synthetic");
        return { derivedNodes: [{ derivedNodeId: "node-1" }], prerequisiteEdges: [], difficulties: [] } as never;
      }
    }
  } as never), /claim lost/i);
  // The run stopped at the first fenced write — no LLM work was spent.
  assert.deepEqual(calls, []);
});

test("isTransientGenerationError separates infrastructure trails from model deviations", () => {
  const withAttempts = (attempts: object[]) =>
    Object.assign(new Error("x"), { stageErrorDetail: { kind: "forced_tool_exhaustion", message: "x", attempts } });
  assert.equal(isTransientGenerationError(withAttempts([{ attempt: 0, kind: "network", code: "ECONNRESET" }])), true);
  assert.equal(isTransientGenerationError(withAttempts([{ attempt: 0, kind: "http", status: 503 }, { attempt: 1, kind: "http", status: 429 }])), true);
  assert.equal(isTransientGenerationError(withAttempts([{ attempt: 0, kind: "timeout" }])), true);
  assert.equal(isTransientGenerationError(withAttempts([{ attempt: 0, kind: "network" }, { attempt: 1, kind: "schema_invalid" }])), false);
  assert.equal(isTransientGenerationError(withAttempts([{ attempt: 0, kind: "http", status: 400 }])), false);
  assert.equal(isTransientGenerationError(new Error("plain")), false);
});
