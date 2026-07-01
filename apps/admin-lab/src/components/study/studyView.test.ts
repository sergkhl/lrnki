import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { allSegmentsAnswered, displayStatefulPathSteps, focusedMapHiddenNodeIds, groupStepsByTier, isPathComplete, nextStudyTarget, shouldAcceptSheetOpenChange, type StatefulLearnerPathStep } from "./studyView";

const here = dirname(fileURLToPath(import.meta.url));

// Pure presentation helpers only — component rendering is verified by the U8 real-use run
// (no jsdom in this project's test convention).

test("nextStudyTarget returns the freshly-advanced frontier target when present (Covers R4)", () => {
  assert.equal(nextStudyTarget({ selectedFrontierTarget: "node-2" }), "node-2");
});

test("nextStudyTarget returns null when the goal is reached (no frontier target)", () => {
  assert.equal(nextStudyTarget({ selectedFrontierTarget: null }), null);
});

test("sheet close is ignored while answer-triggered retargeting is guarded", () => {
  assert.equal(shouldAcceptSheetOpenChange(false, true), false);
});

test("sheet close is accepted after answer-triggered retargeting guard clears", () => {
  assert.equal(shouldAcceptSheetOpenChange(false, false), true);
});

test("sheet open is always accepted, including during answer-triggered retargeting", () => {
  assert.equal(shouldAcceptSheetOpenChange(true, true), true);
});

const segment = (studyItemId: string) => ({ item: { studyItemId } });
const step = (derivedNodeId: string, topologicalDepth: number, position: number, isTarget = false): StatefulLearnerPathStep => ({
  derivedNodeId,
  topologicalDepth,
  position,
  difficulty: position / 10,
  state: position === 0 ? "frontier" : "locked",
  isTarget
});

test("allSegmentsAnswered holds the node until every stacked segment is answered, then advances (KTD7)", () => {
  const segments = [segment("os-1"), segment("imp-1")];
  assert.equal(allSegmentsAnswered(segments, new Set()), false);
  // Answering only option-select does NOT advance — the impostor is still pending.
  assert.equal(allSegmentsAnswered(segments, new Set(["os-1"])), false);
  assert.equal(allSegmentsAnswered(segments, new Set(["os-1", "imp-1"])), true);
});

test("allSegmentsAnswered: a single-segment node advances after its one answer; an empty node never completes", () => {
  assert.equal(allSegmentsAnswered([segment("os-1")], new Set(["os-1"])), true);
  // A cardless node has no segments and is advanced via skip-as-known, never this gate.
  assert.equal(allSegmentsAnswered([], new Set(["anything"])), false);
});

test("groupStepsByTier groups ordered path steps into depth tiers", () => {
  const tiers = groupStepsByTier([step("ownership", 1, 2), step("borrow", 0, 1), step("scope", 0, 0), step("move", 2, 3, true)]);
  assert.deepEqual(tiers.map((tier) => tier.topologicalDepth), [0, 1, 2]);
  assert.deepEqual(tiers[0].steps.map((s) => s.derivedNodeId), ["scope", "borrow"]);
});

test("displayStatefulPathSteps collapses adapted-hidden prerequisites without changing state or target visibility", () => {
  const displayed = displayStatefulPathSteps([step("scope", 0, 0), step("move", 1, 1, true)], new Set(["scope", "move"]));
  assert.equal(displayed[0].collapsed, true);
  assert.equal(displayed[0].state, "frontier");
  assert.equal(displayed[1].collapsed, false);
});

test("isPathComplete requires no selected frontier and excludes foundational roots", () => {
  assert.equal(isPathComplete({ selectedFrontierTarget: null }, false), true);
  assert.equal(isPathComplete({ selectedFrontierTarget: "scope" }, false), false);
  assert.equal(isPathComplete({ selectedFrontierTarget: null }, true), false);
});

test("focusedMapHiddenNodeIds hides out-of-scope nodes, unions adapted hidden nodes, and preserves the target", () => {
  const detail = {
    nodes: [
      { derivedNodeId: "scope" },
      { derivedNodeId: "ownership" },
      { derivedNodeId: "move" },
      { derivedNodeId: "outside" }
    ]
  };
  const hidden = focusedMapHiddenNodeIds(detail, [step("scope", 0, 0), step("ownership", 1, 1), step("move", 2, 2, true)], new Set(["scope", "move"]));
  assert.deepEqual([...hidden].sort(), ["outside", "scope"]);
});

// Covers R15: the transfer-ready modules import no Admin-Lab loader and no server action,
// so a later Learner app consumes them unchanged. A structural guard on the import surface.
test("study modules import no @/lib loader and no server action (Covers R15)", () => {
  for (const file of ["OptionSelectCard.tsx", "ImpostorCard.tsx", "StudySideSheet.tsx", "studyView.ts"]) {
    const source = readFileSync(join(here, file), "utf8");
    assert.equal(source.includes("@/lib/"), false, `${file} must not import an Admin-Lab loader`);
    assert.equal(source.includes("/study/actions"), false, `${file} must not import a study server action`);
    assert.equal(source.includes("\"use server\""), false, `${file} must not be a server-action module`);
  }
});

test("study side sheet no longer imports the reveal-card calibration branch", () => {
  const source = readFileSync(join(here, "StudySideSheet.tsx"), "utf8");
  assert.equal(source.includes("RecallCard"), false);
  assert.equal(source.includes("I knew it"), false);
  assert.equal(source.includes("I forgot"), false);
  assert.equal(source.includes("Reveal answer"), false);
});
