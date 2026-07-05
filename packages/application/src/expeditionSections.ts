import type { DerivedGraphDetail, DerivedGraphEdge } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { prerequisiteAncestors, topologicalDepth, topologicalOrder } from "./prerequisiteDag";

// The layer-wide SECTIONED expedition projection (ADR-0032; origin R1–R3, R6). It replaces
// the retired cone-scoped `projectStatefulLearnerPath`: instead of walking one learner-chosen
// target's ancestor cone, it turns the WHOLE floored/contracted Derived Graph Layer into one
// continuous trail broken into milestone-anchored sections, and DERIVES the summit rather than
// reading a persisted target. Pure and deterministic — no store, port, or clock — so it is
// replay-testable with plain data and cannot mutate the graph.
//
// Milestones are TERMINAL concepts: a node with no dependents on the trusted contracted edge
// set (a `prerequisiteDerivedNodeId` that no trusted edge points out of). Isolated nodes are
// singleton milestones; a single-terminal layer is one section.
//
// Section claiming: milestones are ordered ONCE by (mean full-cone difficulty asc, cone size
// asc, label asc) — a pre-claim key, so the order is well-defined before any node is claimed.
// Then, greedily in that order, each section claims all not-yet-claimed trusted ancestors of
// its milestone plus the milestone itself, topologically ordered easiest-first. Because a
// section claims every unclaimed ancestor of its milestone, any prerequisite of a later-section
// node was already claimed by an earlier (or the same) section, so the concatenated path is a
// topological order of the whole floored layer (the validity invariant). The summit is the last
// section's milestone.

export type ExpeditionSectionStep = {
  // Global position across the whole concatenated trail (sections in order).
  position: number;
  derivedNodeId: string;
  difficulty: number;
  topologicalDepth: number;
  state: AdaptedNodeState;
  // True for the derived summit (the last section's milestone) — replaces the retired
  // learner-chosen `isTarget`.
  isSummit: boolean;
  // Which section this stop belongs to (0-based, in trail order).
  sectionIndex: number;
  // Position within the section (0-based).
  sectionPositionIndex: number;
  // The milestone this section is anchored on.
  milestoneDerivedNodeId: string;
  milestoneLabel: string;
  // True when this stop IS its section's milestone (the section's local summit).
  isMilestone: boolean;
};

export type ExpeditionSection = {
  sectionIndex: number;
  milestoneDerivedNodeId: string;
  milestoneLabel: string;
  // The derived node ids claimed by this section, in trail order.
  stepDerivedNodeIds: string[];
  // Mean difficulty over the claimed stops (0 when empty — cannot happen, a section always
  // holds at least its milestone).
  meanDifficulty: number;
};

export type SectionedExpedition = {
  steps: ExpeditionSectionStep[];
  sections: ExpeditionSection[];
  // The last section's milestone, or null on an empty floored layer.
  summit: { derivedNodeId: string; label: string } | null;
};

type SectioningDetail = Pick<DerivedGraphDetail, "nodes" | "edges">;

function trustedEdges(edges: DerivedGraphEdge[]): DerivedGraphEdge[] {
  return edges.filter((edge) => !edge.uncertain);
}

// Terminal nodes on the trusted contracted edge set: a node no trusted edge points OUT of.
// Isolated nodes qualify (singleton milestones). Deterministically sorted by id.
function milestoneNodeIds(nodeIds: string[], edges: DerivedGraphEdge[]): string[] {
  const hasDependent = new Set(edges.map((edge) => edge.prerequisiteDerivedNodeId));
  return nodeIds.filter((id) => !hasDependent.has(id)).sort((a, b) => a.localeCompare(b));
}

// Project the floored/contracted layer into an ordered set of milestone-anchored sections and a
// derived summit. `detail` is ALREADY floored and contracted by `applyDifficultyFloor`; this
// module trusts (filters out uncertain) but does no further pruning.
export function projectExpeditionSections(input: {
  detail: SectioningDetail;
  stateByNode: Record<string, AdaptedNodeState>;
}): SectionedExpedition {
  const nodeIds = input.detail.nodes.map((node) => node.derivedNodeId);
  const edges = trustedEdges(input.detail.edges);
  const difficultyOf = new Map(input.detail.nodes.map((node) => [node.derivedNodeId, node.difficulty ?? 0] as const));
  const labelOf = new Map(input.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const depthByNode = topologicalDepth(nodeIds, edges);
  const byDifficultyThenId = (a: string, b: string): number =>
    (difficultyOf.get(a) ?? 0) - (difficultyOf.get(b) ?? 0) || a.localeCompare(b);

  // Pre-claim milestone order: mean difficulty over the milestone's full trusted cone
  // (ancestors ∪ itself) ascending, then cone size ascending, then label — a stable key that
  // does not depend on the greedy claiming below.
  const milestones = milestoneNodeIds(nodeIds, edges).map((milestoneId) => {
    const cone = prerequisiteAncestors(milestoneId, edges);
    cone.add(milestoneId);
    const coneIds = [...cone];
    const meanConeDifficulty = coneIds.reduce((sum, id) => sum + (difficultyOf.get(id) ?? 0), 0) / coneIds.length;
    return { milestoneId, coneSize: cone.size, meanConeDifficulty };
  });
  milestones.sort(
    (a, b) =>
      a.meanConeDifficulty - b.meanConeDifficulty ||
      a.coneSize - b.coneSize ||
      (labelOf.get(a.milestoneId) ?? a.milestoneId).localeCompare(labelOf.get(b.milestoneId) ?? b.milestoneId) ||
      a.milestoneId.localeCompare(b.milestoneId)
  );

  const claimed = new Set<string>();
  const sections: ExpeditionSection[] = [];
  const steps: ExpeditionSectionStep[] = [];
  const summitId = milestones.length > 0 ? milestones[milestones.length - 1].milestoneId : null;

  for (const { milestoneId } of milestones) {
    const cone = prerequisiteAncestors(milestoneId, edges);
    cone.add(milestoneId);
    const unclaimed = [...cone].filter((id) => !claimed.has(id));
    if (unclaimed.length === 0) continue; // fully absorbed by an earlier section (shared sink)
    const withinEdges = edges.filter((edge) => cone.has(edge.prerequisiteDerivedNodeId) && cone.has(edge.dependentDerivedNodeId));
    // Order the unclaimed cone subset topologically (easiest ready node first). Restrict the
    // Kahn seed to the unclaimed subset by passing only those ids; edges to already-claimed
    // prerequisites are dropped since those nodes are absent from this section's node set.
    const unclaimedSet = new Set(unclaimed);
    const withinUnclaimedEdges = withinEdges.filter((edge) => unclaimedSet.has(edge.prerequisiteDerivedNodeId) && unclaimedSet.has(edge.dependentDerivedNodeId));
    const order = topologicalOrder(unclaimed, withinUnclaimedEdges, byDifficultyThenId);

    const sectionIndex = sections.length;
    const stepDerivedNodeIds: string[] = [];
    order.forEach((derivedNodeId, sectionPositionIndex) => {
      claimed.add(derivedNodeId);
      stepDerivedNodeIds.push(derivedNodeId);
      steps.push({
        position: steps.length,
        derivedNodeId,
        difficulty: difficultyOf.get(derivedNodeId) ?? 0,
        topologicalDepth: depthByNode.get(derivedNodeId) ?? 0,
        state: input.stateByNode[derivedNodeId] ?? "locked",
        isSummit: derivedNodeId === summitId,
        sectionIndex,
        sectionPositionIndex,
        milestoneDerivedNodeId: milestoneId,
        milestoneLabel: labelOf.get(milestoneId) ?? milestoneId,
        isMilestone: derivedNodeId === milestoneId
      });
    });
    const meanDifficulty = stepDerivedNodeIds.reduce((sum, id) => sum + (difficultyOf.get(id) ?? 0), 0) / stepDerivedNodeIds.length;
    sections.push({ sectionIndex, milestoneDerivedNodeId: milestoneId, milestoneLabel: labelOf.get(milestoneId) ?? milestoneId, stepDerivedNodeIds, meanDifficulty });
  }

  const summit = summitId ? { derivedNodeId: summitId, label: labelOf.get(summitId) ?? summitId } : null;
  return { steps, sections, summit };
}

// The trail scope shared by the expedition-entry surfaces and the projection (rule 18 — ONE
// scope definition). Applies the difficulty floor to a raw layer detail and derives the summit
// and section skeleton with no learner state (summit/sections do not depend on it). The floored
// `trailNodeIds` are exactly the nodes that become trail stops — every learner-facing count
// (U4) and every expedition title (U3) reads from this, so counts never drift from the trail.
export function deriveFlooredExpedition(detail: Pick<DerivedGraphDetail, "nodes" | "edges">): {
  summit: { derivedNodeId: string; label: string } | null;
  sections: ExpeditionSection[];
  trailNodeIds: Set<string>;
} {
  const floor = applyDifficultyFloor({
    nodes: detail.nodes.map((node) => ({
      derivedNodeId: node.derivedNodeId,
      difficultyBand: node.difficultyBand ?? null,
      difficultyContested: node.difficultyContested ?? null
    })),
    edges: detail.edges
  });
  const trailNodes = detail.nodes.filter((node) => floor.includedNodeIds.has(node.derivedNodeId));
  const { summit, sections } = projectExpeditionSections({ detail: { nodes: trailNodes, edges: floor.contractedEdges }, stateByNode: {} });
  return { summit, sections, trailNodeIds: floor.includedNodeIds };
}
