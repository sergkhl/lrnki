import assert from "node:assert/strict";
import test from "node:test";
import type { SelfAssessmentItem, CalibrationVerdict, DerivedGraphLayer, NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort, CalibrationVerdictStorePort, LearnerAnswerSimulatorPort, ResponseLogStorePort } from "@lrnki/ports";
import { verdictByDifficulty, synthesizeResponses } from "./syntheticResponses";

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
    { derivedNodeId: "nA", score: 0.2, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nB", score: 0.5, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nC", score: 0.8, method: "m", components: {}, neuralRationale: "" },
    { derivedNodeId: "nD", score: 0.9, method: "m", components: {}, neuralRationale: "" }
  ]
};
function studyItem(derivedNodeId: string): SelfAssessmentItem {
  return {
    itemType: "self_assessment",
    studyItemId: `studyItem-${derivedNodeId}`,
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
const studyItems = ["nA", "nB", "nC", "nD"].map(studyItem);

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

function fakeVerdictStore(): { store: CalibrationVerdictStorePort; verdicts: Map<string, CalibrationVerdict> } {
  const verdicts = new Map<string, CalibrationVerdict>();
  const key = (ref: string, node: string) => `${ref}::${node}`;
  return {
    verdicts,
    store: {
      async upsert(v) { verdicts.set(key(v.learnerStateRef, v.derivedNodeId), { ...v, updatedAt: new Date().toISOString() }); },
      async delete(input) { verdicts.delete(key(input.learnerStateRef, input.derivedNodeId)); },
      async listForLearner(ref) { return [...verdicts.values()].filter((v) => v.learnerStateRef === ref); },
      async clearLearner(ref) { for (const [k, v] of verdicts) if (v.learnerStateRef === ref) verdicts.delete(k); }
    }
  };
}

const simulator: LearnerAnswerSimulatorPort = { model: "sim", async simulateAnswer() { return { answer: "a simulated answer" }; } };
const judge: AnswerGradingJudgePort = { model: "kg-independent-judge", async grade() { return { outcome: "partial", score: 0.5, rationale: "r" }; } };

test("verdictByDifficulty yields 'known' below the cutoff and 'learn' at or above it", () => {
  assert.equal(verdictByDifficulty(0.2, 0.6), "known");
  assert.equal(verdictByDifficulty(0.5, 0.6), "known");
  assert.equal(verdictByDifficulty(0.6, 0.6), "learn");
  assert.equal(verdictByDifficulty(0.8, 0.6), "learn");
});

test("synthesizeResponses seeds verdicts over the goal cone and routes graded answers through the real judge", async () => {
  const log = fakeResponseLog();
  const verdicts = fakeVerdictStore();
  const result = await synthesizeResponses({
    learnerStateRef: "L1", layer, targetDerivedNodeId: "nD", declaredDomain: "software engineering",
    studyItems, profile: { difficultyCutoff: 0.6, gradedSampleSize: 2 }, simulator, judge, responseLog: log.store, verdictStore: verdicts.store
  });

  // Calibration: nD's certain cone = {nA(0.2), nB(0.5), nC(0.8)}. Cutoff 0.6 → nA,nB known; nC learn.
  assert.equal(result.knownCount, 2);
  assert.equal(result.learnCount, 1);
  const seeded = await verdicts.store.listForLearner("L1");
  assert.equal(seeded.length, 3, "one verdict per cone node, in the mutable store (no log rows)");
  assert.deepEqual(new Map(seeded.map((v) => [v.derivedNodeId, v.verdict])).get("nC"), "learn");

  // Measurement: gradedSampleSize=2 → 2 graded rows, tagged synthetic, judge as grader.
  assert.equal(result.gradedCount, 2);
  const graded = log.rows.filter((r) => r.signalType === "graded");
  assert.equal(graded.length, 2);
  assert.deepEqual(graded.every((r) => r.responseSource === "synthetic"), true);
  assert.deepEqual(graded.every((r) => r.graderIdentity === "kg-independent-judge"), true);
  // Calibration writes the verdict store, never the append-only log.
  assert.equal(log.rows.every((r) => r.signalType === "graded"), true, "the log is graded-only");
});

test("the generator does not write graded rows directly — they carry the judge's outcome via U5", async () => {
  const log = fakeResponseLog();
  const verdicts = fakeVerdictStore();
  await synthesizeResponses({
    learnerStateRef: "L2", layer, targetDerivedNodeId: "nD", declaredDomain: "software engineering",
    studyItems, profile: { difficultyCutoff: 0.6, gradedSampleSize: 1 }, simulator, judge, responseLog: log.store, verdictStore: verdicts.store
  });
  const graded = log.rows.filter((r) => r.signalType === "graded");
  assert.equal(graded.length, 1);
  // Deterministic transform only: the canned judge said partial → graded_score 0.5.
  assert.equal(graded[0].judgedOutcome, "partial");
  assert.equal(graded[0].gradedScore, 0.5);
});
