// Pure Crystal Formation view-model (plan 2026-07-30-001 U3, KTD6/KTD8). The formation is a
// warm geode chart: ONE panel per Leg, ONE cell per concept, stacked in canonical Leg order
// and closed by a summit strip. No islands, no mound, no spine, no summit peak, no crop.
//
// This module owns exactly the geometry that must be deterministic and width-bounded: how many
// cells fit a row, where each cell sits inside its Leg's well, and how big the crystal inside a
// cell is. The VERTICAL stack (caption rows, panel padding, the per-Leg Guardian row) is flex
// flow in the scene component, because those bands are text-sized and must follow the reader's
// font scale — a layout-allocated header band is exactly what the deleted spine-mask hack was
// built to protect.
//
// Two fixed cell geometries only (KTD8): a charted cell and a compact locked cell. Crystal size
// never varies by Leg, so a big Leg can never misread as an important one. Structural-state
// derivations are untouched: `bound` still comes only from the durable first `wonChallengeId`.
// No React, no store, no clock — renderers consume finished geometry.

import type { RecallScopeStatus, StudySession, TrailCluster, TrailSectionView, TrailView } from "@lrnki/application/projection";
import { difficultyBand } from "@lrnki/application/projection";
import { crystalForBand, type CrystalMaterial, type CrystalSpecies } from "./crystalLibrary";
import { formationProgress, type FormationProgress } from "./mineralSpecimen";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

// Scene units are CSS px — the layout packs to the real available width, so renderers draw at
// scale 1 and nothing needs fitting or cropping.
export const PANEL_PAD = 12;
const WELL_PAD = 12;
const CELL_GAP = 10;
// The formation ground's own inset plus the constant focus-ring border every stack member carries, so
// the panel width the layout packs to is exactly what the scene renders inside its ground.
export const GROUND_PAD = 12;
export const PIECE_BORDER = 2;
const STACK_INSET = 2 * (GROUND_PAD + PIECE_BORDER);

// Rendered crystal box per cell kind (KTD8), seeded from the v4 composition mock at 390 px. Both
// stay above MIN_SPECIMEN_PX by construction (R6) and the layout suite asserts it, turning the
// declared floor into a guarantee.
export const CHARTED_CRYSTAL_PX = 58;
export const LOCKED_CRYSTAL_PX = 44;
const CELL_TOP_PAD = 8;
const BAR_HEIGHT = 4;
const BAR_GAP = 4;
const CHIP_GAP = 9;
// The `Next` chip band a charted cell ALWAYS reserves, so the single study target can carry its
// load-bearing text without shifting any neighbour's crystal.
export const CELL_CHIP_HEIGHT = 15;
export const CELL_CHIP_INSET = 6;

// The two cell geometries. A charted cell carries the crystal, its growth bar, and the reserved
// chip band; a locked cell is the compact fogged placeholder a future Leg is paved with. Heights
// are summed from the parts, so a cell can never disagree with what it contains.
export const CHARTED_CELL = {
  width: 66,
  height: CELL_TOP_PAD + CHARTED_CRYSTAL_PX + BAR_GAP + BAR_HEIGHT + CHIP_GAP + CELL_CHIP_HEIGHT + CELL_CHIP_INSET
} as const;
export const LOCKED_CELL = { width: 66, height: LOCKED_CRYSTAL_PX + 4 } as const;

// One charted cell plus both insets: below this a panel cannot hold a single readable crystal.
export const MIN_PANEL_WIDTH = CHARTED_CELL.width + 2 * (PANEL_PAD + WELL_PAD);
// Below this the caption's state line and its exact counts cannot share one row without one of
// them truncating, and truncated counts are lost information — so they stack instead.
const CAPTION_ROW_MIN_WIDTH = 400;
// The junction badge straddles the panel's top edge; the layout owns the roundel radius so every
// consumer reserves the same overhang above the panel, and the ward crystal it holds.
export const BADGE_RADIUS = 21;
export const BADGE_CRYSTAL_PX = 32;
// The keystone crystal in the summit strip.
export const SUMMIT_CRYSTAL_PX = 40;

export type LegStructuralState = "future" | "collecting" | "guardian_ready" | "bound";
export type GuardianSubstate = "available" | "engaged" | "unavailable";
export type CellState = "collected" | "known" | "awaiting";
export type CellKind = "charted" | "locked";

// One concept's cell. Geometry is well-local; `crystal` and `bar` are cell-local, so a cell
// renders as a self-contained unit on any surface that hosts a panel.
export type FormationCell = {
  derivedNodeId: string;
  label: string;
  species: CrystalSpecies;
  material: CrystalMaterial;
  growthFraction: number;
  trailState: TrailCluster["state"];
  state: CellState;
  isKnownSkipped: boolean;
  isMilestone: boolean;
  isSummit: boolean;
  // The single study target across the whole formation (server-projected next stop).
  isNext: boolean;
  gist: string | null;
  sectionIndex: number;
  sectionPositionIndex: number;
  kind: CellKind;
  row: number;
  rect: Rect;
  crystal: Rect;
  // Present only on a charted cell: the per-concept growth bar under the crystal.
  bar: Rect | null;
};

export type LegPanelModel = {
  sectionIndex: number;
  milestoneLabel: string;
  structuralState: LegStructuralState;
  // Present exactly when guardian_ready: which honest scope copy the Leg shows.
  guardianSubstate: GuardianSubstate | null;
  recallScope: RecallScopeStatus | null;
  progress: FormationProgress;
  cellKind: CellKind;
  // Canonical intra-Leg order, row-major; cells never overlap.
  cells: FormationCell[];
  rowCount: number;
  // The deeper parchment well the cell grid sits in. Cell rects are relative to this box.
  well: { width: number; height: number };
  // Badge center in panel coordinates: straddling the panel's top edge (y = 0).
  badge: Point;
  // Narrow panels stack the caption's state line above its counts instead of truncating either.
  captionStacked: boolean;
  // Panel outer width; height is flex flow (well + padding + optional Guardian row).
  width: number;
};

// The summit strip that closes the stack. The keystone is seated exactly when the Expedition
// scope carries a durable first victory; the counts feed the honest "seal all n legs" copy.
export type SummitStrip = {
  species: CrystalSpecies;
  keystoneSeated: boolean;
  crystalSize: number;
  legCount: number;
  sealedLegCount: number;
};

export type CrystalFormationLayout = {
  panels: LegPanelModel[];
  summit: SummitStrip | null;
  enrichmentScope: RecallScopeStatus | null;
  // The formation ground's outer width, and the width every panel and the summit strip render at.
  width: number;
  panelWidth: number;
};

export type FormationConceptInput = Pick<
  TrailCluster,
  "derivedNodeId" | "label" | "difficulty" | "state" | "isKnownSkipped" | "sectionIndex" | "sectionPositionIndex" | "growthFraction"
> & { isMilestone: boolean; isSummit: boolean; gist: string | null };

export type FormationSectionInput = Pick<TrailSectionView, "sectionIndex" | "milestoneLabel" | "state" | "recallScope">;

export type FormationInput = {
  concepts: FormationConceptInput[];
  sections: FormationSectionInput[];
  enrichmentScope: RecallScopeStatus | null;
  // The concept owning the server-projected next stop — the ONE cell that reads `next`.
  nextDerivedNodeId: string | null;
};

// The session adapter: the formation reads the SAME trail clusters, scopes, and next stop every
// other surface reads, so growth/binding/target can never drift from the trail.
export function formationInputFrom(session: StudySession, trail: TrailView): FormationInput {
  const stepByNode = new Map(session.expeditionPath.map((step) => [step.derivedNodeId, step] as const));
  return {
    concepts: trail.concepts.map((concept) => ({
      derivedNodeId: concept.derivedNodeId,
      label: concept.label,
      difficulty: concept.difficulty,
      state: concept.state,
      isKnownSkipped: concept.isKnownSkipped,
      sectionIndex: concept.sectionIndex,
      sectionPositionIndex: concept.sectionPositionIndex,
      growthFraction: concept.growthFraction,
      isMilestone: stepByNode.get(concept.derivedNodeId)?.isMilestone ?? false,
      isSummit: stepByNode.get(concept.derivedNodeId)?.isSummit ?? false,
      gist: lessonGist(session, concept.derivedNodeId)
    })),
    sections: trail.sections,
    enrichmentScope: trail.enrichmentScope,
    nextDerivedNodeId: trail.concepts.find((concept) => concept.stops.some((stop) => stop.isNext))?.derivedNodeId ?? null
  };
}

export function buildCrystalFormationLayout(session: StudySession, trail: TrailView, availableWidth: number): CrystalFormationLayout {
  return composeCrystalFormation(formationInputFrom(session, trail), availableWidth);
}

// --- One Leg panel ----------------------------------------------------------------------

// The four structural states map purely from section/scope facts. Binding derives ONLY from the
// durable first-victory identity — complete mastery alone never binds.
export function legStructuralState(
  section: Pick<TrailSectionView, "state">,
  scope: RecallScopeStatus | null
): LegStructuralState {
  if (scope?.wonChallengeId) return "bound";
  if (section.state === "locked") return "future";
  if (section.state === "complete") return "guardian_ready";
  return "collecting";
}

function guardianSubstateFor(scope: RecallScopeStatus | null): GuardianSubstate {
  if (scope?.state === "active") return "engaged";
  if (scope?.state === "available") return "available";
  // No scope, zero eligible items, or a still-locked scope: the honest unavailable copy.
  return "unavailable";
}

function cellStateFor(concept: FormationConceptInput): CellState {
  if (concept.isKnownSkipped) return "known";
  return concept.state === "mastered" ? "collected" : "awaiting";
}

// The material ladder (KTD7/KTD13). A future Leg is fogged stone throughout regardless of
// per-concept state, and known ground stays fogged in every Leg — honest counts, no hue given
// away. Colour never carries this alone: the growth bar and the `Next` chip ride with it.
function cellMaterialFor(
  concept: FormationConceptInput,
  state: CellState,
  structuralState: LegStructuralState,
  isNext: boolean
): CrystalMaterial {
  if (structuralState === "future" || state === "known") return "fogged";
  if (state === "collected") return "collected";
  return isNext ? "next" : "open";
}

export function buildLegPanel(
  section: FormationSectionInput,
  conceptsInput: FormationConceptInput[],
  availableWidth: number,
  nextDerivedNodeId: string | null = null
): LegPanelModel {
  // Canonical intra-Leg order: identical projection inputs render identically across input
  // array ordering — nothing downstream may depend on iteration order.
  const concepts = [...conceptsInput].sort(
    (a, b) => a.sectionPositionIndex - b.sectionPositionIndex || a.derivedNodeId.localeCompare(b.derivedNodeId)
  );
  const structuralState = legStructuralState(section, section.recallScope);
  // KTD8: a future Leg is paved with compact locked cells; every reachable Leg is charted.
  const cellKind: CellKind = structuralState === "future" ? "locked" : "charted";
  const cellSize = cellKind === "charted" ? CHARTED_CELL : LOCKED_CELL;

  const width = Math.max(MIN_PANEL_WIDTH, Math.floor(availableWidth));
  const gridWidth = width - 2 * (PANEL_PAD + WELL_PAD);
  // Row capacity from the real available width: a panel can never exceed its canvas, and a
  // narrow phone reduces cells per row instead of shrinking any crystal (R6/R7).
  const capacity = Math.max(1, Math.floor((gridWidth + CELL_GAP) / (cellSize.width + CELL_GAP)));
  const rowCount = Math.max(1, Math.ceil(concepts.length / capacity));

  const cells: FormationCell[] = concepts.map((concept, index) => {
    const row = Math.floor(index / capacity);
    const inRow = index % capacity;
    // The last row centers: a half-filled final row reads as one deliberate grid, not a
    // left-aligned remainder.
    const rowLength = Math.min(capacity, concepts.length - row * capacity);
    const rowSpan = rowLength * cellSize.width + (rowLength - 1) * CELL_GAP;
    const x = WELL_PAD + (gridWidth - rowSpan) / 2 + inRow * (cellSize.width + CELL_GAP);
    const y = WELL_PAD + row * (cellSize.height + CELL_GAP);
    const state = cellStateFor(concept);
    const isNext = nextDerivedNodeId !== null && concept.derivedNodeId === nextDerivedNodeId;
    return {
      derivedNodeId: concept.derivedNodeId,
      label: concept.label,
      species: crystalForBand(difficultyBand(concept.difficulty)),
      material: cellMaterialFor(concept, state, structuralState, isNext),
      growthFraction: concept.growthFraction,
      trailState: concept.state,
      state,
      isKnownSkipped: concept.isKnownSkipped,
      isMilestone: concept.isMilestone,
      isSummit: concept.isSummit,
      isNext,
      gist: concept.gist,
      sectionIndex: concept.sectionIndex,
      sectionPositionIndex: concept.sectionPositionIndex,
      kind: cellKind,
      row,
      rect: { x: round2(x), y: round2(y), width: cellSize.width, height: cellSize.height },
      ...cellInterior(cellKind)
    };
  });

  return {
    sectionIndex: section.sectionIndex,
    milestoneLabel: section.milestoneLabel,
    structuralState,
    guardianSubstate: structuralState === "guardian_ready" ? guardianSubstateFor(section.recallScope) : null,
    recallScope: section.recallScope,
    progress: formationProgress(concepts),
    cellKind,
    cells,
    rowCount,
    well: {
      width: width - 2 * PANEL_PAD,
      height: rowCount * cellSize.height + (rowCount - 1) * CELL_GAP + 2 * WELL_PAD
    },
    badge: { x: round2(width / 2), y: 0 },
    captionStacked: width < CAPTION_ROW_MIN_WIDTH,
    width
  };
}

// The interior of one cell, in cell-local coordinates: the crystal box, and (charted only) the
// growth bar under it. The reserved chip band below the bar is why a charted cell is taller than
// its crystal — the `Next` chip must not move any neighbour.
function cellInterior(kind: CellKind): Pick<FormationCell, "crystal" | "bar"> {
  if (kind === "locked") {
    const inset = (LOCKED_CELL.width - LOCKED_CRYSTAL_PX) / 2;
    return {
      crystal: { x: round2(inset), y: round2((LOCKED_CELL.height - LOCKED_CRYSTAL_PX) / 2), width: LOCKED_CRYSTAL_PX, height: LOCKED_CRYSTAL_PX },
      bar: null
    };
  }
  const barWidth = CHARTED_CELL.width - 18;
  return {
    crystal: {
      x: round2((CHARTED_CELL.width - CHARTED_CRYSTAL_PX) / 2),
      y: CELL_TOP_PAD,
      width: CHARTED_CRYSTAL_PX,
      height: CHARTED_CRYSTAL_PX
    },
    bar: { x: round2((CHARTED_CELL.width - barWidth) / 2), y: CELL_TOP_PAD + CHARTED_CRYSTAL_PX + BAR_GAP, width: barWidth, height: BAR_HEIGHT }
  };
}

// --- The stack --------------------------------------------------------------------------

export function composeCrystalFormation(input: FormationInput, availableWidth: number): CrystalFormationLayout {
  const canvasWidth = Math.max(MIN_PANEL_WIDTH + STACK_INSET, Math.floor(availableWidth));
  const panelWidth = canvasWidth - STACK_INSET;
  const sections = [...input.sections].sort((a, b) => a.sectionIndex - b.sectionIndex);
  const bySection = new Map<number, FormationConceptInput[]>();
  for (const concept of input.concepts) {
    (bySection.get(concept.sectionIndex) ?? bySection.set(concept.sectionIndex, []).get(concept.sectionIndex)!).push(concept);
  }
  const panels = sections.map((section) =>
    buildLegPanel(section, bySection.get(section.sectionIndex) ?? [], panelWidth, input.nextDerivedNodeId)
  );

  return {
    panels,
    summit: panels.length === 0
      ? null
      : {
          species: "keystone",
          keystoneSeated: Boolean(input.enrichmentScope?.wonChallengeId),
          crystalSize: SUMMIT_CRYSTAL_PX,
          legCount: panels.length,
          sealedLegCount: panels.filter((panel) => panel.structuralState === "bound").length
        },
    enrichmentScope: input.enrichmentScope,
    width: canvasWidth,
    panelWidth
  };
}

// --- Finished Vista selectors -------------------------------------------------------

export type VistaFocus = { kind: "leg"; sectionIndex: number } | { kind: "summit" };
export type VistaRewardKey = `leg:${number}` | "summit";

export function vistaRewardSnapshot(layout: CrystalFormationLayout): VistaRewardKey[] {
  const rewards: VistaRewardKey[] = layout.panels
    .filter((panel) => panel.structuralState === "bound")
    .map((panel) => `leg:${panel.sectionIndex}` as const);
  if (layout.summit?.keystoneSeated) rewards.push("summit");
  return rewards;
}

export function rewardKeyForFocus(focus: VistaFocus): VistaRewardKey {
  return focus.kind === "summit" ? "summit" : `leg:${focus.sectionIndex}`;
}

export function selectVistaFocus(
  layout: CrystalFormationLayout,
  explicitFocus: VistaFocus | null,
  currentSectionIndex: number | null,
  seenBindings: readonly VistaRewardKey[]
): VistaFocus | null {
  if (explicitFocus && focusExists(layout, explicitFocus)) return explicitFocus;
  const seen = new Set(seenBindings);
  if (layout.summit?.keystoneSeated && !seen.has("summit")) return { kind: "summit" };
  const unseenLeg = [...layout.panels]
    .filter((panel) => panel.structuralState === "bound" && !seen.has(`leg:${panel.sectionIndex}`))
    .sort((a, b) => b.sectionIndex - a.sectionIndex)[0];
  if (unseenLeg) return { kind: "leg", sectionIndex: unseenLeg.sectionIndex };
  if (currentSectionIndex !== null && layout.panels.some((panel) => panel.sectionIndex === currentSectionIndex)) {
    return { kind: "leg", sectionIndex: currentSectionIndex };
  }
  return layout.panels[0] ? { kind: "leg", sectionIndex: layout.panels[0].sectionIndex } : layout.summit ? { kind: "summit" } : null;
}

function focusExists(layout: CrystalFormationLayout, focus: VistaFocus): boolean {
  return focus.kind === "summit"
    ? layout.summit !== null
    : layout.panels.some((panel) => panel.sectionIndex === focus.sectionIndex);
}

export function isNameableMineral(cell: Pick<FormationCell, "trailState" | "state" | "isMilestone" | "isSummit">): boolean {
  return cell.state === "collected" || cell.state === "known" || cell.trailState === "frontier" || cell.isMilestone || cell.isSummit;
}

export type FormationMemoryDoor =
  | { kind: "reveal"; derivedNodeId: string; label: string; gist: string | null }
  | { kind: "guarded"; derivedNodeId: string; label: string; legNumber: number };

export function formationMemoryDoorFor(layout: CrystalFormationLayout, selectedNodeId: string | null): FormationMemoryDoor | null {
  if (selectedNodeId === null) return null;
  for (const panel of layout.panels) {
    const cell = panel.cells.find((candidate) => candidate.derivedNodeId === selectedNodeId);
    if (!cell || !isNameableMineral(cell)) continue;
    if (cell.trailState === "locked" && cell.state !== "known") {
      return { kind: "guarded", derivedNodeId: cell.derivedNodeId, label: cell.label, legNumber: cell.sectionIndex + 1 };
    }
    return { kind: "reveal", derivedNodeId: cell.derivedNodeId, label: cell.label, gist: cell.gist };
  }
  return null;
}

function lessonGist(session: StudySession, derivedNodeId: string): string | null {
  const lesson = session.lessonByNode[derivedNodeId];
  if (!lesson || lesson.sections.length === 0) return null;
  return (lesson.sections.find((section) => section.kind === "gist") ?? lesson.sections[0]).text;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
