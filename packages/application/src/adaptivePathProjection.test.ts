import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptDifficulty, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { projectAdaptivePath, selectFrontierTarget } from "./adaptivePathProjection";
import { emptyLearnerState, projectLearnerPath } from "./learnerPathProjection";

// DAG: A -> B -> D, C -> D. Difficulty A<B<C<D.
const edges: InferredPrerequisiteEdge[] = [
  { prerequisiteConceptId: "nA", dependentConceptId: "nB", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } },
  { prerequisiteConceptId: "nB", dependentConceptId: "nD", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } },
  { prerequisiteConceptId: "nC", dependentConceptId: "nD", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } }
];
const difficulties: ConceptDifficulty[] = [
  { conceptId: "nA", score: 0.2, method: "m", components: {} },
  { conceptId: "nB", score: 0.5, method: "m", components: {} },
  { conceptId: "nC", score: 0.8, method: "m", components: {} },
  { conceptId: "nD", score: 0.9, method: "m", components: {} }
];

function learnerState(mastery: Record<string, number>): LearnerStatePort {
  return { learnerStateRef: "L1", mastery: (id) => mastery[id] ?? 0 };
}

test("frontier advances from the goal to the hardest ready unmastered node when a prerequisite is unmastered", () => {
  // A and C mastered, B unmastered → only B is ready (its prereq A is mastered); D
  // is not ready (prereq B unmastered). Target advances D -> B.
  const state = learnerState({ nA: 0.7, nB: 0, nC: 0.8, nD: 0 });
  const frontier = selectFrontierTarget({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(frontier, "nB");
});

test("high self-report across the calibration set with no graded rows prunes them and targets the hardest ready unmastered node (Covers AE2, R13)", () => {
  // A, B, C all mastered at 0.7; D unmastered. D becomes ready and the frontier.
  const state = learnerState({ nA: 0.7, nB: 0.7, nC: 0.7, nD: 0 });
  const { targetNodeId, steps } = projectAdaptivePath({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(targetNodeId, "nD");
  const ids = steps.map((s) => s.conceptId);
  assert.deepEqual(ids, ["nD"], "mastered prerequisites are pruned; only the frontier remains");
});

test("a concept at 0.7 is pruned; one at 0.5 (partial) is retained", () => {
  // A mastered (0.7), B partial (0.5), C mastered (0.8). B is ready+unmastered →
  // frontier B; A is pruned from the path.
  const state = learnerState({ nA: 0.7, nB: 0.5, nC: 0.8, nD: 0 });
  const { targetNodeId, steps } = projectAdaptivePath({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(targetNodeId, "nB", "0.5 is below threshold so B stays a target");
  assert.equal(steps.some((s) => s.conceptId === "nA"), false, "0.7 is at threshold so A is pruned");
});

test("the adaptive path differs from the mock:empty path for the same target+enrichment", () => {
  const adaptive = projectAdaptivePath({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.7, nB: 0.7, nC: 0.7, nD: 0 }) });
  const mock = projectLearnerPath({ targetConceptId: "nD", prerequisiteEdges: edges, difficulties, learnerState: emptyLearnerState });
  assert.equal(mock.length, 4, "mock prunes nothing (knows nothing, threshold 1)");
  assert.notDeepEqual(adaptive.steps.map((s) => s.conceptId), mock.map((s) => s.conceptId));
});

test("when nothing in scope is both ready and unmastered, the frontier falls back to the goal target", () => {
  const state = learnerState({ nA: 1, nB: 1, nC: 1, nD: 1 }); // everything mastered
  const frontier = selectFrontierTarget({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(frontier, "nD");
});
