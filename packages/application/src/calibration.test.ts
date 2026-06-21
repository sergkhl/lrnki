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
function uncertainEdge(prerequisite: string, dependent: string) {
  return { ...edge(prerequisite, dependent), uncertain: true };
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
    { derivedNodeId: "nA", score: 0.2, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nB", score: 0.5, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nC", score: 0.8, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nD", score: 0.9, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nE", score: 0.3, method: "m", components: {}, neuralRationale: "" }
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

// --- U5: propagation honors the router's trust model (R6, AE2) --------------
// `propagateSelfReport` must walk only the edges the router trusts (certain edges),
// mirroring `buildReadiness`'s `!edge.uncertain` filter. Otherwise an "I know it"
// credits mastery across edges readiness itself distrusts (the recorded over-seeding
// defect). These fixtures add uncertain edges to the trusted DAG above.

// Ancestor `nU` is reachable from `nB` ONLY through an uncertain edge; `nA` through a
// certain one. The shared `layer` already has the certain `nA -> nB`.
const layerWithUncertainAncestor: DerivedGraphLayer = {
  ...layer,
  derivedNodes: [
    ...layer.derivedNodes,
    {
      nodeKind: "enrichment", derivedNodeId: "nU", groundingOrigin: "source_mentioned", role: "prerequisite",
      layer: "derived", canonicalLabel: "U", normalizedLabel: "u", declaredDomain: "software engineering", aliases: [], groundingPassages: []
    }
  ],
  prerequisiteEdges: [...layer.prerequisiteEdges, uncertainEdge("nU", "nB")]
};
const cardsWithU: Pick<Card, "derivedNodeId" | "cardId">[] = [...cards, { derivedNodeId: "nU", cardId: "cardU" }];

test("a 'good' rating does not seed an ancestor reachable only through an uncertain edge (Covers R6)", () => {
  const seeded = propagateSelfReport({ layer: layerWithUncertainAncestor, directRatings: [{ derivedNodeId: "nB", cardId: "cardB", rating: "good" }], cards: cardsWithU });
  assert.deepEqual(seeded.map((s) => s.derivedNodeId), ["nA"], "only the certain-edge ancestor nA is seeded; the uncertain-edge ancestor nU is excluded");
});

test("a 'good' rating still seeds ancestors reachable through certain edges (regression)", () => {
  // nD's certain ancestors are nA, nB, nC, nE (nU is not an ancestor of nD).
  const seeded = propagateSelfReport({ layer: layerWithUncertainAncestor, directRatings: [{ derivedNodeId: "nD", cardId: "cardD", rating: "good" }], cards: cardsWithU });
  assert.deepEqual([...seeded.map((s) => s.derivedNodeId)].sort(), ["nA", "nB", "nC", "nE"], "all certain-edge ancestors of nD are still seeded");
});

// AE2: the recorded SE cycle shape — an uncertain-edge cycle through the goal. Calibrating
// one node must seed only certain-edge ancestors, terminate, and never credit the goal
// through uncertain edges.
const cyclicLayer: DerivedGraphLayer = {
  ...layer,
  derivedNodes: [anchor("own", "cOwn"), anchor("var", "cVar"), anchor("ptr", "cPtr"), anchor("stk", "cStk"), anchor("goal", "cGoal")],
  // Certain: var -> ptr (ptr's only trusted ancestor is var). Uncertain cycle:
  // own ->(u) var ->(u) ptr ->(u) stk ->(u) own, plus uncertain goal credit own ->(u) goal.
  prerequisiteEdges: [
    edge("var", "ptr"),
    uncertainEdge("own", "var"), uncertainEdge("ptr", "stk"), uncertainEdge("stk", "own"),
    uncertainEdge("own", "goal")
  ],
  difficulties: [
    { derivedNodeId: "own", score: 0.5, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "var", score: 0.2, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "ptr", score: 0.4, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "stk", score: 0.3, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "goal", score: 0.9, method: "m", components: {}, neuralRationale: "" }
  ]
};
const cyclicCards: Pick<Card, "derivedNodeId" | "cardId">[] = [
  { derivedNodeId: "own", cardId: "cOwn" }, { derivedNodeId: "var", cardId: "cVar" },
  { derivedNodeId: "ptr", cardId: "cPtr" }, { derivedNodeId: "stk", cardId: "cStk" }, { derivedNodeId: "goal", cardId: "cGoal" }
];

test("on an uncertain-edge cycle, calibrating one node seeds only certain-edge ancestors and never credits the goal (Covers AE2)", () => {
  // Rate `ptr`. Its only CERTAIN ancestor is `var`. Every other node (own, stk, goal) is
  // reachable only through uncertain edges, so none may be seeded — and the traversal must
  // terminate despite the cycle.
  const seeded = propagateSelfReport({ layer: cyclicLayer, directRatings: [{ derivedNodeId: "ptr", cardId: "cPtr", rating: "good" }], cards: cyclicCards });
  assert.deepEqual(seeded.map((s) => s.derivedNodeId), ["var"], "only the certain-edge ancestor var is seeded");
  assert.equal(seeded.some((s) => s.derivedNodeId === "goal"), false, "the goal is not auto-credited through uncertain edges");
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
