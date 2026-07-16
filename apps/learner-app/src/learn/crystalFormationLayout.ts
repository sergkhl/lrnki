// Pure two-level Crystal Formation view-model (plan 2026-07-16-002 U2, D2–D6/KTD2).
// Level one: each Leg (milestone-anchored section) packs its concepts into ONE compact
// geode island — a center-out mound with the milestone specimen hero-sized front and
// center, wrapping to raised back rows, under one smooth organic outline with a single
// junction badge anchor. Row capacity derives from the available canvas width, so an
// island can never exceed the viewport. Level two: islands stack on a quiet ascent with
// a small alternating lateral offset, joined by ONE smooth nonsemantic spine curve
// through every junction, each island owning a laid-out header band that can never
// overlap artwork, ending in a distinct summit peak whose apex holds the keystone slot.
// The formation renders NO graph edges — prerequisite structure stays on trail and
// inspection surfaces. No React, no store, no clock — renderers consume finished
// geometry. Structural-state derivations are untouched (KTD3): `bound` still comes only
// from the durable first `wonChallengeId`.

import type { RecallScopeStatus, StudySession, TrailCluster, TrailSectionView, TrailView } from "@lrnki/application/projection";
import { formationProgress, type FormationProgress } from "./mineralSpecimen";

export type Point = { x: number; y: number };

// Scene units are CSS px — the layout packs to the real available width, so renderers
// draw at scale 1 and the old scale-floor/overflow machinery is gone (D3).
// Hero specimen size inside an island; the milestone renders at 1.25×.
export const HERO_SLOT_PX = 64;
export const MILESTONE_SCALE = 1.25;
const SLOT_GAP = 10;
const ISLAND_PAD_X = 18;
const ISLAND_PAD_TOP = 28;
const ISLAND_PAD_BOTTOM = 16;
// Each wrapped row sits this much higher than the one in front of it — the mound.
const ROW_RAISE = 26;
// The header band the layout allocates above each island (two caption lines).
export const HEADER_HEIGHT = 44;
const HEADER_GAP = 8;
const MIN_HEADER_WIDTH = 240;
// Vertical gap between stacked islands and the small alternating lateral offset (D5).
const LEG_GAP = 36;
const ASCENT_OFFSET_X = 24;
export const MIN_ISLAND_WIDTH = 140;
const PEAK_WIDTH = 104;
const PEAK_HEIGHT = 88;
const OUTLINE_SAMPLES = 16;

export type LegStructuralState = "future" | "collecting" | "guardian_ready" | "bound";
export type GuardianSubstate = "available" | "engaged" | "unavailable";
export type SlotState = "collected" | "known" | "awaiting";

export type MineralSlot = {
  derivedNodeId: string;
  label: string;
  difficulty: number;
  sectionIndex: number;
  sectionPositionIndex: number;
  growthFraction: number;
  trailState: TrailCluster["state"];
  state: SlotState;
  isKnownSkipped: boolean;
  isMilestone: boolean;
  isSummit: boolean;
  gist: string | null;
  // Slot center in island-local coordinates; `size` is the specimen's rendered box.
  x: number;
  y: number;
  size: number;
  // Mound row: 0 = front. Slots are emitted in paint order (back rows first).
  row: number;
};

export type LegFormationModel = {
  sectionIndex: number;
  milestoneLabel: string;
  structuralState: LegStructuralState;
  // Present exactly when guardian_ready: which honest scope copy the Leg shows.
  guardianSubstate: GuardianSubstate | null;
  recallScope: RecallScopeStatus | null;
  progress: FormationProgress;
  // Paint order: back rows first, left to right within a row.
  slots: MineralSlot[];
  // ONE smooth organic closed outline (D2) — no bands, seam, veins, or branch.
  outline: Point[];
  // The junction badge anchor at the island's apex; the spine passes through it.
  badge: Point;
  width: number;
  height: number;
};

export type HeaderBand = { x: number; y: number; width: number; height: number };

export type PlacedLeg = LegFormationModel & {
  frame: Point;
  // Header band in formation coordinates, allocated by the layout so labels can never
  // overlap artwork or one another (D-headers).
  header: HeaderBand;
};

export type SpineSegment = {
  fromSectionIndex: number;
  // The next Leg's section index, or null when the segment climbs to the summit peak.
  toSectionIndex: number | null;
  // Sampled points of the one continuous smooth curve (this segment's slice).
  points: Point[];
  // A bound Leg lights its own spine segment gold (D5).
  lit: boolean;
};

export type FormationTerminus = {
  frame: Point;
  width: number;
  height: number;
  // The summit peak silhouette (local coordinates) and the keystone slot at its apex.
  peak: Point[];
  keystone: Point;
  // The keystone is seated exactly when the Expedition scope has a first victory (D6).
  keystoneSeated: boolean;
};

export type CrystalFormationLayout = {
  legs: PlacedLeg[];
  spine: SpineSegment[];
  terminus: FormationTerminus | null;
  enrichmentScope: RecallScopeStatus | null;
  width: number;
  height: number;
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
};

// The session adapter: the formation reads the SAME trail clusters and server-projected
// scopes every other surface reads, so growth/binding can never drift from the trail.
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
    enrichmentScope: trail.enrichmentScope
  };
}

export function buildCrystalFormationLayout(session: StudySession, trail: TrailView, availableWidth: number): CrystalFormationLayout {
  return composeCrystalFormation(formationInputFrom(session, trail), availableWidth);
}

// --- Level one: one island -------------------------------------------------------------

// KTD3: the four structural states map purely from section/scope facts. Binding derives
// ONLY from the durable first-victory identity — complete mastery alone never binds.
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

function slotStateFor(concept: FormationConceptInput): SlotState {
  if (concept.isKnownSkipped) return "known";
  return concept.state === "mastered" ? "collected" : "awaiting";
}

export function buildLegModel(
  section: FormationSectionInput,
  conceptsInput: FormationConceptInput[],
  availableWidth: number
): LegFormationModel {
  // Canonical intra-Leg order: identical projection inputs render identically across
  // input array ordering — nothing downstream may depend on iteration order.
  const concepts = [...conceptsInput].sort(
    (a, b) => a.sectionPositionIndex - b.sectionPositionIndex || a.derivedNodeId.localeCompare(b.derivedNodeId)
  );

  // Center-out mound packing (D3): the milestone specimen sits hero-sized front and
  // center; remaining concepts fill outward left/right in trail order, wrapping to
  // raised back rows when a side reaches the width-derived capacity. The front row is
  // modeled as two side lists around the hero so its centering is exact by construction.
  const heroIndex = Math.max(0, concepts.findIndex((concept) => concept.isMilestone || concept.isSummit));
  const heroSize = Math.round(HERO_SLOT_PX * MILESTONE_SCALE);
  const usable = Math.max(heroSize, availableWidth - 2 * ISLAND_PAD_X);
  type RowEntry = { concept: FormationConceptInput; size: number };
  // Nearest-to-hero first on each side.
  const left: RowEntry[] = [];
  const right: RowEntry[] = [];
  const backRows: RowEntry[][] = [];
  const backRowWidths: number[] = [];
  const sideCapacity = Math.max(0, (usable - heroSize) / 2);
  const sideWidth = (side: RowEntry[]) => side.reduce((sum, entry) => sum + SLOT_GAP + entry.size, 0);
  const pushToBackRows = (entry: RowEntry) => {
    let rowIndex = 0;
    for (;;) {
      const row = backRows[rowIndex] ?? [];
      const width = backRowWidths[rowIndex] ?? 0;
      const next = width === 0 ? entry.size : width + SLOT_GAP + entry.size;
      if (next <= usable || row.length === 0) {
        if (row.length % 2 === 0) row.push(entry);
        else row.unshift(entry);
        backRows[rowIndex] = row;
        backRowWidths[rowIndex] = next;
        return;
      }
      rowIndex += 1;
    }
  };
  if (concepts.length > 0) {
    let sideTurn: "right" | "left" = "right";
    concepts.forEach((concept, index) => {
      if (index === heroIndex) return;
      const entry: RowEntry = { concept, size: HERO_SLOT_PX };
      const preferred = sideTurn === "right" ? right : left;
      const other = sideTurn === "right" ? left : right;
      sideTurn = sideTurn === "right" ? "left" : "right";
      if (sideWidth(preferred) + SLOT_GAP + entry.size <= sideCapacity) preferred.push(entry);
      else if (sideWidth(other) + SLOT_GAP + entry.size <= sideCapacity) other.push(entry);
      else pushToBackRows(entry);
    });
  }

  // The island must hold the hero symmetric: both sides get the wider side's room.
  const frontHalf = concepts.length > 0 ? heroSize / 2 + Math.max(sideWidth(left), sideWidth(right)) : 0;
  const contentWidth = Math.max(2 * frontHalf, ...backRowWidths.map((value) => value));
  const width = Math.min(availableWidth, Math.max(MIN_ISLAND_WIDTH, contentWidth + 2 * ISLAND_PAD_X));
  const tallestBack = Math.max(0, ...backRows.map((row, index) => (index + 1) * ROW_RAISE + Math.max(0, ...row.map((entry) => entry.size))));
  const tallest = Math.max(concepts.length > 0 ? heroSize : 0, tallestBack);
  const frontBaseline = ISLAND_PAD_TOP + tallest;
  const height = Math.max(72, frontBaseline + ISLAND_PAD_BOTTOM);

  // Paint order: back rows first so front-row specimens overlap them like a mound.
  const slots: MineralSlot[] = [];
  const emit = (entry: RowEntry, x: number, baseline: number, row: number) => {
    slots.push({
      derivedNodeId: entry.concept.derivedNodeId,
      label: entry.concept.label,
      difficulty: entry.concept.difficulty,
      sectionIndex: entry.concept.sectionIndex,
      sectionPositionIndex: entry.concept.sectionPositionIndex,
      growthFraction: entry.concept.growthFraction,
      trailState: entry.concept.state,
      state: slotStateFor(entry.concept),
      isKnownSkipped: entry.concept.isKnownSkipped,
      isMilestone: entry.concept.isMilestone,
      isSummit: entry.concept.isSummit,
      gist: entry.concept.gist,
      x: round2(x),
      y: round2(baseline - entry.size / 2),
      size: entry.size,
      row
    });
  };
  for (let backIndex = backRows.length - 1; backIndex >= 0; backIndex -= 1) {
    const row = backRows[backIndex];
    const baseline = frontBaseline - (backIndex + 1) * ROW_RAISE;
    let cursor = (width - backRowWidths[backIndex]) / 2;
    for (const entry of row) {
      emit(entry, cursor + entry.size / 2, baseline, backIndex + 1);
      cursor += entry.size + SLOT_GAP;
    }
  }
  if (concepts.length > 0) {
    let leftEdge = width / 2 - heroSize / 2;
    const leftPlaced: { entry: RowEntry; x: number }[] = [];
    for (const entry of left) {
      leftPlaced.push({ entry, x: leftEdge - SLOT_GAP - entry.size / 2 });
      leftEdge -= SLOT_GAP + entry.size;
    }
    for (const { entry, x } of [...leftPlaced].reverse()) emit(entry, x, frontBaseline, 0);
    emit({ concept: concepts[heroIndex], size: heroSize }, width / 2, frontBaseline, 0);
    let cursor = width / 2 + heroSize / 2;
    for (const entry of right) {
      emit(entry, cursor + SLOT_GAP + entry.size / 2, frontBaseline, 0);
      cursor += SLOT_GAP + entry.size;
    }
  }

  return {
    sectionIndex: section.sectionIndex,
    milestoneLabel: section.milestoneLabel,
    structuralState: legStructuralState(section, section.recallScope),
    guardianSubstate: legStructuralState(section, section.recallScope) === "guardian_ready" ? guardianSubstateFor(section.recallScope) : null,
    recallScope: section.recallScope,
    progress: formationProgress(concepts),
    slots,
    outline: moundOutline(width, height),
    badge: { x: round2(width / 2), y: 6 },
    width,
    height
  };
}

// ONE smooth organic outline (D2): a flat-bottomed dome sampled from a flattened sine —
// deterministic from the island dimensions alone, no jitter, no nested bands.
function moundOutline(width: number, height: number): Point[] {
  const points: Point[] = [{ x: 6, y: height }];
  for (let index = 0; index <= OUTLINE_SAMPLES; index += 1) {
    const angle = (Math.PI * index) / OUTLINE_SAMPLES;
    const x = width / 2 - (width / 2 - 6) * Math.cos(angle);
    const y = height - 4 - (height - 10) * Math.pow(Math.sin(angle), 0.3);
    points.push({ x: round2(x), y: round2(y) });
  }
  points.push({ x: width - 6, y: height });
  return points;
}

// --- Level two: the ascent ------------------------------------------------------------

export function composeCrystalFormation(input: FormationInput, availableWidth: number): CrystalFormationLayout {
  const canvasWidth = Math.max(MIN_ISLAND_WIDTH, availableWidth);
  const sections = [...input.sections].sort((a, b) => a.sectionIndex - b.sectionIndex);
  const bySection = new Map<number, FormationConceptInput[]>();
  for (const concept of input.concepts) {
    (bySection.get(concept.sectionIndex) ?? bySection.set(concept.sectionIndex, []).get(concept.sectionIndex)!).push(concept);
  }
  // Islands pack against the canvas minus the ascent offset so an offset island still
  // fits the viewport (D3/D5).
  const models = sections.map((section) =>
    buildLegModel(section, bySection.get(section.sectionIndex) ?? [], canvasWidth - ASCENT_OFFSET_X)
  );

  const hasTerminus = models.length > 0;
  const terminus: FormationTerminus | null = hasTerminus
    ? {
        frame: { x: round2((canvasWidth - PEAK_WIDTH) / 2), y: 0 },
        width: PEAK_WIDTH,
        height: PEAK_HEIGHT,
        peak: peakSilhouette(PEAK_WIDTH, PEAK_HEIGHT),
        keystone: { x: round2(PEAK_WIDTH / 2), y: 22 },
        keystoneSeated: Boolean(input.enrichmentScope?.wonChallengeId)
      }
    : null;

  // Quiet ascent (D5): canonical section order climbs bottom → top under the peak, each
  // island alternating a small lateral offset, its header band allocated above it.
  let yCursor = hasTerminus ? PEAK_HEIGHT + LEG_GAP : 0;
  const placed: PlacedLeg[] = [];
  for (let index = models.length - 1; index >= 0; index -= 1) {
    const model = models[index];
    const centered = (canvasWidth - model.width) / 2;
    const x = clamp(centered + (index % 2 === 0 ? -ASCENT_OFFSET_X / 2 : ASCENT_OFFSET_X / 2), 0, canvasWidth - model.width);
    const headerWidth = Math.min(canvasWidth, Math.max(model.width, MIN_HEADER_WIDTH));
    const header: HeaderBand = {
      x: round2(clamp(x + model.width / 2 - headerWidth / 2, 0, canvasWidth - headerWidth)),
      y: yCursor,
      width: headerWidth,
      height: HEADER_HEIGHT
    };
    placed.unshift({ ...model, frame: { x: round2(x), y: yCursor + HEADER_HEIGHT + HEADER_GAP }, header });
    yCursor += HEADER_HEIGHT + HEADER_GAP + model.height + LEG_GAP;
  }
  const height = models.length === 0 ? (hasTerminus ? PEAK_HEIGHT : 0) : yCursor - LEG_GAP;

  return {
    legs: placed,
    spine: buildSpine(placed, terminus),
    terminus,
    enrichmentScope: input.enrichmentScope,
    width: canvasWidth,
    height
  };
}

// The summit peak (D6): a small distinct mountain silhouette; the keystone slot sits at
// its apex notch.
function peakSilhouette(width: number, height: number): Point[] {
  const cx = width / 2;
  return [
    { x: 4, y: height },
    { x: round2(width * 0.24), y: round2(height * 0.5) },
    { x: round2(width * 0.38), y: round2(height * 0.62) },
    { x: round2(cx), y: round2(height * 0.18) },
    { x: round2(width * 0.66), y: round2(height * 0.56) },
    { x: round2(width * 0.8), y: round2(height * 0.44) },
    { x: width - 4, y: height }
  ];
}

// ONE continuous smooth curve through every junction badge up to the peak (D5), sampled
// as a Catmull-Rom chain and sliced per Leg so a bound Leg's own segment lights gold.
// Expedition sequence/belonging ONLY — never a graph edge.
function buildSpine(placed: PlacedLeg[], terminus: FormationTerminus | null): SpineSegment[] {
  if (placed.length === 0) return [];
  const junctions: Point[] = placed.map((leg) => ({
    x: leg.frame.x + leg.badge.x,
    y: leg.frame.y + leg.badge.y
  }));
  if (terminus) {
    junctions.push({ x: terminus.frame.x + terminus.keystone.x, y: terminus.frame.y + terminus.height });
  }
  return placed.map((leg, index) => ({
    fromSectionIndex: leg.sectionIndex,
    toSectionIndex: placed[index + 1]?.sectionIndex ?? null,
    points: sampleCatmullRom(junctions, index, 12),
    lit: leg.structuralState === "bound"
  }));
}

// Catmull-Rom sample of chain segment [i, i+1] with clamped endpoints.
function sampleCatmullRom(chain: Point[], segment: number, samples: number): Point[] {
  const p0 = chain[Math.max(0, segment - 1)];
  const p1 = chain[segment];
  const p2 = chain[Math.min(chain.length - 1, segment + 1)];
  const p3 = chain[Math.min(chain.length - 1, segment + 2)];
  const points: Point[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const t2 = t * t;
    const t3 = t2 * t;
    points.push({
      x: round2(
        0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3)
      ),
      y: round2(
        0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3)
      )
    });
  }
  return points;
}

// --- Finished Vista selectors -------------------------------------------------------

export type VistaFocus = { kind: "leg"; sectionIndex: number } | { kind: "summit" };
export type VistaRewardKey = `leg:${number}` | "summit";

export function vistaRewardSnapshot(layout: CrystalFormationLayout): VistaRewardKey[] {
  const rewards: VistaRewardKey[] = layout.legs
    .filter((leg) => leg.structuralState === "bound")
    .map((leg) => `leg:${leg.sectionIndex}` as const);
  if (layout.terminus?.keystoneSeated) rewards.push("summit");
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
  if (layout.terminus?.keystoneSeated && !seen.has("summit")) return { kind: "summit" };
  const unseenLeg = [...layout.legs]
    .filter((leg) => leg.structuralState === "bound" && !seen.has(`leg:${leg.sectionIndex}`))
    .sort((a, b) => b.sectionIndex - a.sectionIndex)[0];
  if (unseenLeg) return { kind: "leg", sectionIndex: unseenLeg.sectionIndex };
  if (currentSectionIndex !== null && layout.legs.some((leg) => leg.sectionIndex === currentSectionIndex)) {
    return { kind: "leg", sectionIndex: currentSectionIndex };
  }
  return layout.legs[0] ? { kind: "leg", sectionIndex: layout.legs[0].sectionIndex } : layout.terminus ? { kind: "summit" } : null;
}

function focusExists(layout: CrystalFormationLayout, focus: VistaFocus): boolean {
  return focus.kind === "summit"
    ? layout.terminus !== null
    : layout.legs.some((leg) => leg.sectionIndex === focus.sectionIndex);
}

export function isNameableMineral(slot: Pick<MineralSlot, "trailState" | "state" | "isMilestone" | "isSummit">): boolean {
  return slot.state === "collected" || slot.state === "known" || slot.trailState === "frontier" || slot.isMilestone || slot.isSummit;
}

export type FormationMemoryDoor =
  | { kind: "reveal"; derivedNodeId: string; label: string; gist: string | null }
  | { kind: "guarded"; derivedNodeId: string; label: string; legNumber: number };

export function formationMemoryDoorFor(layout: CrystalFormationLayout, selectedNodeId: string | null): FormationMemoryDoor | null {
  if (selectedNodeId === null) return null;
  for (const leg of layout.legs) {
    const slot = leg.slots.find((candidate) => candidate.derivedNodeId === selectedNodeId);
    if (!slot || !isNameableMineral(slot)) continue;
    if (slot.trailState === "locked" && slot.state !== "known") {
      return { kind: "guarded", derivedNodeId: slot.derivedNodeId, label: slot.label, legNumber: slot.sectionIndex + 1 };
    }
    return { kind: "reveal", derivedNodeId: slot.derivedNodeId, label: slot.label, gist: slot.gist };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
