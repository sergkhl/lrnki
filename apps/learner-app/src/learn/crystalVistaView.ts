import type { StudySession } from "@lrnki/application/projection";
import { layoutSphereGrid } from "@lrnki/application/projection";
import type { TrailView } from "./trailView";

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
      isKnownSkipped: concept.isKnownSkipped
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

// Tap-to-name (task 8): mastered crystals and known-ghosts answer "which concept is
// that?"; fogged/frontier crystals stay unnamed mystery shapes. View-only holds
// (ADR-0032) — naming navigates nowhere.
export function isNameableCrystal(crystal: Pick<CrystalFormationNode, "state" | "isKnownSkipped">): boolean {
  return crystal.state === "mastered" || crystal.isKnownSkipped;
}

export type CrystalLabelChip = { derivedNodeId: string; label: string; x: number; y: number; width: number };

// One floating label chip anchored above the selected crystal, in formation
// coordinates so it pans and scales with the canvas. Returns null when nothing is
// selected or the selected crystal is not nameable.
export function labelChipFor(formation: PlacedFormation, selectedNodeId: string | null): CrystalLabelChip | null {
  if (selectedNodeId === null) return null;
  const crystal = formation.crystals.find((candidate) => candidate.derivedNodeId === selectedNodeId);
  if (!crystal || !isNameableCrystal(crystal)) return null;
  return {
    derivedNodeId: crystal.derivedNodeId,
    label: crystal.label,
    x: crystal.x,
    // Float just above the crystal's box (the glyph's top sits VISTA_CRYSTAL_SIZE
    // above the bedrock anchor at 95% of the box).
    y: crystal.y - VISTA_CRYSTAL_SIZE * 0.95 - 14,
    // SVG has no auto-sized rects; a monospace-ish estimate keeps the chip snug.
    width: crystal.label.length * 7.5 + 20
  };
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
