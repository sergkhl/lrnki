import assert from "node:assert/strict";
import { test } from "@jest/globals";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import {
  BADGE_RADIUS,
  HERO_SLOT_PX,
  MILESTONE_SCALE,
  buildLegModel,
  composeCrystalFormation,
  formationMemoryDoorFor,
  isNameableMineral,
  legStructuralState,
  selectVistaFocus,
  vistaRewardSnapshot,
  type FormationConceptInput,
  type FormationSectionInput
} from "./crystalFormationLayout";

const WIDTH = 390;

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

// KTD3: the four structural states map exactly from section/scope facts, with the
// honest guardian substates; known-skipped slots remain ghosts in every state.
test("structural states derive purely from section state and scope facts", () => {
  assert.equal(legStructuralState({ state: "locked" }, null), "future");
  assert.equal(legStructuralState({ state: "available" }, scope()), "collecting");
  assert.equal(legStructuralState({ state: "complete" }, scope()), "guardian_ready");
  assert.equal(legStructuralState({ state: "complete" }, scope({ state: "won", wonChallengeId: "c1" })), "bound");

  const ready = buildLegModel(section(0, { state: "complete", recallScope: scope() }), [concept("a", { state: "mastered" })], WIDTH);
  assert.equal(ready.structuralState, "guardian_ready");
  assert.equal(ready.guardianSubstate, "available");

  const engaged = buildLegModel(
    section(0, { state: "complete", recallScope: scope({ state: "active", activeChallengeId: "c9" }) }),
    [concept("a", { state: "mastered" })],
    WIDTH
  );
  assert.equal(engaged.guardianSubstate, "engaged");

  const unavailable = buildLegModel(
    section(0, { state: "complete", recallScope: scope({ state: "unavailable", eligibleItemCount: 0, reason: "no_eligible_items" }) }),
    [concept("a", { state: "mastered" })],
    WIDTH
  );
  assert.equal(unavailable.guardianSubstate, "unavailable");

  const collecting = buildLegModel(section(0), [concept("a")], WIDTH);
  assert.equal(collecting.guardianSubstate, null);

  for (const state of ["locked", "available", "complete"] as const) {
    const model = buildLegModel(
      section(0, { state }),
      [concept("k", { state: "mastered", isKnownSkipped: true }), concept("a", { state: "mastered", sectionPositionIndex: 1 })],
      WIDTH
    );
    assert.equal(model.slots.find((slot) => slot.derivedNodeId === "k")!.state, "known");
  }
});

// D3: the milestone specimen sits hero-sized front and center; the rest keep the base
// size and radiate outward in trail order.
test("mound packing centers the milestone hero at 1.25x with base-size companions", () => {
  const concepts = Array.from({ length: 5 }, (_, index) =>
    concept(`c${index}`, { sectionPositionIndex: index, isMilestone: index === 2 })
  );
  const model = buildLegModel(section(0), concepts, WIDTH);
  const hero = model.slots.find((slot) => slot.isMilestone)!;
  assert.equal(hero.size, Math.round(HERO_SLOT_PX * MILESTONE_SCALE));
  assert.equal(hero.row, 0);
  assert.equal(hero.x, model.width / 2);
  for (const slot of model.slots.filter((candidate) => !candidate.isMilestone)) {
    assert.equal(slot.size, HERO_SLOT_PX);
  }
  // Symmetric centering at this width holds the hero plus one companion per side in
  // front; the remaining two wrap to the raised back row.
  assert.equal(model.slots.filter((slot) => slot.row === 0).length, 3);
  assert.equal(model.slots.filter((slot) => slot.row === 1).length, 2);
  // The front row is symmetric around the hero.
  const front = model.slots.filter((slot) => slot.row === 0 && !slot.isMilestone);
  assert.equal(front[0].x - 0, model.width - front[1].x);
});

// KTD2 invariants: width-bounded islands, in-bounds slots, no same-row overlap, and
// wrapped rows raised behind the front.
test("a dense Leg wraps to raised back rows and never exceeds the available width", () => {
  const concepts = Array.from({ length: 10 }, (_, index) =>
    concept(`w${index}`, { sectionPositionIndex: index, difficulty: index / 20, isMilestone: index === 0 })
  );
  const model = buildLegModel(section(0), concepts, WIDTH);
  assert.ok(model.width <= WIDTH);
  assert.ok(Math.max(...model.slots.map((slot) => slot.row)) >= 1, "ten concepts must wrap");
  for (const slot of model.slots) {
    assert.ok(slot.size >= HERO_SLOT_PX, "specimens stay at or above hero size");
    assert.ok(slot.x - slot.size / 2 >= 0 && slot.x + slot.size / 2 <= model.width, `slot ${slot.derivedNodeId} in bounds`);
    assert.ok(slot.y - slot.size / 2 >= 0 && slot.y + slot.size / 2 <= model.height);
  }
  const byRow = new Map<number, typeof model.slots>();
  for (const slot of model.slots) byRow.set(slot.row, [...(byRow.get(slot.row) ?? []), slot]);
  for (const row of byRow.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    for (let index = 0; index + 1 < sorted.length; index += 1) {
      assert.ok(
        sorted[index].x + sorted[index].size / 2 <= sorted[index + 1].x - sorted[index + 1].size / 2,
        "same-row slots never overlap"
      );
    }
  }
  const front = Math.min(...model.slots.filter((slot) => slot.row === 0).map((slot) => slot.y));
  const back = Math.min(...model.slots.filter((slot) => slot.row === 1).map((slot) => slot.y));
  assert.ok(back < front, "back rows are raised");
  // Paint order: back rows first so the front mound overlaps them.
  const rowsInPaintOrder = model.slots.map((slot) => slot.row);
  assert.deepEqual(rowsInPaintOrder, [...rowsInPaintOrder].sort((a, b) => b - a));
});

// D3 (plan 2026-07-16-003 U2): the straddling junction badge is part of the island's own
// geometry — its full roundel (radius + stroke) stays inside the emitted frame at every
// shape, so no consumer viewBox can crop the gold seal.
test("the junction badge roundel is contained by the island frame across shapes", () => {
  const shapes = [
    buildLegModel(section(0), [concept("solo", { isMilestone: true })], WIDTH),
    buildLegModel(
      section(0),
      Array.from({ length: 10 }, (_, index) =>
        concept(`w${index}`, { sectionPositionIndex: index, isMilestone: index === 0 })
      ),
      WIDTH
    ),
    buildLegModel(section(0), [], WIDTH),
    buildLegModel(section(0), [concept("narrow", { isMilestone: true })], 160)
  ];
  for (const model of shapes) {
    const overhang = BADGE_RADIUS + 1; // radius plus the seal's stroke half-width, rounded up
    assert.ok(model.badge.y - overhang >= 0, "badge top inside the frame");
    assert.ok(model.badge.y + overhang <= model.height, "badge bottom inside the frame");
    assert.ok(model.badge.x - overhang >= 0 && model.badge.x + overhang <= model.width, "badge sides inside the frame");
  }
});

// Headers are part of the geometry: bands sit above their island and never intersect
// any island frame (D-headers), and the ascent alternates a small lateral offset.
test("the ascent allocates disjoint header bands and alternating island offsets", () => {
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a0"), concept("b0", { sectionIndex: 1 }), concept("c0", { sectionIndex: 2 })],
      sections: [section(0), section(1), section(2)],
      enrichmentScope: null
    },
    WIDTH
  );
  assert.equal(layout.legs.length, 3);
  assert.ok(layout.width <= WIDTH);
  const frames = layout.legs.map((leg) => ({ top: leg.frame.y, bottom: leg.frame.y + leg.height, leg }));
  for (const { leg } of frames) {
    assert.ok(leg.header.y + leg.header.height <= leg.frame.y, "header sits fully above its island");
    for (const other of frames) {
      const headerBottom = leg.header.y + leg.header.height;
      assert.ok(headerBottom <= other.top || leg.header.y >= other.bottom, "headers never intersect any island frame");
    }
    assert.ok(leg.frame.x >= 0 && leg.frame.x + leg.width <= layout.width);
  }
  // Legs ascend: canonical order climbs bottom → top under the peak.
  assert.ok(layout.legs[0].frame.y > layout.legs[2].frame.y);
  assert.ok(layout.terminus!.frame.y < layout.legs[2].frame.y);
  // Alternating lateral offset: adjacent islands don't share a left edge.
  assert.notEqual(layout.legs[0].frame.x, layout.legs[1].frame.x);
});

// D5: the spine is one continuous smooth curve — each segment starts where the previous
// ended, the last climbs to the peak, and only a bound Leg's segment lights.
test("the spine is continuous through every junction and lights only bound segments", () => {
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a0", { state: "mastered" }), concept("b0", { sectionIndex: 1 })],
      sections: [
        section(0, { state: "complete", recallScope: scope({ state: "won", wonChallengeId: "first" }) }),
        section(1)
      ],
      enrichmentScope: null
    },
    WIDTH
  );
  assert.equal(layout.spine.length, 2);
  assert.deepEqual(layout.spine[0].points[0], {
    x: layout.legs[0].frame.x + layout.legs[0].badge.x,
    y: layout.legs[0].frame.y + layout.legs[0].badge.y
  });
  assert.deepEqual(layout.spine[0].points.at(-1), layout.spine[1].points[0]);
  assert.deepEqual(layout.spine[1].points.at(-1), {
    x: layout.terminus!.frame.x + layout.terminus!.keystone.x,
    y: layout.terminus!.frame.y + layout.terminus!.height
  });
  assert.equal(layout.spine[1].toSectionIndex, null);
  assert.deepEqual(layout.spine.map((segment) => segment.lit), [true, false]);
  assert.ok(layout.spine[0].points.length > 4, "segments are sampled curves, not polyline elbows");
});

// KTD3: binding and the keystone derive ONLY from wonChallengeId — mastery never binds.
test("complete mastery alone never binds a Leg or seats the keystone", () => {
  const mastered = [concept("a", { state: "mastered" })];
  const noWin = composeCrystalFormation(
    {
      concepts: mastered,
      sections: [section(0, { state: "complete", recallScope: scope() })],
      enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "available" })
    },
    WIDTH
  );
  assert.equal(noWin.legs[0].structuralState, "guardian_ready");
  assert.equal(noWin.terminus!.keystoneSeated, false);
  assert.equal(noWin.spine[0].lit, false);

  const won = composeCrystalFormation(
    {
      concepts: mastered,
      sections: [section(0, { state: "complete", recallScope: scope({ state: "won", wonChallengeId: "first" }) })],
      enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit-first" })
    },
    WIDTH
  );
  assert.equal(won.legs[0].structuralState, "bound");
  assert.equal(won.spine[0].lit, true);
  assert.equal(won.terminus!.keystoneSeated, true);
});

// Determinism: identical inputs render identically across calls and array order.
test("the layout is deterministic and input-order independent", () => {
  const concepts = [
    concept("a0"), concept("a1", { sectionPositionIndex: 1 }),
    concept("b0", { sectionIndex: 1 })
  ];
  const input = { concepts, sections: [section(0), section(1)], enrichmentScope: null };
  const shuffled = { ...input, concepts: [...concepts].reverse(), sections: [section(1), section(0)] };
  assert.deepEqual(composeCrystalFormation(input, WIDTH), composeCrystalFormation(shuffled, WIDTH));
});

// Degenerate shapes stay total: empty legs, empty formations, missing milestones.
test("empty and single-concept shapes keep positive island dimensions", () => {
  const single = buildLegModel(section(0), [concept("solo")], WIDTH);
  assert.equal(single.slots.length, 1);
  assert.ok(single.width > 0 && single.height > 0);
  assert.ok(single.outline.length >= 8);
  const empty = buildLegModel(section(0), [], WIDTH);
  assert.deepEqual(empty.slots, []);
  assert.ok(empty.width > 0 && empty.height > 0);
  const none = composeCrystalFormation({ concepts: [], sections: [], enrichmentScope: null }, WIDTH);
  assert.deepEqual(none.legs, []);
  assert.equal(none.terminus, null);
  assert.equal(none.spine.length, 0);
});

test("Vista focus prioritizes explicit intent, then the furthest unseen reward, current Leg, and first Leg", () => {
  const won0 = scope({ state: "won", wonChallengeId: "leg-0" });
  const won1 = scope({ sectionIndex: 1, anchorDerivedNodeId: "m1", state: "won", wonChallengeId: "leg-1" });
  const summit = scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit" });
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a"), concept("b", { sectionIndex: 1 })],
      sections: [section(0, { recallScope: won0 }), section(1, { recallScope: won1 })],
      enrichmentScope: summit
    },
    WIDTH
  );

  assert.deepEqual(selectVistaFocus(layout, { kind: "leg", sectionIndex: 0 }, 1, []), { kind: "leg", sectionIndex: 0 });
  assert.deepEqual(selectVistaFocus(layout, null, 0, []), { kind: "summit" });
  assert.deepEqual(selectVistaFocus(layout, null, 0, ["summit"]), { kind: "leg", sectionIndex: 1 });
  assert.deepEqual(selectVistaFocus(layout, null, 1, ["summit", "leg:0", "leg:1"]), { kind: "leg", sectionIndex: 1 });
  assert.deepEqual(vistaRewardSnapshot(layout), ["leg:0", "leg:1", "summit"]);
});

test("Vista memory doors preserve revealed, guarded, and unnamed mineral behavior", () => {
  const layout = composeCrystalFormation(
    {
      concepts: [
        concept("mastered", { state: "mastered", gist: "A stable memory." }),
        concept("known", { state: "mastered", isKnownSkipped: true, sectionPositionIndex: 1 }),
        concept("mystery", { state: "locked", sectionPositionIndex: 2 }),
        concept("goal", { state: "locked", sectionPositionIndex: 3, isMilestone: true })
      ],
      sections: [section(0, { state: "available" })],
      enrichmentScope: null
    },
    WIDTH
  );
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
