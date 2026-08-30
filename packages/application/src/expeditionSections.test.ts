import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphEdge, DerivedGraphNode } from "@lrnki/ports";
import { deriveFlooredExpedition, projectExpeditionSections } from "./expeditionSections";

function node(
  derivedNodeId: string,
  difficulty: number,
  options: { item?: boolean; band?: number } = {}
): DerivedGraphNode {
  return {
    derivedNodeId,
    label: derivedNodeId.toUpperCase(),
    aliases: [],
    declaredDomain: "test",
    difficulty,
    difficultyRationale: null,
    difficultyBand: options.band ?? 3,
    difficultyContested: false,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "anchor",
    hasStudyItem: options.item ?? true,
    grounding: null
  };
}

function edge(
  prerequisiteDerivedNodeId: string,
  dependentDerivedNodeId: string,
  uncertain = false
): DerivedGraphEdge {
  return {
    prerequisiteDerivedNodeId,
    dependentDerivedNodeId,
    confidence: 0.9,
    uncertain,
    judgeModel: "test"
  };
}

test("the projection adapter exposes the one route plan as stable Section shapes", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const result = projectExpeditionSections({
    detail: {
      nodes: ids.map((id, index) => node(id, index + 1, { item: id !== "b" })),
      edges: [edge("a", "d"), edge("b", "d"), edge("d", "g")]
    },
    stateByNode: { a: "mastered", d: "frontier" }
  });

  assert.deepEqual(result.sections.map((section) => section.stepDerivedNodeIds.length), [3, 4]);
  assert.deepEqual(result.sections.flatMap((section) => section.stepDerivedNodeIds),
    result.steps.map((step) => step.derivedNodeId));
  assert.equal(new Set(result.steps.map((step) => step.derivedNodeId)).size, ids.length);
  assert.equal(result.steps.find((step) => step.derivedNodeId === "a")?.state, "mastered");
  assert.equal(result.steps.find((step) => step.derivedNodeId === "d")?.state, "frontier");
  assert.ok(result.steps.filter((step) => step.isMilestone).every((step) =>
    step.sectionPositionIndex === result.sections[step.sectionIndex].stepDerivedNodeIds.length - 1
  ));
  assert.equal(result.summit?.derivedNodeId, result.steps.at(-1)?.derivedNodeId);
  assert.equal(result.steps.at(-1)?.isSummit, true);
  assert.ok(result.sections.every((section) => section.hasStudyItems));

  const positions = new Map(result.steps.map((step) => [step.derivedNodeId, step.position] as const));
  for (const trusted of [edge("a", "d"), edge("b", "d"), edge("d", "g")]) {
    assert.ok(
      requiredPosition(positions, trusted.prerequisiteDerivedNodeId) <
        requiredPosition(positions, trusted.dependentDerivedNodeId)
    );
  }
});

test("uncertain edges do not constrain the shared route", () => {
  const result = projectExpeditionSections({
    detail: {
      nodes: [node("a", 9), node("b", 1), node("c", 2)],
      edges: [edge("a", "b", true)]
    },
    stateByNode: {}
  });

  assert.deepEqual(result.steps.map((step) => step.derivedNodeId), ["b", "c", "a"]);
});

test("an empty layer remains an honest empty projection", () => {
  const result = projectExpeditionSections({ detail: { nodes: [], edges: [] }, stateByNode: {} });
  assert.deepEqual(result, { steps: [], sections: [], summit: null });
});

test("difficulty-floor contraction feeds the same route module", () => {
  const result = deriveFlooredExpedition({
    nodes: [
      node("included-a", 1, { band: 3 }),
      node("floored", 2, { band: 1 }),
      node("included-b", 3, { band: 3 })
    ],
    edges: [edge("included-a", "floored"), edge("floored", "included-b")]
  });

  assert.deepEqual([...result.trailNodeIds].sort(), ["included-a", "included-b"]);
  assert.deepEqual(result.sections.flatMap((section) => section.stepDerivedNodeIds), [
    "included-a",
    "included-b"
  ]);
  assert.equal(result.summit?.derivedNodeId, "included-b");
});

function requiredPosition(positions: ReadonlyMap<string, number>, id: string): number {
  const position = positions.get(id);
  if (position === undefined) throw new Error(`Missing position for ${id}.`);
  return position;
}
