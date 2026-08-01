import assert from "node:assert/strict";
import { test } from "@jest/globals";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import {
  BADGE_RADIUS,
  CHARTED_CELL,
  CHARTED_CRYSTAL_PX,
  LOCKED_CELL,
  LOCKED_CRYSTAL_PX,
  MIN_PANEL_WIDTH,
  buildLegPanel,
  composeCrystalFormation,
  formationMemoryDoorFor,
  isNameableMineral,
  legStructuralState,
  selectVistaFocus,
  vistaRewardSnapshot,
  type FormationConceptInput,
  type FormationSectionInput,
  type LegPanelModel
} from "./crystalFormationLayout";
import { MIN_SPECIMEN_PX } from "./mineralSpecimen";

const WIDTH = 358; // the Vista canvas at a 390 px phone

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

// Cells are laid out inside the well; nothing may leave it or overlap a neighbour.
function assertCellsContained(panel: LegPanelModel) {
  for (const cell of panel.cells) {
    assert.ok(cell.rect.x >= 0 && cell.rect.x + cell.rect.width <= panel.well.width, `cell ${cell.derivedNodeId} inside the well width`);
    assert.ok(cell.rect.y >= 0 && cell.rect.y + cell.rect.height <= panel.well.height, `cell ${cell.derivedNodeId} inside the well height`);
    assert.ok(cell.crystal.x >= 0 && cell.crystal.x + cell.crystal.width <= cell.rect.width, "crystal box inside its cell");
    assert.ok(cell.crystal.y >= 0 && cell.crystal.y + cell.crystal.height <= cell.rect.height, "crystal box inside its cell");
  }
  for (const cell of panel.cells) {
    for (const other of panel.cells) {
      if (cell === other || cell.row !== other.row) continue;
      const disjoint = cell.rect.x + cell.rect.width <= other.rect.x || other.rect.x + other.rect.width <= cell.rect.x;
      assert.ok(disjoint, "same-row cells never overlap");
    }
  }
}

// The four structural states map exactly from section/scope facts, with the honest guardian
// substates; known-skipped cells remain fogged ghosts in every state.
test("structural states derive purely from section state and scope facts", () => {
  assert.equal(legStructuralState({ state: "locked" }, null), "future");
  assert.equal(legStructuralState({ state: "available" }, scope()), "collecting");
  assert.equal(legStructuralState({ state: "complete" }, scope()), "guardian_ready");
  assert.equal(legStructuralState({ state: "complete" }, scope({ state: "won", wonChallengeId: "c1" })), "bound");

  const ready = buildLegPanel(section(0, { state: "complete", recallScope: scope() }), [concept("a", { state: "mastered" })], WIDTH);
  assert.equal(ready.structuralState, "guardian_ready");
  assert.equal(ready.guardianSubstate, "available");

  const engaged = buildLegPanel(
    section(0, { state: "complete", recallScope: scope({ state: "active", activeChallengeId: "c9" }) }),
    [concept("a", { state: "mastered" })],
    WIDTH
  );
  assert.equal(engaged.guardianSubstate, "engaged");

  const unavailable = buildLegPanel(
    section(0, { state: "complete", recallScope: scope({ state: "unavailable", eligibleItemCount: 0, reason: "no_eligible_items" }) }),
    [concept("a", { state: "mastered" })],
    WIDTH
  );
  assert.equal(unavailable.guardianSubstate, "unavailable");

  const collecting = buildLegPanel(section(0), [concept("a")], WIDTH);
  assert.equal(collecting.guardianSubstate, null);

  for (const state of ["locked", "available", "complete"] as const) {
    const panel = buildLegPanel(
      section(0, { state }),
      [concept("k", { state: "mastered", isKnownSkipped: true }), concept("a", { state: "mastered", sectionPositionIndex: 1 })],
      WIDTH
    );
    const known = panel.cells.find((cell) => cell.derivedNodeId === "k")!;
    assert.equal(known.state, "known");
    assert.equal(known.material, "fogged", "known ground never gives away its hue");
  }
});

// KTD8: exactly two cell geometries. Crystal size never varies by Leg or concept count, so a
// dense Leg can never misread as an important one.
test("both cell geometries are fixed and stay above the readable floor", () => {
  const charted = buildLegPanel(
    section(0),
    Array.from({ length: 9 }, (_, index) => concept(`c${index}`, { sectionPositionIndex: index })),
    WIDTH
  );
  const sparse = buildLegPanel(section(1), [concept("solo", { sectionIndex: 1 })], WIDTH);
  const locked = buildLegPanel(
    section(2, { state: "locked" }),
    Array.from({ length: 8 }, (_, index) => concept(`l${index}`, { sectionIndex: 2, sectionPositionIndex: index })),
    WIDTH
  );

  assert.equal(charted.cellKind, "charted");
  assert.equal(sparse.cellKind, "charted");
  assert.equal(locked.cellKind, "locked");
  for (const cell of [...charted.cells, ...sparse.cells]) {
    assert.deepEqual({ width: cell.rect.width, height: cell.rect.height }, { width: CHARTED_CELL.width, height: CHARTED_CELL.height });
    assert.equal(cell.crystal.width, CHARTED_CRYSTAL_PX);
    assert.ok(cell.bar !== null, "a charted cell carries its growth bar");
  }
  for (const cell of locked.cells) {
    assert.deepEqual({ width: cell.rect.width, height: cell.rect.height }, { width: LOCKED_CELL.width, height: LOCKED_CELL.height });
    assert.equal(cell.crystal.width, LOCKED_CRYSTAL_PX);
    assert.equal(cell.bar, null, "a fogged locked cell has no growth to show");
  }
  // R6: the declared floor is a guarantee, asserted at both geometries.
  assert.ok(CHARTED_CRYSTAL_PX >= MIN_SPECIMEN_PX && CHARTED_CRYSTAL_PX >= 56);
  assert.ok(LOCKED_CRYSTAL_PX >= MIN_SPECIMEN_PX && LOCKED_CRYSTAL_PX >= 44);
});

// KTD8: rows wrap at the width-derived capacity and the last row centers.
test("cells wrap into rows and the last row centers", () => {
  const panel = buildLegPanel(
    section(0),
    Array.from({ length: 6 }, (_, index) => concept(`c${index}`, { sectionPositionIndex: index })),
    WIDTH
  );
  const capacity = panel.cells.filter((cell) => cell.row === 0).length;
  assert.equal(capacity, 4, "four charted cells per row at a 390 px phone");
  assert.equal(panel.rowCount, 2);
  assertCellsContained(panel);

  const front = panel.cells.filter((cell) => cell.row === 0);
  const last = panel.cells.filter((cell) => cell.row === 1);
  assert.equal(last.length, 2);
  const center = (cells: typeof panel.cells) =>
    (Math.min(...cells.map((cell) => cell.rect.x)) + Math.max(...cells.map((cell) => cell.rect.x + cell.rect.width))) / 2;
  assert.equal(center(last), center(front), "the half-filled last row is centered on the full row");
  // Canonical order is row-major: cells follow the expedition path, never a packer's order.
  assert.deepEqual(panel.cells.map((cell) => cell.derivedNodeId), ["c0", "c1", "c2", "c3", "c4", "c5"]);
});

// R7: no panel exceeds its canvas from a 320 px phone to a 1280 px desktop, and a narrow
// canvas reduces cells per row instead of shrinking any crystal.
test("panels stay inside the canvas from 320 px to 1280 px", () => {
  const concepts = Array.from({ length: 12 }, (_, index) => concept(`c${index}`, { sectionPositionIndex: index }));
  const capacities: number[] = [];
  for (const canvas of [320 - 32, 390 - 32, 768 - 32, 1280 - 32]) {
    const layout = composeCrystalFormation(
      { concepts, sections: [section(0)], enrichmentScope: null, nextDerivedNodeId: null },
      canvas
    );
    const panel = layout.panels[0];
    assert.ok(layout.width <= canvas);
    assert.ok(panel.width <= layout.width, "the panel never exceeds the canvas");
    assert.ok(panel.well.width <= panel.width, "the well never exceeds its panel");
    assertCellsContained(panel);
    for (const cell of panel.cells) assert.equal(cell.crystal.width, CHARTED_CRYSTAL_PX);
    capacities.push(panel.cells.filter((cell) => cell.row === 0).length);
  }
  assert.deepEqual([...capacities].sort((a, b) => a - b), capacities, "wider canvases fit at least as many cells per row");
  assert.ok(capacities[0] >= 2, "even the narrowest phone keeps a real grid");

  // Phone-width panels stack their captions instead of truncating exact state or count copy.
  // The desktop panel can keep both complete strings on one row.
  assert.equal(buildLegPanel(section(0), concepts, 292).captionStacked, true);
  assert.equal(buildLegPanel(section(0), concepts, 362).captionStacked, true);
  assert.equal(buildLegPanel(section(0), concepts, 452).captionStacked, false);

  // Below the single-cell floor the panel clamps instead of emitting a cropped grid.
  const tiny = buildLegPanel(section(0), [concept("solo")], 40);
  assert.equal(tiny.width, MIN_PANEL_WIDTH);
  assertCellsContained(tiny);
});

// KTD7/KTD13: the four materials ride the structural state, and `next` marks exactly one cell.
test("the material ladder derives from structural state and the projected next stop", () => {
  const layout = composeCrystalFormation(
    {
      concepts: [
        concept("done", { state: "mastered", growthFraction: 1 }),
        concept("target", { sectionPositionIndex: 1 }),
        concept("later", { sectionPositionIndex: 2, state: "locked" }),
        concept("known", { sectionPositionIndex: 3, state: "mastered", isKnownSkipped: true }),
        concept("deep", { sectionIndex: 1, state: "locked" })
      ],
      sections: [section(0), section(1, { state: "locked" })],
      enrichmentScope: null,
      nextDerivedNodeId: "target"
    },
    WIDTH
  );
  const materials = new Map(layout.panels.flatMap((panel) => panel.cells.map((cell) => [cell.derivedNodeId, cell.material] as const)));
  assert.equal(materials.get("done"), "collected");
  assert.equal(materials.get("target"), "next");
  assert.equal(materials.get("later"), "open");
  assert.equal(materials.get("known"), "fogged");
  assert.equal(materials.get("deep"), "fogged", "a future Leg is fogged stone throughout");

  const nextCells = layout.panels.flatMap((panel) => panel.cells.filter((cell) => cell.isNext));
  assert.equal(nextCells.length, 1, "exactly one cell carries the load-bearing Next chip");
  assert.equal(nextCells[0].derivedNodeId, "target");
  // Species encode the difficulty band and nothing else — same band, same shape.
  const bandOne = layout.panels[0].cells.map((cell) => cell.species);
  assert.deepEqual(new Set(bandOne), new Set(["band2"]));
});

// KTD10: the junction badge straddles the panel's top edge, centered, and its radius is public
// so every consumer reserves the same overhang.
test("the junction badge anchors on the panel top edge", () => {
  for (const width of [MIN_PANEL_WIDTH, WIDTH, 1248]) {
    const panel = buildLegPanel(section(0), [concept("solo")], width);
    assert.equal(panel.badge.y, 0);
    assert.equal(panel.badge.x, panel.width / 2);
    assert.ok(BADGE_RADIUS > 0 && BADGE_RADIUS < panel.width / 2);
  }
});

// The stack: panels in canonical Leg order, closed by the summit strip that counts sealed Legs.
test("the formation stacks panels in canonical Leg order under one summit strip", () => {
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a0"), concept("b0", { sectionIndex: 1 }), concept("c0", { sectionIndex: 2 })],
      sections: [section(2), section(0, { state: "complete", recallScope: scope({ state: "won", wonChallengeId: "leg-0" }) }), section(1)],
      enrichmentScope: null,
      nextDerivedNodeId: null
    },
    WIDTH
  );
  assert.deepEqual(layout.panels.map((panel) => panel.sectionIndex), [0, 1, 2]);
  // Every panel renders at one width — the ground's inner width, never per-Leg.
  assert.deepEqual(layout.panels.map((panel) => panel.width), [layout.panelWidth, layout.panelWidth, layout.panelWidth]);
  assert.ok(layout.panelWidth < layout.width, "the panels sit inside the formation ground");
  assert.deepEqual(layout.summit, {
    species: "keystone",
    keystoneSeated: false,
    crystalSize: 40,
    legCount: 3,
    sealedLegCount: 1
  });
});

// Binding and the keystone derive ONLY from wonChallengeId — mastery never binds.
test("complete mastery alone never binds a Leg or seats the keystone", () => {
  const mastered = [concept("a", { state: "mastered" })];
  const noWin = composeCrystalFormation(
    {
      concepts: mastered,
      sections: [section(0, { state: "complete", recallScope: scope() })],
      enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "available" }),
      nextDerivedNodeId: null
    },
    WIDTH
  );
  assert.equal(noWin.panels[0].structuralState, "guardian_ready");
  assert.equal(noWin.summit!.keystoneSeated, false);
  assert.equal(noWin.summit!.sealedLegCount, 0);

  const won = composeCrystalFormation(
    {
      concepts: mastered,
      sections: [section(0, { state: "complete", recallScope: scope({ state: "won", wonChallengeId: "first" }) })],
      enrichmentScope: scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit-first" }),
      nextDerivedNodeId: null
    },
    WIDTH
  );
  assert.equal(won.panels[0].structuralState, "bound");
  assert.equal(won.summit!.keystoneSeated, true);
  assert.equal(won.summit!.sealedLegCount, 1);
});

// Determinism: identical inputs render identically across calls and array order.
test("the layout is deterministic and input-order independent", () => {
  const concepts = [concept("a0"), concept("a1", { sectionPositionIndex: 1 }), concept("b0", { sectionIndex: 1 })];
  const input = { concepts, sections: [section(0), section(1)], enrichmentScope: null, nextDerivedNodeId: "a1" };
  const shuffled = { ...input, concepts: [...concepts].reverse(), sections: [section(1), section(0)] };
  assert.deepEqual(composeCrystalFormation(input, WIDTH), composeCrystalFormation(shuffled, WIDTH));
});

// Degenerate shapes stay total: empty Legs, empty formations, no next stop.
test("empty and single-concept shapes keep positive panel dimensions", () => {
  const single = buildLegPanel(section(0), [concept("solo")], WIDTH);
  assert.equal(single.cells.length, 1);
  assert.ok(single.width > 0 && single.well.height > 0);

  const empty = buildLegPanel(section(0), [], WIDTH);
  assert.deepEqual(empty.cells, []);
  assert.equal(empty.rowCount, 1);
  assert.ok(empty.well.height > 0, "an empty Leg still reads as a panel");

  const none = composeCrystalFormation({ concepts: [], sections: [], enrichmentScope: null, nextDerivedNodeId: null }, WIDTH);
  assert.deepEqual(none.panels, []);
  assert.equal(none.summit, null);
});

test("Vista focus prioritizes explicit intent, then the furthest unseen reward, current Leg, and first Leg", () => {
  const won0 = scope({ state: "won", wonChallengeId: "leg-0" });
  const won1 = scope({ sectionIndex: 1, anchorDerivedNodeId: "m1", state: "won", wonChallengeId: "leg-1" });
  const summit = scope({ scopeKind: "enrichment", sectionIndex: null, state: "won", wonChallengeId: "summit" });
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a"), concept("b", { sectionIndex: 1 })],
      sections: [section(0, { recallScope: won0 }), section(1, { recallScope: won1 })],
      enrichmentScope: summit,
      nextDerivedNodeId: null
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
      enrichmentScope: null,
      nextDerivedNodeId: null
    },
    WIDTH
  );
  const cells = new Map(layout.panels[0].cells.map((cell) => [cell.derivedNodeId, cell]));

  assert.equal(isNameableMineral(cells.get("mastered")!), true);
  assert.equal(isNameableMineral(cells.get("known")!), true);
  assert.equal(isNameableMineral(cells.get("mystery")!), false);
  assert.equal(isNameableMineral(cells.get("goal")!), true);
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
