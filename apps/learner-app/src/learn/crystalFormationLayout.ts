// Pure two-level Crystal Formation view-model (plan 2026-07-15-002 U2). Level one: each
// Leg (milestone-anchored section) runs the shared application Sphere Grid independently
// with one constant local domain and ONLY trusted same-Leg prerequisite edges (R9), then
// normalizes the lattice into a Leg-local scene with mineral slots, exact veins, an
// irregular matrix contour, a seam, and one structural state derived purely from the
// existing projection (R6). Level two: Leg frames pack on a deterministic alternating
// vertical ascent joined by a nonsemantic winding spine and ending in a distinct summit
// terminus (R1/R11). No React, no store, no clock — renderers consume finished geometry.

import type { RecallScopeStatus, StudySession, TrailCluster, TrailSectionView, TrailView } from "@lrnki/application/projection";
import { layoutSphereGrid } from "@lrnki/application/projection";
import {
  MIN_SPECIMEN_PX,
  formationProgress,
  hashSeed,
  mineralHabitFor,
  mulberry32,
  type FormationProgress,
  type MineralHabit
} from "./mineralSpecimen";

export type Point = { x: number; y: number };

// Scene units are CSS px at scale 1. A slot renders its specimen at SLOT_SIZE; width
// fitting may shrink a Leg down to MIN_SPECIMEN_PX / SLOT_SIZE but never further (R5).
export const SLOT_SIZE = 48;
// Distance between adjacent lattice slot centers (the Sphere Grid's 130-px cell scaled
// into scene units).
export const LATTICE_SPACING = 76;
// Between a slot's outer edge and the matrix contour. Contour jitter stays inside
// CONTOUR_JITTER_MAX so the matrix provably contains every slot bound.
export const MATRIX_PAD = 34;
const CONTOUR_JITTER_MAX = 10;
// Vertical gap between packed Leg frames and the lateral winding offset of the ascent.
const LEG_GAP = 56;
const WIND_X = 28;
const TERMINUS_WIDTH = 120;
const TERMINUS_HEIGHT = 96;
const SPHERE_GRID_CELL = 130;

export type LegStructuralState = "future" | "collecting" | "guardian_ready" | "bound";
export type GuardianSubstate = "available" | "engaged" | "unavailable";
export type SlotState = "collected" | "known" | "awaiting";

export type MineralSlot = {
  derivedNodeId: string;
  label: string;
  habit: MineralHabit;
  sectionIndex: number;
  sectionPositionIndex: number;
  growthFraction: number;
  state: SlotState;
  isKnownSkipped: boolean;
  isMilestone: boolean;
  isSummit: boolean;
  // Slot center in Leg-local scene coordinates (bedrock at the bottom).
  x: number;
  y: number;
};

export type LegVein = {
  source: string;
  target: string;
  points: Point[];
};

export type LegFormationModel = {
  sectionIndex: number;
  milestoneLabel: string;
  structuralState: LegStructuralState;
  // Present exactly when guardian_ready: which honest scope copy the Leg shows (R7).
  guardianSubstate: GuardianSubstate | null;
  recallScope: RecallScopeStatus | null;
  progress: FormationProgress;
  slots: MineralSlot[];
  // Exact intra-Leg prerequisite veins (trusted edges only). Empty when omitted.
  veins: LegVein[];
  // True when the Leg's own embedding crossed and the exact overlay is suppressed (R10):
  // the geode branch, minerals, state, and progress stay; only the semantic overlay goes.
  veinsOmitted: boolean;
  // Diagnostic for tests/development — never rendered to the learner.
  crossings: number;
  // Irregular layered matrix contour around the slots, Leg-local, closed polygon.
  matrix: Point[];
  // The cavity seam along the top opening; bound Legs render it sealed.
  seam: Point[];
  // Where the winding spine enters this Leg (top center, Leg-local).
  junction: Point;
  width: number;
  height: number;
};

export type PlacedLeg = LegFormationModel & { frame: Point };

export type SpineSegment = {
  fromSectionIndex: number;
  // The next Leg's section index, or null when the segment climbs to the terminus.
  toSectionIndex: number | null;
  points: Point[];
  // A bound Leg lights its own spine segment (R7).
  lit: boolean;
};

export type FormationTerminus = {
  frame: Point;
  width: number;
  height: number;
  matrix: Point[];
  // The golden crown exists exactly when the Expedition scope has a first victory (R3).
  crowned: boolean;
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
> & { isMilestone: boolean; isSummit: boolean };

export type FormationSectionInput = Pick<TrailSectionView, "sectionIndex" | "milestoneLabel" | "state" | "recallScope">;

export type FormationEdgeInput = { source: string; target: string; uncertain: boolean };

export type FormationInput = {
  concepts: FormationConceptInput[];
  sections: FormationSectionInput[];
  edges: FormationEdgeInput[];
  enrichmentScope: RecallScopeStatus | null;
};

// The session adapter: the formation reads the SAME trail clusters and server-projected
// scopes every other surface reads, so growth/binding can never drift from the trail.
export function formationInputFrom(session: StudySession, trail: TrailView): FormationInput {
  const stepByNode = new Map(session.expeditionPath.map((step) => [step.derivedNodeId, step] as const));
  const onTrail = new Set(trail.concepts.map((concept) => concept.derivedNodeId));
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
      isSummit: stepByNode.get(concept.derivedNodeId)?.isSummit ?? false
    })),
    sections: trail.sections,
    edges: session.detail.edges
      .filter((edge) => onTrail.has(edge.prerequisiteDerivedNodeId) && onTrail.has(edge.dependentDerivedNodeId))
      .map((edge) => ({ source: edge.prerequisiteDerivedNodeId, target: edge.dependentDerivedNodeId, uncertain: edge.uncertain })),
    enrichmentScope: trail.enrichmentScope
  };
}

export function buildCrystalFormationLayout(session: StudySession, trail: TrailView): CrystalFormationLayout {
  return composeCrystalFormation(formationInputFrom(session, trail));
}

// --- Level one: one Leg -------------------------------------------------------------

// R6: the four structural states map purely from section/scope facts. Binding derives
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
  edges: FormationEdgeInput[]
): LegFormationModel {
  // Canonical intra-Leg order: identical projection inputs render identically across
  // input array ordering (R13) — nothing downstream may depend on iteration order.
  const concepts = [...conceptsInput].sort(
    (a, b) => a.sectionPositionIndex - b.sectionPositionIndex || a.derivedNodeId.localeCompare(b.derivedNodeId)
  );
  const legIds = new Set(concepts.map((concept) => concept.derivedNodeId));
  // R9: only trusted edges with BOTH endpoints in this Leg enter the reward composition;
  // uncertain and cross-Leg edges stay on their canonical inspection surfaces.
  const legEdges = edges.filter((edge) => !edge.uncertain && legIds.has(edge.source) && legIds.has(edge.target));
  const layout = layoutSphereGrid(
    concepts.map((concept) => ({
      id: concept.derivedNodeId,
      label: concept.label,
      // One constant Leg-local domain (R9): the Sphere Grid sees a single loop.
      domain: "leg",
      difficulty: concept.difficulty
    })),
    legEdges
  );

  // Normalize the lattice into Leg-local scene coordinates: scale the grid cell to the
  // scene spacing, flip y so prerequisite roots sit on the bedrock, translate to origin,
  // then inset by the matrix pad plus half a slot.
  const scale = LATTICE_SPACING / SPHERE_GRID_CELL;
  const maxLayoutY = Math.max(0, ...layout.positions.map((position) => position.y));
  const raw = new Map(
    layout.positions.map((position) => [position.id, { x: position.x * scale, y: (maxLayoutY - position.y) * scale }] as const)
  );
  const minX = Math.min(0, ...[...raw.values()].map((point) => point.x));
  const minY = Math.min(0, ...[...raw.values()].map((point) => point.y));
  const inset = MATRIX_PAD + SLOT_SIZE / 2;
  const place = (point: Point): Point => ({ x: point.x - minX + inset, y: point.y - minY + inset });

  const slots: MineralSlot[] = concepts.map((concept) => {
    const point = place(raw.get(concept.derivedNodeId) ?? { x: 0, y: 0 });
    return {
      derivedNodeId: concept.derivedNodeId,
      label: concept.label,
      habit: mineralHabitFor(concept),
      sectionIndex: concept.sectionIndex,
      sectionPositionIndex: concept.sectionPositionIndex,
      growthFraction: concept.growthFraction,
      state: slotStateFor(concept),
      isKnownSkipped: concept.isKnownSkipped,
      isMilestone: concept.isMilestone,
      isSummit: concept.isSummit,
      x: point.x,
      y: point.y
    };
  });

  const spanX = Math.max(0, ...[...raw.values()].map((point) => point.x)) - minX;
  const spanY = Math.max(0, ...[...raw.values()].map((point) => point.y)) - minY;
  const width = spanX + 2 * inset;
  const height = spanY + 2 * inset;

  // R10/A6: a flagged Leg keeps everything readable and drops ONLY the exact semantic
  // overlay — a known tangle is never drawn.
  const veinsOmitted = layout.crossings > 0;
  const veins: LegVein[] = veinsOmitted
    ? []
    : layout.routes
        .map((route) => ({
          source: route.source,
          target: route.target,
          points: route.points.map((point) => place({ x: point.x * scale, y: (maxLayoutY - point.y) * scale }))
        }))
        .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return {
    sectionIndex: section.sectionIndex,
    milestoneLabel: section.milestoneLabel,
    structuralState: legStructuralState(section, section.recallScope),
    guardianSubstate: legStructuralState(section, section.recallScope) === "guardian_ready" ? guardianSubstateFor(section.recallScope) : null,
    recallScope: section.recallScope,
    progress: formationProgress(concepts),
    slots,
    veins,
    veinsOmitted,
    crossings: layout.crossings,
    matrix: matrixContour(width, height, section.sectionIndex),
    seam: seamPath(width, section.sectionIndex),
    junction: { x: width / 2, y: 0 },
    width,
    height
  };
}

// A deterministic irregular geode contour: vertices walk the frame rectangle with a
// small inward jitter seeded by the section, capped at CONTOUR_JITTER_MAX so the matrix
// always contains every slot bound (slots sit at least MATRIX_PAD inside the frame).
function matrixContour(width: number, height: number, sectionIndex: number): Point[] {
  const random = mulberry32(hashSeed(`matrix:${sectionIndex}`));
  const jitter = () => random() * CONTOUR_JITTER_MAX;
  const perSide = 3;
  const points: Point[] = [];
  for (let i = 0; i < perSide; i += 1) points.push({ x: (width * (i + 0.5)) / perSide, y: jitter() });
  for (let i = 0; i < perSide; i += 1) points.push({ x: width - jitter(), y: (height * (i + 0.5)) / perSide });
  for (let i = perSide - 1; i >= 0; i -= 1) points.push({ x: (width * (i + 0.5)) / perSide, y: height - jitter() });
  for (let i = perSide - 1; i >= 0; i -= 1) points.push({ x: jitter(), y: (height * (i + 0.5)) / perSide });
  return points.map((point) => ({ x: round2(point.x), y: round2(point.y) }));
}

// The cavity seam across the top opening, dipping toward the middle. Rendering decides
// open (collecting/guardian_ready) versus sealed (bound); geometry is state-free.
function seamPath(width: number, sectionIndex: number): Point[] {
  const random = mulberry32(hashSeed(`seam:${sectionIndex}`));
  const dip = 10 + random() * 8;
  return [
    { x: round2(width * 0.12), y: round2(2 + random() * 4) },
    { x: round2(width * (0.35 + random() * 0.1)), y: round2(dip) },
    { x: round2(width * (0.55 + random() * 0.1)), y: round2(dip * 0.7) },
    { x: round2(width * 0.88), y: round2(2 + random() * 4) }
  ];
}

// --- Level two: the ascent ------------------------------------------------------------

export function composeCrystalFormation(input: FormationInput): CrystalFormationLayout {
  const sections = [...input.sections].sort((a, b) => a.sectionIndex - b.sectionIndex);
  const bySection = new Map<number, FormationConceptInput[]>();
  for (const concept of input.concepts) {
    (bySection.get(concept.sectionIndex) ?? bySection.set(concept.sectionIndex, []).get(concept.sectionIndex)!).push(concept);
  }
  const models = sections.map((section) => buildLegModel(section, bySection.get(section.sectionIndex) ?? [], input.edges));

  const hasTerminus = models.length > 0;
  const maxLegWidth = Math.max(TERMINUS_WIDTH, ...models.map((model) => model.width));
  const canvasWidth = maxLegWidth + WIND_X;

  // Deterministic alternating ascent (R11): canonical section order climbs bottom → top,
  // frames swinging left/right so the spine visibly winds. Frames never overlap: each
  // occupies its own exclusive vertical band separated by LEG_GAP.
  let yCursor = hasTerminus ? TERMINUS_HEIGHT + LEG_GAP : 0;
  const placed: PlacedLeg[] = [];
  for (let i = models.length - 1; i >= 0; i -= 1) {
    const model = models[i];
    const x = i % 2 === 0 ? 0 : canvasWidth - model.width;
    placed.unshift({ ...model, frame: { x, y: yCursor } });
    yCursor += model.height + LEG_GAP;
  }
  const height = models.length === 0 ? (hasTerminus ? TERMINUS_HEIGHT : 0) : yCursor - LEG_GAP;

  const terminus: FormationTerminus | null = hasTerminus
    ? {
        frame: { x: (canvasWidth - TERMINUS_WIDTH) / 2, y: 0 },
        width: TERMINUS_WIDTH,
        height: TERMINUS_HEIGHT,
        matrix: matrixContour(TERMINUS_WIDTH, TERMINUS_HEIGHT, -1),
        crowned: Boolean(input.enrichmentScope?.wonChallengeId)
      }
    : null;

  // The winding spine (R1/R9): Expedition sequence/belonging ONLY — never a graph edge.
  // Each Leg owns the segment climbing out of its junction toward the next island (or
  // the terminus), lit exactly when that Leg is bound.
  const spine: SpineSegment[] = placed.map((leg, index) => {
    const from: Point = { x: leg.frame.x + leg.junction.x, y: leg.frame.y + leg.junction.y };
    const next = placed[index + 1] ?? null;
    const to: Point = next
      ? { x: next.frame.x + next.junction.x, y: next.frame.y + next.height }
      : { x: terminus!.frame.x + terminus!.width / 2, y: terminus!.frame.y + terminus!.height };
    const midX = index % 2 === 0 ? Math.min(from.x, to.x) - WIND_X / 2 : Math.max(from.x, to.x) + WIND_X / 2;
    return {
      fromSectionIndex: leg.sectionIndex,
      toSectionIndex: next?.sectionIndex ?? null,
      points: [from, { x: round2(midX), y: round2((from.y + to.y) / 2) }, to],
      lit: leg.structuralState === "bound"
    };
  });

  return { legs: placed, spine, terminus, enrichmentScope: input.enrichmentScope, width: canvasWidth, height };
}

// --- Width fitting (R5/KTD3) ----------------------------------------------------------

export type LegWidthFit = {
  // Uniform scale applied to the whole Leg scene; specimens render at SLOT_SIZE * scale.
  scale: number;
  // True when even the minimum readable scale exceeds the available width: the Leg
  // scrolls horizontally inside its own scene instead of shrinking further.
  horizontalOverflow: boolean;
};

export function fitLegWidth(naturalWidth: number, availableWidth: number): LegWidthFit {
  const minScale = MIN_SPECIMEN_PX / SLOT_SIZE;
  if (naturalWidth <= 0 || naturalWidth <= availableWidth) return { scale: 1, horizontalOverflow: false };
  const scale = availableWidth / naturalWidth;
  if (scale >= minScale) return { scale: round2(scale), horizontalOverflow: false };
  return { scale: minScale, horizontalOverflow: true };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
