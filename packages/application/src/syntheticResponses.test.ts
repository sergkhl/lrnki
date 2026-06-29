import assert from "node:assert/strict";
import test from "node:test";
import type { CalibrationVerdict, DerivedGraphLayer } from "@lrnki/domain-core";
import type { CalibrationVerdictStorePort } from "@lrnki/ports";
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

test("verdictByDifficulty yields 'known' below the cutoff and 'learn' at or above it", () => {
  assert.equal(verdictByDifficulty(0.2, 0.6), "known");
  assert.equal(verdictByDifficulty(0.5, 0.6), "known");
  assert.equal(verdictByDifficulty(0.6, 0.6), "learn");
  assert.equal(verdictByDifficulty(0.8, 0.6), "learn");
});

test("synthesizeResponses seeds verdicts over the goal cone and performs no self-assessment grading", async () => {
  const verdicts = fakeVerdictStore();
  const result = await synthesizeResponses({
    learnerStateRef: "L1", layer, targetDerivedNodeId: "nD",
    profile: { difficultyCutoff: 0.6 }, verdictStore: verdicts.store
  });

  // Calibration: nD's certain cone = {nA(0.2), nB(0.5), nC(0.8)}. Cutoff 0.6 → nA,nB known; nC learn.
  assert.equal(result.knownCount, 2);
  assert.equal(result.learnCount, 1);
  const seeded = await verdicts.store.listForLearner("L1");
  assert.equal(seeded.length, 3, "one verdict per cone node, in the mutable store (no log rows)");
  assert.deepEqual(new Map(seeded.map((v) => [v.derivedNodeId, v.verdict])).get("nC"), "learn");

});
