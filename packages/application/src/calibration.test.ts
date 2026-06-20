import assert from "node:assert/strict";
import test from "node:test";
import type { Card, DerivedGraphLayer, NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import {
  appendSelfReportBatch,
  buildCalibrationSet,
  propagateSelfReport,
  PROPAGATED_SELF_REPORT_EVIDENCE_WEIGHT,
  SELF_REPORT_EVIDENCE_WEIGHT,
  type SelfReportInput
} from "./calibration";

// Fixture DAG (derived-node space): A -> B -> D, C -> D, plus an enrichment-only
// prerequisite node E -> D with a card. Ancestors of D = {A, B, C, E}; every carded
// derived node can be calibrated.
function anchor(id: string, conceptId: string) {
  return {
    nodeKind: "anchor" as const, derivedNodeId: id, conceptId, groundingOrigin: "document_anchored" as const,
    role: "anchor" as const, layer: "asserted" as const, canonicalLabel: id, normalizedLabel: id.toLowerCase(),
    declaredDomain: "software engineering", aliases: []
  };
}
function edge(prerequisite: string, dependent: string) {
  return { prerequisiteDerivedNodeId: prerequisite, dependentDerivedNodeId: dependent, predicate: "inferred-prerequisite-of" as const, confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "fixture" } };
}

const layer: DerivedGraphLayer = {
  enrichmentId: "enr-1",
  graphVersionId: "gv-1",
  enrichmentConfigHash: "cfg",
  judgeModel: "mock",
  derivedNodes: [
    anchor("nA", "cA"), anchor("nB", "cB"), anchor("nC", "cC"), anchor("nD", "cD"),
    {
      nodeKind: "enrichment", derivedNodeId: "nE", groundingOrigin: "source_mentioned", role: "prerequisite",
      layer: "derived", canonicalLabel: "E", normalizedLabel: "e", declaredDomain: "software engineering", aliases: [], groundingPassages: []
    }
  ],
  prerequisiteEdges: [edge("nA", "nB"), edge("nB", "nD"), edge("nC", "nD"), edge("nE", "nD")],
  difficulties: [
    { derivedNodeId: "nA", score: 0.2, method: "m", components: {} },
    { derivedNodeId: "nB", score: 0.5, method: "m", components: {} },
    { derivedNodeId: "nC", score: 0.8, method: "m", components: {} },
    { derivedNodeId: "nD", score: 0.9, method: "m", components: {} },
    { derivedNodeId: "nE", score: 0.3, method: "m", components: {} }
  ]
};

const cards: Pick<Card, "derivedNodeId" | "cardId">[] = [
  { derivedNodeId: "nA", cardId: "cardA" }, { derivedNodeId: "nB", cardId: "cardB" },
  { derivedNodeId: "nC", cardId: "cardC" }, { derivedNodeId: "nD", cardId: "cardD" },
  { derivedNodeId: "nE", cardId: "cardE" }
];

function fakeResponseLog(): { store: ResponseLogStorePort; rows: NewResponseLogRow[] } {
  const rows: NewResponseLogRow[] = [];
  const hydrate = (r: NewResponseLogRow): ResponseLogRow => ({ ...r, createdAt: new Date().toISOString() });
  const store: ResponseLogStorePort = {
    async append(appended) { rows.push(...appended); },
    async listForLearner(ref) { return rows.filter((r) => r.learnerStateRef === ref).map(hydrate); },
    async listForLearnerNode(ref, derivedNodeId) { return rows.filter((r) => r.learnerStateRef === ref && r.derivedNodeId === derivedNodeId).map(hydrate); },
    async nextAttemptSeq(ref) { return rows.filter((r) => r.learnerStateRef === ref).length + 1; }
  };
  return { store, rows };
}

test("buildCalibrationSet returns exactly the target's prerequisite-ancestor carded nodes, hardest-first (Covers R7)", () => {
  const set = buildCalibrationSet({ layer, targetDerivedNodeId: "nD", cards });
  assert.deepEqual(set.map((item) => item.derivedNodeId), ["nC", "nB", "nE", "nA"], "includes carded enrichment node nE; ordered by difficulty desc");
  assert.deepEqual(set.map((item) => item.cardId), ["cardC", "cardB", "cardE", "cardA"]);
});

test("a 'good' rating on a downstream node propagates seeded rows onto its ancestors, which are not separately asked (Covers AE3, R8)", () => {
  const directRatings: SelfReportInput[] = [{ derivedNodeId: "nB", cardId: "cardB", rating: "good" }];
  const seeded = propagateSelfReport({ layer, directRatings, cards });
  assert.deepEqual(seeded.map((s) => s.derivedNodeId), ["nA"], "B's only ancestor A is seeded");
  assert.equal(seeded[0].propagated, true);
  assert.equal(directRatings.some((r) => r.derivedNodeId === "nA"), false, "A was not directly rated");
});

test("an 'again' rating does not propagate mastery downward", () => {
  const seeded = propagateSelfReport({ layer, directRatings: [{ derivedNodeId: "nB", cardId: "cardB", rating: "again" }], cards });
  assert.equal(seeded.length, 0);
});

test("propagated rows carry the lower evidence weight, distinguishing seeded from claimed", async () => {
  const { rows } = fakeResponseLog();
  const log = fakeResponseLog();
  const ratings: SelfReportInput[] = [
    { derivedNodeId: "nB", cardId: "cardB", rating: "good" },
    { derivedNodeId: "nA", cardId: "cardA", rating: "good", propagated: true }
  ];
  await appendSelfReportBatch({ learnerStateRef: "L1", responseLog: log.store, ratings, responseSource: "synthetic" });
  const byNode = new Map(log.rows.map((r) => [r.derivedNodeId, r] as const));
  assert.equal(byNode.get("nB")!.evidenceWeight, SELF_REPORT_EVIDENCE_WEIGHT);
  assert.equal(byNode.get("nA")!.evidenceWeight, PROPAGATED_SELF_REPORT_EVIDENCE_WEIGHT);
  assert.equal(rows.length, 0, "separate logs do not bleed");
});

test("a second calibration batch appends with a new batch_id, leaving the first intact (Covers R10)", async () => {
  const log = fakeResponseLog();
  const first = await appendSelfReportBatch({ learnerStateRef: "L1", responseLog: log.store, ratings: [{ derivedNodeId: "nB", cardId: "cardB", rating: "again" }], responseSource: "human" });
  const second = await appendSelfReportBatch({ learnerStateRef: "L1", responseLog: log.store, ratings: [{ derivedNodeId: "nB", cardId: "cardB", rating: "good" }], responseSource: "human" });

  assert.notEqual(first.batchId, second.batchId);
  assert.equal(log.rows.length, 2, "the first batch survives the second");
  assert.deepEqual(log.rows.map((r) => r.attemptSeq), [1, 2], "monotonic attempt_seq across batches");
});
