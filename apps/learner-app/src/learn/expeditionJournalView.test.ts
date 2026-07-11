import assert from "node:assert/strict";
import { test } from "@jest/globals";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application/projection";
import { partitionExpeditionJournal } from "./expeditionJournalView";

type LearnerRow = LearnerExpeditionEntry["learnerExpeditions"][number];
type Progress = NonNullable<LearnerRow["progress"]>;

function expedition(overrides: Partial<LearnerRow> & { learnerExpeditionId: string }): LearnerRow {
  return {
    learnerStateRef: "explorer",
    kind: "topic",
    title: "Trail",
    declaredDomain: "domain",
    status: "ready",
    currentOperationId: null,
    currentOperationType: null,
    enrichmentId: `enrichment-${overrides.learnerExpeditionId}`,
    active: false,
    failureMessage: null,
    generationAttempts: 0,
    claimedAt: null,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    ...overrides
  };
}

function progress(overrides: Partial<Progress>): Progress {
  return { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 0, itemsTotal: 10, ...overrides };
}

function candidate(overrides: Partial<ExpeditionCandidate> & { enrichmentId: string }): ExpeditionCandidate {
  return {
    graphVersionId: null,
    title: "Summit",
    declaredDomain: "domain",
    startedAt: "2026-07-08T00:00:00.000Z",
    summitDerivedNodeId: `node-${overrides.enrichmentId}`,
    readyStopCount: 5,
    totalStopCount: 5,
    readinessRank: 1,
    ...overrides
  };
}

function entry(input: Partial<LearnerExpeditionEntry>): LearnerExpeditionEntry {
  return { candidates: [], learnerExpeditions: [], ...input };
}

test("a ready expedition with a graded attempt is started", () => {
  const view = partitionExpeditionJournal(
    entry({ learnerExpeditions: [expedition({ learnerExpeditionId: "a", progress: progress({ itemsAttempted: 1 }) })] })
  );
  assert.deepEqual(view.started.map((e) => e.learnerExpeditionId), ["a"]);
  assert.deepEqual(view.yours, []);
});

test("a ready expedition with only a lesson read is started", () => {
  const view = partitionExpeditionJournal(
    entry({ learnerExpeditions: [expedition({ learnerExpeditionId: "a", progress: progress({ lessonsRead: 1 }) })] })
  );
  assert.deepEqual(view.started.map((e) => e.learnerExpeditionId), ["a"]);
});

test("a ready expedition with zero activity falls under yours", () => {
  const view = partitionExpeditionJournal(
    entry({ learnerExpeditions: [expedition({ learnerExpeditionId: "a", progress: progress({}) })] })
  );
  assert.deepEqual(view.started, []);
  assert.deepEqual(view.yours.map((e) => e.learnerExpeditionId), ["a"]);
});

test("generating and failed expeditions are never started", () => {
  const view = partitionExpeditionJournal(
    entry({
      learnerExpeditions: [
        expedition({ learnerExpeditionId: "gen", status: "generating", progress: undefined }),
        expedition({ learnerExpeditionId: "fail", status: "failed", progress: undefined })
      ]
    })
  );
  assert.deepEqual(view.started, []);
  assert.deepEqual(view.yours.map((e) => e.learnerExpeditionId), ["gen", "fail"]);
});

test("adopted candidates are excluded from shared; unadopted are kept", () => {
  const view = partitionExpeditionJournal(
    entry({
      candidates: [
        candidate({ enrichmentId: "adopted", existingLearnerExpeditionId: "exp-1" }),
        candidate({ enrichmentId: "fresh" })
      ]
    })
  );
  assert.deepEqual(view.shared.map((c) => c.enrichmentId), ["fresh"]);
});

test("intra-group input order is preserved (no re-sorting)", () => {
  const view = partitionExpeditionJournal(
    entry({
      learnerExpeditions: [
        expedition({ learnerExpeditionId: "s1", active: true, progress: progress({ itemsAttempted: 2 }) }),
        expedition({ learnerExpeditionId: "y1", progress: progress({}) }),
        expedition({ learnerExpeditionId: "s2", progress: progress({ itemsAttempted: 1 }) }),
        expedition({ learnerExpeditionId: "y2", status: "generating", progress: undefined })
      ],
      candidates: [candidate({ enrichmentId: "c1" }), candidate({ enrichmentId: "c2" })]
    })
  );
  assert.deepEqual(view.started.map((e) => e.learnerExpeditionId), ["s1", "s2"]);
  assert.deepEqual(view.yours.map((e) => e.learnerExpeditionId), ["y1", "y2"]);
  assert.deepEqual(view.shared.map((c) => c.enrichmentId), ["c1", "c2"]);
});
