import assert from "node:assert/strict";
import { test } from "node:test";
import type { DerivedGraphDetail, DerivedGraphEdge, DerivedGraphNode } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { projectExpeditionSections, type SectionedExpedition } from "./expeditionSections";
import { SECTION_LINEUP_MAX } from "./recallLineupBudget";

function node(id: string, difficulty: number, hasStudyItem = true): DerivedGraphNode {
  return {
    derivedNodeId: id,
    label: id.toUpperCase(),
    aliases: [],
    declaredDomain: "test",
    difficulty,
    difficultyRationale: null,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "anchor",
    hasStudyItem,
    grounding: null
  };
}

function edge(prereq: string, dependent: string, overrides: Partial<DerivedGraphEdge> = {}): DerivedGraphEdge {
  return { prerequisiteDerivedNodeId: prereq, dependentDerivedNodeId: dependent, confidence: 0.9, uncertain: false, judgeModel: "test", ...overrides };
}

function detail(nodes: DerivedGraphNode[], edges: DerivedGraphEdge[]): Pick<DerivedGraphDetail, "nodes" | "edges"> {
  return { nodes, edges };
}

const allFrontier = (ids: string[]): Record<string, AdaptedNodeState> => Object.fromEntries(ids.map((id) => [id, "frontier" as AdaptedNodeState]));

// The boundary-partition invariants (plan 2026-07-31-003). Both edits may only insert or delete
// a boundary, so these hold on every layer regardless of which edits fired. Asserted on every
// split/merge scenario below, because the properties the rejected anchor-promotion design broke
// (the concatenated order and the summit) are exactly the ones a plausible-looking output hides.
function assertPartitionInvariants(result: SectionedExpedition, expectedOrder: string[]): void {
  const concatenated = result.sections.flatMap((section) => section.stepDerivedNodeIds);
  assert.deepEqual(concatenated, expectedOrder, "the concatenated trail order is a fixed input to the edits");
  assert.deepEqual(result.steps.map((step) => step.derivedNodeId), expectedOrder, "steps ride the same order");
  assert.deepEqual(result.steps.map((step) => step.position), expectedOrder.map((_, index) => index));
  if (expectedOrder.length > 0) {
    assert.equal(result.summit?.derivedNodeId, expectedOrder[expectedOrder.length - 1], "the summit is the last stop");
    assert.equal(result.sections[result.sections.length - 1].milestoneDerivedNodeId, result.summit?.derivedNodeId, "and it is the last section's milestone");
  }
  assert.deepEqual(result.sections.map((section) => section.sectionIndex), result.sections.map((_, index) => index), "sectionIndex is contiguous from 0");
  for (const section of result.sections) {
    assert.equal(section.stepDerivedNodeIds[section.stepDerivedNodeIds.length - 1], section.milestoneDerivedNodeId, "a section ends on its own milestone");
    const own = result.steps.filter((step) => step.sectionIndex === section.sectionIndex);
    assert.deepEqual(own.map((step) => step.derivedNodeId), section.stepDerivedNodeIds);
    assert.deepEqual(own.map((step) => step.sectionPositionIndex), section.stepDerivedNodeIds.map((_, index) => index), "sectionPositionIndex is contiguous from 0");
    assert.equal(own.filter((step) => step.isMilestone).length, 1, "exactly one milestone step per section");
  }
  const itemless = result.sections.filter((section) => !section.hasStudyItems);
  assert.ok(itemless.length === 0 || (itemless.length === 1 && result.sections.length === 1), "an item-less section survives only when the whole layer has no items");
}

test("every non-floored node appears in exactly one section", () => {
  const nodes = [node("a", 2), node("b", 3), node("c", 4), node("d", 5)];
  const edges = [edge("a", "b"), edge("b", "d"), edge("c", "d")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b", "c", "d"]) });

  const seen = result.steps.map((step) => step.derivedNodeId).sort();
  assert.deepEqual(seen, ["a", "b", "c", "d"], "all four nodes are placed exactly once");
  assert.equal(new Set(seen).size, 4, "no node is duplicated across sections");
});

test("a prerequisite shared by two milestones lands only in the earlier section", () => {
  // shared `s` is a prerequisite of both terminals `m1` (easy cone) and `m2` (hard cone).
  const nodes = [node("s", 2), node("m1", 3), node("m2", 9)];
  const edges = [edge("s", "m1"), edge("s", "m2")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["s", "m1", "m2"]) });

  const sectionOf = (id: string) => result.steps.find((step) => step.derivedNodeId === id)?.sectionIndex;
  assert.equal(sectionOf("s"), sectionOf("m1"), "shared prerequisite is claimed by the easier (earlier) section with m1");
  assert.notEqual(sectionOf("s"), sectionOf("m2"), "and does NOT reappear in m2's section");
  assert.equal(result.steps.filter((step) => step.derivedNodeId === "s").length, 1);
});

test("validity invariant: every trusted edge points to an equal-or-later position (multi-sink)", () => {
  const nodes = [node("root", 1), node("mid1", 4), node("mid2", 6), node("sinkA", 5), node("sinkB", 8)];
  const edges = [edge("root", "mid1"), edge("root", "mid2"), edge("mid1", "sinkA"), edge("mid2", "sinkB"), edge("mid1", "sinkB")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["root", "mid1", "mid2", "sinkA", "sinkB"]) });

  const positionOf = new Map(result.steps.map((step) => [step.derivedNodeId, step.position] as const));
  for (const e of edges) {
    assert.ok(
      (positionOf.get(e.prerequisiteDerivedNodeId) ?? -1) < (positionOf.get(e.dependentDerivedNodeId) ?? -1),
      `prerequisite ${e.prerequisiteDerivedNodeId} precedes dependent ${e.dependentDerivedNodeId} in the concatenated path`
    );
  }
});

test("uncertain edges do not constrain sectioning (trusted-only)", () => {
  const nodes = [node("a", 2), node("b", 3)];
  const edges = [edge("a", "b", { uncertain: true })];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b"]) });
  // With the only edge uncertain, both are terminals → two singleton sections.
  assert.equal(result.sections.length, 2);
});

test("an isolated node forms a singleton section", () => {
  const nodes = [node("lonely", 3), node("a", 2), node("b", 4)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["lonely", "a", "b"]) });
  const lonelySection = result.sections.find((section) => section.stepDerivedNodeIds.includes("lonely"));
  assert.ok(lonelySection);
  assert.deepEqual(lonelySection?.stepDerivedNodeIds, ["lonely"], "isolated node is alone in its section");
});

test("a single-terminal layer is one section covering everything, summit = the terminal", () => {
  const nodes = [node("a", 2), node("b", 3), node("c", 4)];
  const edges = [edge("a", "b"), edge("b", "c")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b", "c"]) });
  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ["a", "b", "c"]);
  assert.deepEqual(result.summit, { derivedNodeId: "c", label: "C" });
});

test("section order: lower mean difficulty first, deterministic under ties", () => {
  // Two disjoint chains: easy chain (2,3) and hard chain (7,8).
  const nodes = [node("e1", 2), node("e2", 3), node("h1", 7), node("h2", 8)];
  const edges = [edge("e1", "e2"), edge("h1", "h2")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["e1", "e2", "h1", "h2"]) });
  assert.equal(result.sections[0].milestoneDerivedNodeId, "e2", "easier section first");
  assert.equal(result.sections[1].milestoneDerivedNodeId, "h2", "harder section second");
  // Summit is the last (hardest) section's milestone.
  assert.equal(result.summit?.derivedNodeId, "h2");
});

test("easiest-first within a section respects prerequisites", () => {
  // b(1) depends on a(9): even though b is easier, a must come first.
  const nodes = [node("a", 9), node("b", 1)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b"]) });
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ["a", "b"], "prerequisite a precedes easier dependent b");
});

test("state rides through per node; summit flagged", () => {
  const nodes = [node("a", 2), node("b", 3)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({
    detail: detail(nodes, edges),
    stateByNode: { a: "mastered", b: "frontier" }
  });
  const stepA = result.steps.find((step) => step.derivedNodeId === "a");
  const stepB = result.steps.find((step) => step.derivedNodeId === "b");
  assert.equal(stepA?.state, "mastered");
  assert.equal(stepB?.state, "frontier");
  assert.equal(stepB?.isSummit, true);
  assert.equal(stepA?.isSummit, false);
});

test("an empty floored layer yields no sections and a null summit", () => {
  const result = projectExpeditionSections({ detail: detail([], []), stateByNode: {} });
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.sections, []);
  assert.equal(result.summit, null);
});

// --- Boundary edit 1: the split (plan 2026-07-31-003 U1, KTD2-KTD5) ----------

// A 7-stop chain c1 -> ... -> c7. Its only sub-terminal milestone is c6: every other stop's
// within-section dependent is the next stop, not the section's own milestone.
const chain = (itemless: string[] = []): { nodes: DerivedGraphNode[]; edges: DerivedGraphEdge[]; ids: string[] } => {
  const ids = [1, 2, 3, 4, 5, 6, 7].map((n) => `c${n}`);
  return {
    ids,
    nodes: ids.map((id, index) => node(id, index + 1, !itemless.includes(id))),
    edges: ids.slice(1).map((id, index) => edge(ids[index], id))
  };
};

test("a section stays whole while its ITEMFUL count is within the Guardian ward budget", () => {
  // Seven concepts but only five carry a Study Item — and only an itemful concept can ever be
  // tested, so the Guardian still provably covers this Leg. The trigger counts items, not stops.
  const { nodes, edges, ids } = chain(["c2", "c4"]);
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(ids) });
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].milestoneDerivedNodeId, "c7");
  assert.equal(result.sections[0].hasStudyItems, true);
  assertPartitionInvariants(result, ids);
});

test("an over-cap section is cut after its sub-terminal milestone; a chunk still over cap stays whole (KTD5)", () => {
  const { nodes, edges, ids } = chain();
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => section.stepDerivedNodeIds), [["c1", "c2", "c3", "c4", "c5", "c6"], ["c7"]]);
  assert.deepEqual(result.sections.map((section) => section.milestoneDerivedNodeId), ["c6", "c7"]);
  // One pass only: the leading chunk still exceeds the budget and is left alone rather than cut
  // at a stop that is not a recognizable outcome. It is a reported residual, not a failure.
  assert.ok(result.sections[0].stepDerivedNodeIds.length > SECTION_LINEUP_MAX);
  assertPartitionInvariants(result, ids);
});

test("several sub-terminal milestones cut an over-cap section into milestone-shaped chunks", () => {
  // base -> mid1 -> sub1 -> m and base -> mid2 -> sub2 -> m. Only sub1 and sub2 feed the
  // milestone directly and nothing else, so only they end a Leg.
  const nodes = [node("base", 1), node("mid1", 2), node("sub1", 3), node("mid2", 4), node("sub2", 5), node("m", 6)];
  const edges = [edge("base", "mid1"), edge("base", "mid2"), edge("mid1", "sub1"), edge("sub1", "m"), edge("mid2", "sub2"), edge("sub2", "m")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(nodes.map((n) => n.derivedNodeId)) });
  assert.deepEqual(result.sections.map((section) => section.stepDerivedNodeIds), [["base", "mid1", "sub1"], ["mid2", "sub2"], ["m"]]);
  assert.deepEqual(result.sections.map((section) => section.milestoneDerivedNodeId), ["sub1", "sub2", "m"]);
  assertPartitionInvariants(result, ["base", "mid1", "sub1", "mid2", "sub2", "m"]);
});

test("a split only ADDS milestones: every pre-split anchor is still an anchor (KTD12)", () => {
  // An over-cap chain plus a harder isolated terminal. Pre-split anchors are c7 and `z`.
  const { nodes, edges, ids } = chain();
  const result = projectExpeditionSections({
    detail: detail([...nodes, node("z", 9)], edges),
    stateByNode: allFrontier([...ids, "z"])
  });
  const anchors = new Set(result.sections.map((section) => section.milestoneDerivedNodeId));
  assert.ok(anchors.has("c7") && anchors.has("z"), "no pre-existing milestone lost its anchor, so no durable victory can be orphaned");
  assert.equal(result.summit?.derivedNodeId, "z", "and the summit did not move");
  assertPartitionInvariants(result, [...ids, "z"]);
});

// --- Boundary edit 2: the merge (plan 2026-07-31-003 U2, KTD6/KTD8/KTD10) ----

// Three isolated singleton milestones, ordered x -> y -> z by difficulty.
const singletons = (itemless: string[]): { nodes: DerivedGraphNode[]; ids: string[] } => {
  const ids = ["x", "y", "z"];
  return { ids, nodes: ids.map((id, index) => node(id, index + 1, !itemless.includes(id))) };
};

test("an all-itemful layer is untouched by the merge", () => {
  const { nodes, ids } = singletons([]);
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => section.stepDerivedNodeIds), [["x"], ["y"], ["z"]]);
  assert.deepEqual(result.sections.map((section) => section.hasStudyItems), [true, true, true]);
  assertPartitionInvariants(result, ids);
});

test("a leading item-less Leg is absorbed forward and the later milestone wins", () => {
  const { nodes, ids } = singletons(["x"]);
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]), [["y", ["x", "y"]], ["z", ["z"]]]);
  assertPartitionInvariants(result, ids);
});

test("a middle item-less Leg is absorbed by the Leg that follows it", () => {
  const { nodes, ids } = singletons(["y"]);
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]), [["x", ["x"]], ["z", ["y", "z"]]]);
  assertPartitionInvariants(result, ids);
});

test("a trailing item-less run folds back but still carries the summit milestone", () => {
  const { nodes, ids } = singletons(["z"]);
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]), [["x", ["x"]], ["z", ["y", "z"]]]);
  assert.equal(result.summit?.derivedNodeId, "z", "the summit is permanent — a fold-back adopts it rather than dropping it");
  assertPartitionInvariants(result, ids);
});

test("alternating item-less Legs each merge into the next winnable one", () => {
  const ids = ["w", "x", "y", "z"];
  const nodes = [node("w", 1, false), node("x", 2), node("y", 3, false), node("z", 4)];
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(result.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]), [["x", ["w", "x"]], ["z", ["y", "z"]]]);
  assertPartitionInvariants(result, ids);
});

test("a layer with no Study Items at all is one honest section, not a locked chain of them", () => {
  const { nodes, ids } = singletons(["x", "y", "z"]);
  const result = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ids);
  assert.equal(result.sections[0].milestoneDerivedNodeId, "z");
  // The one case no boundary edit can repair. It is published as unwinnable so the summit gate
  // can name it honestly instead of waiting forever on a Leg that can never be won.
  assert.equal(result.sections[0].hasStudyItems, false);
  assertPartitionInvariants(result, ids);
});

test("an item-less split chunk folds straight back, returning the identical Leg (the KTD5 no-op)", () => {
  // Six itemful stops feeding an item-less crest: over cap, so the split cuts after p6 — and the
  // merge immediately absorbs the item-less tail chunk, restoring the original single Leg.
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "crest"];
  const nodes = ids.map((id, index) => node(id, index + 1, id !== "crest"));
  const edges = ids.slice(1).map((id, index) => edge(ids[index], id));
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(ids) });
  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ids);
  assert.equal(result.sections[0].milestoneDerivedNodeId, "crest");
  assertPartitionInvariants(result, ids);
});

test("both edits are deterministic and learner-independent", () => {
  const { nodes, ids } = singletons(["y"]);
  const mastered = projectExpeditionSections({
    detail: detail(nodes, []),
    stateByNode: { x: "mastered", y: "mastered", z: "frontier" }
  });
  const untouched = projectExpeditionSections({ detail: detail(nodes, []), stateByNode: allFrontier(ids) });
  assert.deepEqual(
    mastered.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]),
    untouched.sections.map((section) => [section.milestoneDerivedNodeId, section.stepDerivedNodeIds]),
    "Leg boundaries never move under a learner's progress — that stability is what makes a permanent reward permanent"
  );
});
