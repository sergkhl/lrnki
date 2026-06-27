import assert from "node:assert/strict";
import test from "node:test";
import type { GroundingPassageView } from "@lrnki/ports";
import type { ReadinessEdge } from "./adaptivePathProjection";
import { neutralDescriptor, projectCalibrationList, type CalibrationListNode } from "./calibrationList";

function edge(prerequisite: string, dependent: string, uncertain = false): ReadinessEdge {
  return { prerequisiteDerivedNodeId: prerequisite, dependentDerivedNodeId: dependent, uncertain };
}

function node(derivedNodeId: string, difficulty: number | null, passages: GroundingPassageView[] = []): CalibrationListNode {
  return { derivedNodeId, label: `Concept ${derivedNodeId}`, difficulty, grounding: { passages } };
}

const chain = [edge("A", "B"), edge("B", "Z")];

test("projectCalibrationList keeps a direct known mark visible and hides its implied-known ancestors", () => {
  const projected = projectCalibrationList({
    targetDerivedNodeId: "Z",
    edges: chain,
    nodes: [node("A", 0.1), node("B", 0.4), node("Z", 0.9)],
    knownVerdictNodeIds: ["B"]
  });

  assert.deepEqual(projected.rows.map((row) => row.derivedNodeId), ["Z", "B"]);
  assert.equal(projected.rows.find((row) => row.derivedNodeId === "B")?.known, true);
  assert.deepEqual([...projected.knownClosure].sort(), ["A", "B"]);
});

test("projectCalibrationList sorts hardest-first with deterministic id tie-break and missing difficulty last", () => {
  const projected = projectCalibrationList({
    targetDerivedNodeId: "Z",
    edges: [edge("A", "Z"), edge("B", "Z"), edge("C", "Z"), edge("D", "Z")],
    nodes: [node("A", 0.5), node("B", 0.8), node("C", 0.8), node("D", null), node("Z", 0.9)],
    knownVerdictNodeIds: []
  });

  assert.deepEqual(projected.rows.map((row) => row.derivedNodeId), ["Z", "B", "C", "A", "D"]);
});

test("projectCalibrationList with zero verdicts returns the full cone and no known rows", () => {
  const projected = projectCalibrationList({
    targetDerivedNodeId: "Z",
    edges: chain,
    nodes: [node("A", 0.1), node("B", 0.4), node("Z", 0.9)],
    knownVerdictNodeIds: []
  });

  assert.deepEqual(projected.rows.map((row) => row.derivedNodeId), ["Z", "B", "A"]);
  assert.equal(projected.rows.some((row) => row.known), false);
  assert.deepEqual([...projected.knownClosure], []);
});

test("projectCalibrationList for a foundational root returns only the target", () => {
  const projected = projectCalibrationList({
    targetDerivedNodeId: "A",
    edges: chain,
    nodes: [node("A", 0.1), node("B", 0.4), node("Z", 0.9)],
    knownVerdictNodeIds: []
  });

  assert.deepEqual(projected.rows.map((row) => row.derivedNodeId), ["A"]);
});

test("projectCalibrationList excludes uncertain edges from the cone and closure", () => {
  const projected = projectCalibrationList({
    targetDerivedNodeId: "Z",
    edges: [edge("A", "B", true), edge("B", "Z")],
    nodes: [node("A", 0.1), node("B", 0.4), node("Z", 0.9)],
    knownVerdictNodeIds: ["B"]
  });

  assert.deepEqual(projected.rows.map((row) => row.derivedNodeId), ["Z", "B"]);
  assert.deepEqual([...projected.knownClosure].sort(), ["B"]);
});

test("neutralDescriptor chooses a verbatim definition and trims to the first sentence", () => {
  const descriptor = neutralDescriptor([
    { passageType: "mention", text: "Mention fallback.", groundingOrigin: "source_mentioned" },
    { passageType: "definition", text: "A precise definition. Extra sentence that should not appear.", groundingOrigin: "document_anchored" }
  ]);

  assert.deepEqual(descriptor, { text: "A precise definition.", provenance: "verbatim" });
});

test("neutralDescriptor labels llm-grounded passages generated and returns null without passages", () => {
  assert.deepEqual(neutralDescriptor([{ passageType: "mention", text: "Generated context.", groundingOrigin: "llm_grounded" }]), {
    text: "Generated context.",
    provenance: "generated"
  });
  assert.equal(neutralDescriptor([]), null);
});

test("neutralDescriptor trims long text to the character bound without splitting past the bound", () => {
  const text = "alpha beta gamma delta epsilon zeta";
  const descriptor = neutralDescriptor([{ passageType: "definition", text, groundingOrigin: "document_anchored" }], { maxChars: 17 });
  assert.deepEqual(descriptor, { text: "alpha beta gamma", provenance: "verbatim" });
  assert.ok(descriptor!.text.length <= 17);
});
