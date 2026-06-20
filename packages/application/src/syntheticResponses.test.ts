import assert from "node:assert/strict";
import test from "node:test";
import type { Card, DerivedGraphLayer, NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, LearnerAnswerSimulatorPort, ResponseLogStorePort } from "@lrnki/ports";
import { rateByDifficulty, synthesizeResponses } from "./syntheticResponses";

function anchor(id: string, conceptId: string) {
  return { nodeKind: "anchor" as const, derivedNodeId: id, conceptId, groundingOrigin: "document_anchored" as const, role: "anchor" as const, layer: "asserted" as const, canonicalLabel: id, normalizedLabel: id, declaredDomain: "software engineering", aliases: [] };
}
function edge(p: string, d: string) {
  return { prerequisiteDerivedNodeId: p, dependentDerivedNodeId: d, predicate: "inferred-prerequisite-of" as const, confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } };
}
const layer: DerivedGraphLayer = {
  enrichmentId: "e", graphVersionId: "gv", enrichmentConfigHash: "c", judgeModel: "m",
  derivedNodes: [anchor("nA", "cA"), anchor("nB", "cB"), anchor("nC", "cC"), anchor("nD", "cD")],
  prerequisiteEdges: [edge("nA", "nB"), edge("nB", "nD"), edge("nC", "nD")],
  difficulties: [
    { derivedNodeId: "nA", score: 0.2, method: "m", components: {} },
    { derivedNodeId: "nB", score: 0.5, method: "m", components: {} },
    { derivedNodeId: "nC", score: 0.8, method: "m", components: {} },
    { derivedNodeId: "nD", score: 0.9, method: "m", components: {} }
  ]
};
function card(derivedNodeId: string): Card {
  return {
    cardId: `card-${derivedNodeId}`,
    graphVersionId: "gv",
    enrichmentId: "e",
    derivedNodeId,
    groundingProvenance: "source_cep",
    question: `Q ${derivedNodeId}?`,
    answerKey: `A ${derivedNodeId}`,
    selfReportPrompt: "Confident?",
    citations: [],
    generatingModel: "g",
    configHash: "c"
  };
}
const cards = ["nA", "nB", "nC", "nD"].map(card);

function fakeResponseLog(): { store: ResponseLogStorePort; rows: NewResponseLogRow[] } {
  const rows: NewResponseLogRow[] = [];
  const hydrate = (r: NewResponseLogRow): ResponseLogRow => ({ ...r, createdAt: new Date().toISOString() });
  return {
    rows,
    store: {
      async append(a) { rows.push(...a); },
      async listForLearner(ref) { return rows.filter((r) => r.learnerStateRef === ref).map(hydrate); },
      async listForLearnerNode(ref, nodeId) { return rows.filter((r) => r.learnerStateRef === ref && r.derivedNodeId === nodeId).map(hydrate); },
      async nextAttemptSeq(ref) { return rows.filter((r) => r.learnerStateRef === ref).length + 1; }
    }
  };
}

const simulator: LearnerAnswerSimulatorPort = { model: "sim", async simulateAnswer() { return { answer: "a simulated answer" }; } };
const judge: AnswerGradingJudgePort = { model: "kg-independent-judge", async grade() { return { outcome: "partial", score: 0.5, rationale: "r" }; } };

test("rateByDifficulty yields good/easy below the cutoff and hard/again at or above it", () => {
  assert.equal(rateByDifficulty(0.2, 0.6), "easy");
  assert.equal(rateByDifficulty(0.5, 0.6), "good");
  assert.equal(rateByDifficulty(0.8, 0.6), "again");
  assert.equal(rateByDifficulty(0.65, 0.6), "hard");
});

test("synthesizeResponses writes one calibration batch and routes graded answers through the real judge", async () => {
  const log = fakeResponseLog();
  const result = await synthesizeResponses({
    learnerStateRef: "L1", layer, targetDerivedNodeId: "nD", declaredDomain: "software engineering",
    cards, profile: { difficultyCutoff: 0.6, gradedSampleSize: 2 }, simulator, judge, responseLog: log.store
  });

  // Calibration: ancestors of D with cards = {cC, cB, cA} → 3 self_report rows in ONE batch.
  assert.equal(result.selfReportCount, 3);
  const selfReports = log.rows.filter((r) => r.signalType === "self_report");
  assert.equal(selfReports.length, 3);
  assert.equal(new Set(selfReports.map((r) => r.batchId)).size, 1, "single calibration batch_id");
  assert.deepEqual(selfReports.every((r) => r.responseSource === "synthetic"), true);

  // Measurement: gradedSampleSize=2 → 2 graded rows, tagged synthetic, judge as grader.
  assert.equal(result.gradedCount, 2);
  const graded = log.rows.filter((r) => r.signalType === "graded");
  assert.equal(graded.length, 2);
  assert.deepEqual(graded.every((r) => r.responseSource === "synthetic"), true);
  assert.deepEqual(graded.every((r) => r.graderIdentity === "kg-independent-judge"), true);
});

test("the generator does not write graded rows directly — they carry the judge's outcome via U5", async () => {
  const log = fakeResponseLog();
  await synthesizeResponses({
    learnerStateRef: "L2", layer, targetDerivedNodeId: "nD", declaredDomain: "software engineering",
    cards, profile: { difficultyCutoff: 0.6, gradedSampleSize: 1 }, simulator, judge, responseLog: log.store
  });
  const graded = log.rows.filter((r) => r.signalType === "graded");
  assert.equal(graded.length, 1);
  // Deterministic transform only: the canned judge said partial → graded_score 0.5.
  assert.equal(graded[0].judgedOutcome, "partial");
  assert.equal(graded[0].gradedScore, 0.5);
});
