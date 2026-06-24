import assert from "node:assert/strict";
import test from "node:test";
import type { ResponseLogRow } from "@lrnki/domain-core";
import type { ReadinessEdge } from "./adaptivePathProjection";
import { pruneClosure, composeMastery, struggledNodes, suggestRestorations } from "./calibrationClosure";

// Fixture DAG (R11): A -> B -> D, C -> D, E -> D. Prerequisite edges point
// prerequisite -> dependent; ancestors of D = {A, B, C, E}.
function edge(prerequisite: string, dependent: string, uncertain = false): ReadinessEdge {
  return { prerequisiteDerivedNodeId: prerequisite, dependentDerivedNodeId: dependent, uncertain };
}
const dag: ReadinessEdge[] = [edge("A", "B"), edge("B", "D"), edge("C", "D"), edge("E", "D")];

let seq = 0;
function graded(derivedNodeId: string, outcome: "correct" | "partial" | "incorrect"): ResponseLogRow {
  return { responseId: `r${++seq}`, learnerStateRef: "L1", studyItemId: `s-${derivedNodeId}`, derivedNodeId, signalType: "graded", judgedOutcome: outcome, gradedScore: outcome === "correct" ? 1 : outcome === "partial" ? 0.5 : 0, responseSource: "synthetic", graderIdentity: "auto", batchId: null, attemptSeq: seq, submittedAnswer: null, createdAt: new Date().toISOString() };
}

// --- pruneClosure (R8, R11) -------------------------------------------------

test("pruneClosure over the fixture DAG: known={D} prunes D and all its trusted ancestors (Covers R11)", () => {
  const closure = pruneClosure(["D"], dag);
  assert.deepEqual([...closure].sort(), ["A", "B", "C", "D", "E"]);
});

test("pruneClosure: known={B} prunes only B and A; ordering-independent and idempotent", () => {
  assert.deepEqual([...pruneClosure(["B"], dag)].sort(), ["A", "B"]);
  // Order of the known set does not matter; running twice yields the same set.
  assert.deepEqual([...pruneClosure(["B", "B"], dag)].sort(), ["A", "B"]);
  assert.deepEqual([...pruneClosure(["A"], dag)].sort(), ["A"], "a source node prunes only itself");
});

test("pruneClosure excludes an ancestor reachable only through an UNCERTAIN edge (Covers R8)", () => {
  // U -> B is uncertain; B's certain ancestor is A. Calibrating D must not credit U.
  const withUncertain: ReadinessEdge[] = [...dag, edge("U", "B", true)];
  const closure = pruneClosure(["D"], withUncertain);
  assert.equal(closure.has("U"), false, "the uncertain-edge ancestor is excluded");
  assert.deepEqual([...closure].sort(), ["A", "B", "C", "D", "E"]);
});

test("pruneClosure terminates on an uncertain-edge cycle and never credits the goal through it", () => {
  // Certain: var -> ptr. Uncertain cycle own ->(u) var, ptr ->(u) stk, stk ->(u) own, plus own ->(u) goal.
  const cyclic: ReadinessEdge[] = [
    edge("var", "ptr"),
    edge("own", "var", true), edge("ptr", "stk", true), edge("stk", "own", true),
    edge("own", "goal", true)
  ];
  const closure = pruneClosure(["ptr"], cyclic);
  assert.deepEqual([...closure].sort(), ["ptr", "var"], "only the certain-edge ancestor var is pruned");
  assert.equal(closure.has("goal"), false, "the goal is never credited through uncertain edges");
});

// --- composeMastery (R12, AE3) ----------------------------------------------

test("composeMastery: a known-closure node is mastered even with a coexisting graded incorrect, AND the coexistence is flagged (Covers R12)", () => {
  const knownClosure = pruneClosure(["D"], dag); // {A,B,C,D,E}
  const gradedByNode = new Map([["D", 0], ["X", 0.5]]); // D graded incorrect; X un-pruned graded partial
  const composed = composeMastery({ knownClosure, gradedByNode });

  assert.equal(composed.masteryByNode["D"], 1.0, "calibration masters D despite the graded incorrect");
  assert.equal(composed.masteryByNode["X"], 0.5, "an un-pruned node keeps its graded mastery");
  assert.equal(composed.masteryByNode["A"], 1.0, "a transitively-pruned node is mastered via calibration");
  // Coexistence surfaced, not silently resolved.
  assert.deepEqual(composed.calibrationGradedCoexistence, [{ derivedNodeId: "D", gradedMastery: 0 }]);
});

test("composeMastery: with no calibration, nodes take their graded mastery and nothing coexists", () => {
  const composed = composeMastery({ knownClosure: new Set(), gradedByNode: new Map([["A", 1], ["B", 0]]) });
  assert.deepEqual(composed.masteryByNode, { A: 1, B: 0 });
  assert.deepEqual(composed.calibrationGradedCoexistence, []);
});

// --- struggledNodes (R13) ---------------------------------------------------

test("struggledNodes: the latest graded per node wins — a later correct clears an earlier incorrect (Covers R13)", () => {
  const struggled = struggledNodes([
    graded("Y", "incorrect"),                 // Y: earlier incorrect
    graded("Z", "incorrect"),                 // Z: incorrect, never cleared
    graded("Y", "correct")                    // ...Y later correct clears the struggle
  ]);
  assert.deepEqual(struggled, ["Z"]);
});

test("struggledNodes: a node whose only graded row is incorrect is struggled; partial/correct are not", () => {
  assert.deepEqual(struggledNodes([graded("Y", "incorrect"), graded("P", "partial"), graded("C", "correct")]), ["Y"]);
});

// --- suggestRestorations (R14) ----------------------------------------------

test("suggestRestorations: a struggled node maps to its PRUNED prerequisite ancestors (Covers R14)", () => {
  const knownClosure = pruneClosure(["A"], dag); // {A} only
  // D struggled; its ancestors are {A,B,C,E}; only A is pruned.
  const suggestions = suggestRestorations({ struggledNodeIds: ["D"], knownClosure, edges: dag });
  assert.deepEqual(suggestions, { D: ["A"] });
});

test("suggestRestorations: a struggled node whose ancestors are all un-pruned maps to an empty list; non-struggled nodes are absent", () => {
  const suggestions = suggestRestorations({ struggledNodeIds: ["D"], knownClosure: new Set(), edges: dag });
  assert.deepEqual(suggestions, { D: [] }, "present but empty — nothing to restore");
  assert.equal("B" in suggestions, false, "a non-struggled node is absent entirely");
});

test("suggestRestorations: pruned ancestors reached only through uncertain edges are not suggested", () => {
  const withUncertain: ReadinessEdge[] = [...dag, edge("U", "B", true)];
  // U is marked known, but it reaches D only through the uncertain U->B edge.
  const knownClosure = new Set(["U", "A"]);
  const suggestions = suggestRestorations({ struggledNodeIds: ["D"], knownClosure, edges: withUncertain });
  assert.deepEqual(suggestions, { D: ["A"] }, "U is not a trusted-edge ancestor of D, so it is not suggested");
});
