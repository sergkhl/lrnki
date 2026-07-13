import type { StudySession } from "@lrnki/application/projection";
import { layoutSphereGrid } from "@lrnki/application/projection";
import type { TrailView } from "@lrnki/application/projection";

// The Crystal Vista's data seam. The vista renders a LIST of formations so extending
// from "current expedition" to "all expeditions" later is a loader change (compose more
// formations), not a component change. Today the list holds one.
export type CrystalFormationNode = {
  derivedNodeId: string;
  label: string;
  domain: string;
  difficulty: number;
  state: "locked" | "frontier" | "mastered";
  growthFraction: number;
  sectionIndex: number;
  isKnownSkipped: boolean;
  // Memory-door payload (plan 2026-07-10-001 U3): the lesson gist shown on a revealed
  // crystal's card; null when the node has no lesson.
  gist: string | null;
  // Announced-goal flags (design decision 3): a milestone or summit crystal stays
  // nameable even in fog — it IS the announced goal.
  isMilestone: boolean;
  isSummit: boolean;
};

export type CrystalFormation = {
  title: string;
  nodes: CrystalFormationNode[];
  edges: { source: string; target: string; uncertain: boolean }[];
};

// One formation node placed on the vista canvas (y already inverted: bedrock at the
// bottom, so the formation grows upward as mastery deepens).
export type PlacedCrystal = CrystalFormationNode & { x: number; y: number };

export type PlacedFormation = {
  title: string;
  crystals: PlacedCrystal[];
  veins: { key: string; uncertain: boolean; points: { x: number; y: number }[] }[];
  viewBox: { x: number; y: number; width: number; height: number };
};

// How tall a crystal renders above its bedrock anchor, in layout units. Slightly under
// the sphere-grid cell (130) so neighbors never collide.
export const VISTA_CRYSTAL_SIZE = 110;
const MARGIN_X = 80;
const MARGIN_TOP = VISTA_CRYSTAL_SIZE + 30;
const MARGIN_BOTTOM = 40;

// The vista reads the SAME trail clusters every other surface reads, so a crystal's
// growth here can never drift from its trail capstone (one completion rule).
export function buildCrystalFormation(session: StudySession, trail: TrailView): CrystalFormation {
  const domainByNode = new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.declaredDomain] as const));
  const stepByNode = new Map(session.expeditionPath.map((step) => [step.derivedNodeId, step] as const));
  const onTrail = new Set(trail.concepts.map((concept) => concept.derivedNodeId));
  return {
    title: session.target.label,
    nodes: trail.concepts.map((concept) => ({
      derivedNodeId: concept.derivedNodeId,
      label: concept.label,
      domain: domainByNode.get(concept.derivedNodeId) ?? "",
      difficulty: concept.difficulty,
      state: concept.isKnownSkipped ? "locked" : concept.state,
      growthFraction: concept.isKnownSkipped ? 0 : concept.growthFraction,
      sectionIndex: concept.sectionIndex,
      isKnownSkipped: concept.isKnownSkipped,
      gist: lessonGist(session, concept.derivedNodeId),
      isMilestone: stepByNode.get(concept.derivedNodeId)?.isMilestone ?? false,
      isSummit: stepByNode.get(concept.derivedNodeId)?.isSummit ?? false
    })),
    edges: session.detail.edges
      .filter((edge) => onTrail.has(edge.prerequisiteDerivedNodeId) && onTrail.has(edge.dependentDerivedNodeId))
      .map((edge) => ({ source: edge.prerequisiteDerivedNodeId, target: edge.dependentDerivedNodeId, uncertain: edge.uncertain }))
  };
}

// Position a formation with the sphere-grid layout (topology-true, provably
// crossing-free per loop) and flip y so prerequisite roots sit on the bedrock.
export function placeFormation(formation: CrystalFormation): PlacedFormation {
  const layout = layoutSphereGrid(
    formation.nodes.map((node) => ({ id: node.derivedNodeId, label: node.label, domain: node.domain, difficulty: node.difficulty })),
    formation.edges
  );
  const nodeById = new Map(formation.nodes.map((node) => [node.derivedNodeId, node] as const));
  const maxY = Math.max(0, ...layout.positions.map((position) => position.y));
  const flip = (y: number) => maxY - y;

  const crystals = layout.positions
    .map((position) => {
      const node = nodeById.get(position.id);
      return node ? { ...node, x: position.x, y: flip(position.y) } : null;
    })
    .filter((crystal): crystal is PlacedCrystal => crystal !== null);

  const veins = layout.routes.map((route) => ({
    key: `${route.source}->${route.target}`,
    uncertain: formation.edges.find((edge) => edge.source === route.source && edge.target === route.target)?.uncertain ?? false,
    points: route.points.map((point) => ({ x: point.x, y: flip(point.y) }))
  }));

  const xs = crystals.map((crystal) => crystal.x);
  const ys = crystals.map((crystal) => crystal.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxYFlipped = ys.length ? Math.max(...ys) : 0;

  return {
    title: formation.title,
    crystals,
    veins,
    viewBox: {
      x: minX - MARGIN_X,
      y: minY - MARGIN_TOP,
      width: maxX - minX + MARGIN_X * 2,
      height: maxYFlipped - minY + MARGIN_TOP + MARGIN_BOTTOM
    }
  };
}

// Tiered fog-naming rule (plan 2026-07-10-001 design decision 3): a crystal is nameable
// while fogged EXACTLY when it is an announced goal — the summit and leg milestones.
// Mastered crystals, known-ghosts, and the frontier are always nameable; ordinary locked
// crystals stay unnamed mystery shapes.
export function isNameableCrystal(
  crystal: Pick<CrystalFormationNode, "state" | "isKnownSkipped" | "isMilestone" | "isSummit">
): boolean {
  if (crystal.state === "mastered" || crystal.isKnownSkipped || crystal.state === "frontier") return true;
  return crystal.isMilestone || crystal.isSummit;
}

// The memory door's card model (U3, R4): a revealed crystal opens name + gist + Examine
// (review navigation back to that trail stop); a fogged announced-goal crystal opens the
// guarded variant — name + the leg guarding it, no gist. Null when nothing is selected or
// the crystal is an unnamed mystery shape.
export type MemoryDoorCard =
  | { kind: "reveal"; derivedNodeId: string; label: string; gist: string | null }
  | { kind: "guarded"; derivedNodeId: string; label: string; legNumber: number };

export function memoryDoorFor(formation: CrystalFormation, selectedNodeId: string | null): MemoryDoorCard | null {
  if (selectedNodeId === null) return null;
  const crystal = formation.nodes.find((candidate) => candidate.derivedNodeId === selectedNodeId);
  if (!crystal || !isNameableCrystal(crystal)) return null;
  if (crystal.state === "locked" && !crystal.isKnownSkipped) {
    return { kind: "guarded", derivedNodeId: crystal.derivedNodeId, label: crystal.label, legNumber: crystal.sectionIndex + 1 };
  }
  return { kind: "reveal", derivedNodeId: crystal.derivedNodeId, label: crystal.label, gist: crystal.gist };
}

// The lesson gist for a node's memory-door card: the gist section when the lesson has
// one, else its first section's text. Null when no lesson rode down.
function lessonGist(session: StudySession, derivedNodeId: string): string | null {
  const lesson = session.lessonByNode[derivedNodeId];
  if (!lesson || lesson.sections.length === 0) return null;
  const gist = lesson.sections.find((section) => section.kind === "gist") ?? lesson.sections[0];
  return gist.text;
}

// The sections whose every concept is mastered — the vista celebrates when this set
// gains a member (derived from the same nodes, so it cannot drift from the overview).
export function completeSectionIndexes(formation: CrystalFormation): number[] {
  const bySection = new Map<number, CrystalFormationNode[]>();
  for (const node of formation.nodes) {
    (bySection.get(node.sectionIndex) ?? bySection.set(node.sectionIndex, []).get(node.sectionIndex)!).push(node);
  }
  return [...bySection.entries()]
    .filter(([, nodes]) => nodes.every((node) => node.state === "mastered"))
    .map(([sectionIndex]) => sectionIndex)
    .sort((a, b) => a - b);
}
