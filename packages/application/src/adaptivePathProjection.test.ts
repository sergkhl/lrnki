import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptDifficulty, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { classifyAdaptedNodes, projectAdaptivePath, selectFrontierTarget } from "./adaptivePathProjection";
import { emptyLearnerState, projectLearnerPath } from "./learnerPathProjection";

// DAG: A -> B -> D, C -> D. Difficulty A<B<C<D.
const edges: InferredPrerequisiteEdge[] = [
  { prerequisiteDerivedNodeId: "nA", dependentDerivedNodeId: "nB", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } },
  { prerequisiteDerivedNodeId: "nB", dependentDerivedNodeId: "nD", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } },
  { prerequisiteDerivedNodeId: "nC", dependentDerivedNodeId: "nD", predicate: "inferred-prerequisite-of", confidence: 0.9, uncertain: false, provenance: { judgmentRationale: "x" } }
];
const difficulties: ConceptDifficulty[] = [
  { derivedNodeId: "nA", score: 0.2, method: "m", components: {}, neuralRationale: "" },
  { derivedNodeId: "nB", score: 0.5, method: "m", components: {}, neuralRationale: "" },
  { derivedNodeId: "nC", score: 0.8, method: "m", components: {}, neuralRationale: "" },
  { derivedNodeId: "nD", score: 0.9, method: "m", components: {}, neuralRationale: "" }
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
  const ids = steps.map((s) => s.derivedNodeId);
  assert.deepEqual(ids, ["nD"], "mastered prerequisites are pruned; only the frontier remains");
});

test("a concept at 0.7 is pruned; one at 0.5 (partial) is retained", () => {
  // A mastered (0.7), B partial (0.5), C mastered (0.8). B is ready+unmastered →
  // frontier B; A is pruned from the path.
  const state = learnerState({ nA: 0.7, nB: 0.5, nC: 0.8, nD: 0 });
  const { targetNodeId, steps } = projectAdaptivePath({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(targetNodeId, "nB", "0.5 is below threshold so B stays a target");
  assert.equal(steps.some((s) => s.derivedNodeId === "nA"), false, "0.7 is at threshold so A is pruned");
});

test("the adaptive path differs from the mock:empty path for the same target+enrichment", () => {
  const adaptive = projectAdaptivePath({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.7, nB: 0.7, nC: 0.7, nD: 0 }) });
  const mock = projectLearnerPath({ targetDerivedNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: emptyLearnerState });
  assert.equal(mock.length, 4, "mock prunes nothing (knows nothing, threshold 1)");
  assert.notDeepEqual(adaptive.steps.map((s) => s.derivedNodeId), mock.map((s) => s.derivedNodeId));
});

test("when nothing in scope is both ready and unmastered, the frontier falls back to the goal target", () => {
  const state = learnerState({ nA: 1, nB: 1, nC: 1, nD: 1 }); // everything mastered
  const frontier = selectFrontierTarget({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(frontier, "nD");
});

// --- classifyAdaptedNodes (U1, R2) -----------------------------------------

const allNodeIds = ["nA", "nB", "nC", "nD"];

test("Covers AE1. empty mastery: roots are frontier, deeper nodes locked", () => {
  // No mastery anywhere. nA and nC have no prerequisites → frontier (vacuously ready);
  // nB depends on unmastered nA → locked; nD depends on unmastered nB,nC → locked.
  const result = classifyAdaptedNodes({ nodeIds: allNodeIds, prerequisiteEdges: edges, difficulties, learnerState: learnerState({}) });
  assert.deepEqual(result.stateByNode, { nA: "frontier", nB: "locked", nC: "frontier", nD: "locked" });
  // The hardest ready+unmastered root (nC, difficulty 0.8 > nA 0.2) is the target.
  assert.equal(result.selectedFrontierTarget, "nC");
});

test("Covers AE2. mastered direct prerequisites promote a node to frontier; its dependents stay locked", () => {
  // A and C mastered, B unmastered → B ready (prereq A mastered) → frontier; D still
  // locked (prereq B unmastered). A,C render mastered.
  const result = classifyAdaptedNodes({ nodeIds: allNodeIds, prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.7, nB: 0, nC: 0.8, nD: 0 }) });
  assert.deepEqual(result.stateByNode, { nA: "mastered", nB: "frontier", nC: "mastered", nD: "locked" });
  assert.equal(result.selectedFrontierTarget, "nB");
});

test("threshold boundary: mastery exactly at 0.7 is mastered; just below stays unmastered", () => {
  const atThreshold = classifyAdaptedNodes({ nodeIds: ["nA"], prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.7 }) });
  assert.equal(atThreshold.stateByNode.nA, "mastered");
  const justBelow = classifyAdaptedNodes({ nodeIds: ["nA"], prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.6999 }) });
  assert.equal(justBelow.stateByNode.nA, "frontier");
});

test("uncertain prerequisite edges are excluded by default, so they do not lock a node", () => {
  // Make nA -> nB uncertain. By default it is filtered, so nB has no direct prereq and
  // classifies frontier even though nA is unmastered.
  const withUncertain = edges.map((e) => (e.prerequisiteDerivedNodeId === "nA" && e.dependentDerivedNodeId === "nB" ? { ...e, uncertain: true } : e));
  const excluded = classifyAdaptedNodes({ nodeIds: ["nA", "nB"], prerequisiteEdges: withUncertain, difficulties, learnerState: learnerState({}) });
  assert.equal(excluded.stateByNode.nB, "frontier");
  // With excludeUncertain:false the uncertain edge counts again → nB locked.
  const included = classifyAdaptedNodes({ nodeIds: ["nA", "nB"], prerequisiteEdges: withUncertain, difficulties, learnerState: learnerState({}), excludeUncertain: false });
  assert.equal(included.stateByNode.nB, "locked");
});

test("selectedFrontierTarget matches selectFrontierTarget for the same inputs (shared-helper parity)", () => {
  // nD's ancestor scope is the whole DAG, so the classifier's whole-graph frontier
  // selection must agree with the scoped selector.
  const state = learnerState({ nA: 0.7, nB: 0, nC: 0.8, nD: 0 });
  const classified = classifyAdaptedNodes({ nodeIds: allNodeIds, prerequisiteEdges: edges, difficulties, learnerState: state });
  const selected = selectFrontierTarget({ targetNodeId: "nD", prerequisiteEdges: edges, difficulties, learnerState: state });
  assert.equal(classified.selectedFrontierTarget, selected);
});

test("nothing ready and unmastered yields a null frontier target (empty case)", () => {
  const result = classifyAdaptedNodes({ nodeIds: allNodeIds, prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 1, nB: 1, nC: 1, nD: 1 }) });
  assert.deepEqual(result.stateByNode, { nA: "mastered", nB: "mastered", nC: "mastered", nD: "mastered" });
  assert.equal(result.selectedFrontierTarget, null);
});

test("a node whose prerequisites are all mastered but which is itself mastered classifies mastered, not frontier", () => {
  // nB mastered with nA mastered: stays mastered (mastery wins over readiness).
  const result = classifyAdaptedNodes({ nodeIds: ["nA", "nB"], prerequisiteEdges: edges, difficulties, learnerState: learnerState({ nA: 0.8, nB: 0.9 }) });
  assert.equal(result.stateByNode.nB, "mastered");
});
