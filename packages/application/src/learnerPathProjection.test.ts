import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptDifficulty, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { emptyLearnerState, projectLearnerPath } from "./learnerPathProjection";

function edge(prereq: string, dependent: string, uncertain = false): InferredPrerequisiteEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence: 0.9,
    uncertain,
    provenance: { judgmentRationale: "test" }
  };
}

function difficulty(derivedNodeId: string, score: number): ConceptDifficulty {
  return { derivedNodeId, score, method: "dag-depth-mock", components: {} };
}

// a -> b -> target chain; difficulties ascend with depth.
const chainEdges = [edge("a", "b"), edge("b", "target")];
const chainDifficulties = [difficulty("a", 0), difficulty("b", 0.5), difficulty("target", 1)];

test("projectLearnerPath returns prerequisites first, target last, for a blank learner", () => {
  const steps = projectLearnerPath({
    targetDerivedNodeId: "target",
    prerequisiteEdges: chainEdges,
    difficulties: chainDifficulties,
    learnerState: emptyLearnerState
  });
  assert.deepEqual(
    steps.map((s) => s.derivedNodeId),
    ["a", "b", "target"]
  );
  assert.deepEqual(
    steps.map((s) => s.position),
    [0, 1, 2]
  );
  assert.equal(steps[2].includedReason, "target");
  assert.equal(steps[0].includedReason, "prerequisite");
});

test("projectLearnerPath prunes mastered prerequisites but never the target", () => {
  const knowsA: LearnerStatePort = {
    learnerStateRef: "test:knows-a",
    mastery: (derivedNodeId) => (derivedNodeId === "a" ? 1 : 0)
  };
  const steps = projectLearnerPath({
    targetDerivedNodeId: "target",
    prerequisiteEdges: chainEdges,
    difficulties: chainDifficulties,
    learnerState: knowsA
  });
  assert.deepEqual(
    steps.map((s) => s.derivedNodeId),
    ["b", "target"]
  );
});

test("projectLearnerPath orders parallel prerequisites by ascending difficulty", () => {
  // x and y both feed target; y is easier, so it should come first.
  const steps = projectLearnerPath({
    targetDerivedNodeId: "target",
    prerequisiteEdges: [edge("x", "target"), edge("y", "target")],
    difficulties: [difficulty("x", 0.8), difficulty("y", 0.2), difficulty("target", 1)],
    learnerState: emptyLearnerState
  });
  assert.deepEqual(
    steps.map((s) => s.derivedNodeId),
    ["y", "x", "target"]
  );
});

test("projectLearnerPath excludes uncertain edges from traversal by default", () => {
  // The only link to its prerequisite is uncertain, so the path is just the target.
  const steps = projectLearnerPath({
    targetDerivedNodeId: "target",
    prerequisiteEdges: [edge("shaky", "target", true)],
    difficulties: [difficulty("shaky", 0), difficulty("target", 1)],
    learnerState: emptyLearnerState
  });
  assert.deepEqual(
    steps.map((s) => s.derivedNodeId),
    ["target"]
  );
});
