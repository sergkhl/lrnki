import assert from "node:assert/strict";
import { test } from "@jest/globals";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import {
  MATRIX_PAD,
  SLOT_SIZE,
  buildLegModel,
  composeCrystalFormation,
  fitLegWidth,
  formationMemoryDoorFor,
  isNameableMineral,
  legStructuralState,
  selectVistaFocus,
  vistaRewardSnapshot,
  type FormationConceptInput,
  type FormationEdgeInput,
  type FormationSectionInput
} from "./crystalFormationLayout";

function concept(id: string, over: Partial<FormationConceptInput> = {}): FormationConceptInput {
  return {
    derivedNodeId: id,
    label: id,
    difficulty: 0.3,
    state: "frontier",
    isKnownSkipped: false,
    sectionIndex: 0,
    sectionPositionIndex: 0,
    growthFraction: 0,
    isMilestone: false,
    isSummit: false,
    gist: null,
    ...over
  };
}

test("Vista focus prioritizes explicit intent, then the furthest unseen reward, current Leg, and first Leg", () => {
  const won0 = scope({ state: "won", wonChallengeId: "leg-0" });
  const won1 = scope({ sectionIndex: 1, anchorDerivedNodeId: "m1", state: "won", wonChallengeId: "leg-1" });
  const summit = scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit" });
  const layout = composeCrystalFormation({
    concepts: [concept("a"), concept("b", { sectionIndex: 1 })],
    sections: [section(0, { recallScope: won0 }), section(1, { recallScope: won1 })],
    edges: [],
    enrichmentScope: summit
  });

  assert.deepEqual(selectVistaFocus(layout, { kind: "leg", sectionIndex: 0 }, 1, []), { kind: "leg", sectionIndex: 0 });
  assert.deepEqual(selectVistaFocus(layout, null, 0, []), { kind: "summit" });
  assert.deepEqual(selectVistaFocus(layout, null, 0, ["summit"]), { kind: "leg", sectionIndex: 1 });
  assert.deepEqual(selectVistaFocus(layout, null, 1, ["summit", "leg:0", "leg:1"]), { kind: "leg", sectionIndex: 1 });
  assert.deepEqual(vistaRewardSnapshot(layout), ["leg:0", "leg:1", "summit"]);
});

test("Vista memory doors preserve revealed, guarded, and unnamed mineral behavior", () => {
  const layout = composeCrystalFormation({
    concepts: [
      concept("mastered", { state: "mastered", gist: "A stable memory." }),
      concept("known", { state: "mastered", isKnownSkipped: true, sectionPositionIndex: 1 }),
      concept("mystery", { state: "locked", sectionPositionIndex: 2 }),
      concept("goal", { state: "locked", sectionPositionIndex: 3, isMilestone: true })
    ],
    sections: [section(0, { state: "available" })],
    edges: [],
    enrichmentScope: null
  });
  const slots = new Map(layout.legs[0].slots.map((slot) => [slot.derivedNodeId, slot]));

  assert.equal(isNameableMineral(slots.get("mastered")!), true);
  assert.equal(isNameableMineral(slots.get("known")!), true);
  assert.equal(isNameableMineral(slots.get("mystery")!), false);
  assert.equal(isNameableMineral(slots.get("goal")!), true);
  assert.deepEqual(formationMemoryDoorFor(layout, "mastered"), {
    kind: "reveal",
    derivedNodeId: "mastered",
    label: "mastered",
    gist: "A stable memory."
  });
  assert.equal(formationMemoryDoorFor(layout, "mystery"), null);
  assert.deepEqual(formationMemoryDoorFor(layout, "goal"), {
    kind: "guarded",
    derivedNodeId: "goal",
    label: "goal",
    legNumber: 1
  });
});

function section(sectionIndex: number, over: Partial<FormationSectionInput> = {}): FormationSectionInput {
  return { sectionIndex, milestoneLabel: `Milestone ${sectionIndex}`, state: "available", recallScope: null, ...over };
}

function scope(over: Partial<RecallScopeStatus> = {}): RecallScopeStatus {
  return {
    scopeKind: "section",
    anchorDerivedNodeId: "m0",
    anchorLabel: "Milestone 0",
    sectionIndex: 0,
    eligibleItemCount: 3,
    state: "available",
    ...over
  };
}

// Scenario 1: the four structural states map exactly from section/scope facts, with the
// honest guardian substates; known-skipped slots remain ghosts in every state.
test("structural states derive purely from section state and scope facts", () => {
  assert.equal(legStructuralState({ state: "locked" }, null), "future");
  assert.equal(legStructuralState({ state: "available" }, scope()), "collecting");
  assert.equal(legStructuralState({ state: "complete" }, scope()), "guardian_ready");
  assert.equal(legStructuralState({ state: "complete" }, scope({ state: "won", wonChallengeId: "c1" })), "bound");

  const edges: FormationEdgeInput[] = [];
  const ready = buildLegModel(section(0, { state: "complete", recallScope: scope() }), [concept("a", { state: "mastered" })], edges);
  assert.equal(ready.structuralState, "guardian_ready");
  assert.equal(ready.guardianSubstate, "available");

  const engaged = buildLegModel(
    section(0, { state: "complete", recallScope: scope({ state: "active", activeChallengeId: "c9" }) }),
    [concept("a", { state: "mastered" })],
    edges
  );
  assert.equal(engaged.guardianSubstate, "engaged");

  const unavailable = buildLegModel(
    section(0, { state: "complete", recallScope: scope({ state: "unavailable", eligibleItemCount: 0, reason: "no_eligible_items" }) }),
    [concept("a", { state: "mastered" })],
    edges
  );
  assert.equal(unavailable.guardianSubstate, "unavailable");

  const collecting = buildLegModel(section(0), [concept("a")], edges);
  assert.equal(collecting.guardianSubstate, null);

  // A known-skipped concept stays a ghost slot in every structural state (R8).
  for (const state of ["locked", "available", "complete"] as const) {
    const model = buildLegModel(
      section(0, { state }),
      [concept("k", { state: "mastered", isKnownSkipped: true }), concept("a", { state: "mastered", sectionPositionIndex: 1 })],
      edges
    );
    assert.equal(model.slots.find((slot) => slot.derivedNodeId === "k")!.state, "known");
  }
});

// Scenario 2: cross-Leg and uncertain edges never enter the reward composition.
test("only trusted same-Leg edges become veins", () => {
  const concepts = [
    concept("a"),
    concept("b", { sectionPositionIndex: 1 }),
    concept("c", { sectionPositionIndex: 2 })
  ];
  const edges: FormationEdgeInput[] = [
    { source: "a", target: "b", uncertain: false },
    { source: "b", target: "c", uncertain: true },
    { source: "a", target: "other-leg-node", uncertain: false }
  ];
  const model = buildLegModel(section(0), concepts, edges);
  assert.equal(model.veinsOmitted, false);
  assert.deepEqual(model.veins.map((vein) => `${vein.source}->${vein.target}`), ["a->b"]);
});

// Scenario 3: frames and contours contain every slot bound, never overlap after packing,
// and islands connect only through the winding spine.
test("packed Leg frames are disjoint, contain their slots, and join only via the spine", () => {
  const concepts = [
    concept("a0"), concept("a1", { sectionPositionIndex: 1 }),
    concept("b0", { sectionIndex: 1 }), concept("b1", { sectionIndex: 1, sectionPositionIndex: 1 }),
    concept("c0", { sectionIndex: 2 })
  ];
  const edges: FormationEdgeInput[] = [
    { source: "a0", target: "a1", uncertain: false },
    { source: "b0", target: "b1", uncertain: false }
  ];
  const layout = composeCrystalFormation({
    concepts,
    sections: [section(0), section(1), section(2)],
    edges,
    enrichmentScope: null
  });

  assert.equal(layout.legs.length, 3);
  for (const leg of layout.legs) {
    for (const slot of leg.slots) {
      // Slot bounds (specimen + touch target) stay inside the frame with more margin
      // than the contour's maximum inward jitter, so the matrix provably contains them.
      assert.ok(slot.x - SLOT_SIZE / 2 >= MATRIX_PAD - 12, `slot ${slot.derivedNodeId} left bound`);
      assert.ok(slot.x + SLOT_SIZE / 2 <= leg.width - (MATRIX_PAD - 12));
      assert.ok(slot.y - SLOT_SIZE / 2 >= MATRIX_PAD - 12);
      assert.ok(slot.y + SLOT_SIZE / 2 <= leg.height - (MATRIX_PAD - 12));
    }
    for (const point of leg.matrix) {
      assert.ok(point.x >= 0 && point.x <= leg.width && point.y >= 0 && point.y <= leg.height);
    }
  }

  // Pairwise disjoint vertical bands: packing separates frames by a positive gap.
  const bands = layout.legs.map((leg) => ({ top: leg.frame.y, bottom: leg.frame.y + leg.height })).sort((a, b) => a.top - b.top);
  for (let i = 0; i + 1 < bands.length; i += 1) {
    assert.ok(bands[i].bottom < bands[i + 1].top, "leg frames must never overlap");
  }

  // One spine segment per Leg; the last climbs to the terminus; none is a graph edge.
  assert.equal(layout.spine.length, 3);
  assert.equal(layout.spine[2].toSectionIndex, null);
  assert.deepEqual(layout.spine[0].points.at(-1), {
    x: layout.legs[1].frame.x + layout.legs[1].junction.x,
    y: layout.legs[1].frame.y + layout.legs[1].junction.y
  });
  assert.ok(layout.terminus);
  // Legs ascend: canonical order climbs bottom → top (Leg 0 lowest, terminus above all).
  assert.ok(layout.legs[0].frame.y > layout.legs[2].frame.y);
  assert.ok(layout.terminus!.frame.y < layout.legs[2].frame.y);
});

// Scenario 4: binding and the crown derive ONLY from wonChallengeId — mastery never binds.
test("complete mastery alone never binds a Leg or seats the crown", () => {
  const mastered = [concept("a", { state: "mastered" })];
  const noWin = composeCrystalFormation({
    concepts: mastered,
    sections: [section(0, { state: "complete", recallScope: scope() })],
    edges: [],
    enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "available" })
  });
  assert.equal(noWin.legs[0].structuralState, "guardian_ready");
  assert.equal(noWin.terminus!.crowned, false);
  assert.equal(noWin.spine[0].lit, false);

  const won = composeCrystalFormation({
    concepts: mastered,
    sections: [section(0, { state: "complete", recallScope: scope({ state: "won", wonChallengeId: "first" }) })],
    edges: [],
    enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit-first" })
  });
  assert.equal(won.legs[0].structuralState, "bound");
  assert.equal(won.spine[0].lit, true);
  assert.equal(won.terminus!.crowned, true);
});

// Scenario 5: a flagged Leg drops only the exact overlay; empty/single-node stays total.
test("a crossing Leg omits veins but keeps slots, matrix, seam, state, and the diagnostic", () => {
  // This 4-node tangle provably crosses under the layered embedding (measured, locked).
  const concepts = ["n0", "n1", "n2", "n3"].map((id, index) =>
    concept(id, { sectionPositionIndex: index, difficulty: index / 10 })
  );
  const edges: FormationEdgeInput[] = [
    { source: "n0", target: "n1", uncertain: false },
    { source: "n0", target: "n2", uncertain: false },
    { source: "n0", target: "n3", uncertain: false },
    { source: "n1", target: "n2", uncertain: false },
    { source: "n1", target: "n3", uncertain: false }
  ];
  const model = buildLegModel(section(0), concepts, edges);
  assert.ok(model.crossings > 0, "fixture must actually cross");
  assert.equal(model.veinsOmitted, true);
  assert.deepEqual(model.veins, []);
  assert.equal(model.slots.length, 4);
  assert.ok(model.matrix.length >= 8);
  assert.ok(model.seam.length >= 3);
  assert.equal(model.structuralState, "collecting");

  const single = buildLegModel(section(0), [concept("solo")], []);
  assert.equal(single.slots.length, 1);
  assert.ok(single.width > 0 && single.height > 0);
  const empty = buildLegModel(section(0), [], []);
  assert.deepEqual(empty.slots, []);
  assert.ok(empty.width > 0 && empty.height > 0);
  const none = composeCrystalFormation({ concepts: [], sections: [], edges: [], enrichmentScope: null });
  assert.deepEqual(none.legs, []);
  assert.equal(none.terminus, null);
});

// Determinism (R13): identical inputs render identically across calls and array order.
test("the layout is deterministic and input-order independent", () => {
  const concepts = [
    concept("a0"), concept("a1", { sectionPositionIndex: 1 }),
    concept("b0", { sectionIndex: 1 })
  ];
  const edges: FormationEdgeInput[] = [{ source: "a0", target: "a1", uncertain: false }];
  const input = { concepts, sections: [section(0), section(1)], edges, enrichmentScope: null };
  const shuffled = { ...input, concepts: [...concepts].reverse(), sections: [section(1), section(0)] };
  assert.deepEqual(composeCrystalFormation(input), composeCrystalFormation(shuffled));
});

// Scenario 7: width fitting floors the specimen at 40 px and prefers overflow.
test("width fitting never shrinks a specimen below 40 px; a wide Leg overflows instead", () => {
  assert.deepEqual(fitLegWidth(300, 390), { scale: 1, horizontalOverflow: false });
  // Mild squeeze: scale down but stay above the readable floor.
  const squeezed = fitLegWidth(430, 390);
  assert.ok(squeezed.scale < 1 && squeezed.scale * SLOT_SIZE >= 40);
  assert.equal(squeezed.horizontalOverflow, false);
  // An exceptional wide Leg: clamp at the floor and scroll horizontally instead.
  const wide = fitLegWidth(1200, 390);
  assert.equal(wide.scale * SLOT_SIZE, 40);
  assert.equal(wide.horizontalOverflow, true);

  // A phone-width sanity bound over a realistic dense Leg: ten slots in the widest
  // measured production shape still keep specimens at or above 40 px.
  const tenWide = buildLegModel(
    section(0),
    Array.from({ length: 10 }, (_, index) => concept(`w${index}`, { sectionPositionIndex: index, difficulty: index / 20 })),
    Array.from({ length: 9 }, (_, index) => ({ source: "w0", target: `w${index + 1}`, uncertain: false }))
  );
  const fit = fitLegWidth(tenWide.width, 390);
  assert.ok(fit.scale * SLOT_SIZE >= 40);
});
