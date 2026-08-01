import type { DerivedGraphDetail, DerivedGraphEdge } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { prerequisiteAncestors, topologicalDepth, topologicalOrder } from "./prerequisiteDag";
import { SECTION_LINEUP_MAX } from "./recallLineupBudget";

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
//
// Legs are then a BOUNDARY PARTITION over that fixed trail order (plan 2026-07-31-003 KTD1):
// claiming emits the order, and exactly two edits — split, then merge — may insert or delete a
// boundary within it. Neither re-claims a cone, reorders a stop, or moves the summit, so
// topological validity is inherited rather than re-proved (KTD9). Split runs first so the merge
// always has the last word and can guarantee every emitted Leg is winnable.

export type ExpeditionSectionStep = {
  // Global position across the whole concatenated trail (sections in order).
  position: number;
  derivedNodeId: string;
  difficulty: number;
  topologicalDepth: number;
  state: AdaptedNodeState;
  // True for the derived summit (the last section's milestone). There is no persisted
  // expedition target (ADR-0032) — the summit is derived, never chosen.
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
  // Whether any stop in this section carries a current Study Item (KTD10). A Recall Challenge
  // lineup draws exclusively from current Study Items, so this is the single published record
  // of whether this Leg's Guardian can EVER produce a lineup — i.e. whether the Leg is
  // winnable. The merge below computes it once; no consumer recomputes it from nodes.
  hasStudyItems: boolean;
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

// A section before the boundary edits: its anchor and its claimed stops in trail order. The
// milestone is always the LAST stop, because the claimed set is ancestor-closed (a section
// claims every unclaimed ancestor of its milestone), so every unclaimed path into the milestone
// stays inside the section and the topological order cannot place it earlier.
type SectionDraft = { milestoneId: string; stepDerivedNodeIds: string[] };

// SPLIT (KTD2–KTD5). A section whose ITEMFUL concept count exceeds the Leg ward budget provably
// cannot be covered by its own Guardian, and — because a Guardian arrives only at full Leg
// mastery — it also schedules one reward beat where the design intends several. It is cut into
// milestone-shaped chunks at its SUB-TERMINAL milestones: a stop with at least one within-section
// dependent, every one of which is the section's own milestone — the last recognizable outcome
// built before the milestone itself. A Leg must end on a recognizable outcome, never at an
// arbitrary depth or difficulty transition, so a section with no sub-terminal milestone is left
// whole.
//
// The cut is a PREFIX CUT over the emitted order, never an anchor promotion: routing the split
// back through cone claiming reshuffles shared-cone ownership and was measured to MOVE the summit
// on a real layer, and the summit is the expedition's identity and its keystone a permanent
// reward. The accepted cost is that a chunk may hold a stop that is not an ancestor of its own
// anchor. One pass only: a chunk still over the cap stays whole (KTD5) — recursion was measured
// as a no-op, and manufacturing anchors that are not recognizable outcomes is what KTD3 forbids.
// The final chunk keeps the original milestone, so a split only ADDS milestones (KTD12).
function splitOverCapSections(
  drafts: SectionDraft[],
  input: { dependentsOf: Map<string, string[]>; hasStudyItem: (derivedNodeId: string) => boolean }
): SectionDraft[] {
  const split: SectionDraft[] = [];
  for (const draft of drafts) {
    if (draft.stepDerivedNodeIds.filter(input.hasStudyItem).length <= SECTION_LINEUP_MAX) {
      split.push(draft);
      continue;
    }
    const within = new Set(draft.stepDerivedNodeIds);
    const isSubTerminal = (derivedNodeId: string): boolean => {
      if (derivedNodeId === draft.milestoneId) return false;
      const dependents = (input.dependentsOf.get(derivedNodeId) ?? []).filter((id) => within.has(id));
      return dependents.length > 0 && dependents.every((id) => id === draft.milestoneId);
    };
    let start = 0;
    draft.stepDerivedNodeIds.forEach((derivedNodeId, index) => {
      if (index === draft.stepDerivedNodeIds.length - 1 || !isSubTerminal(derivedNodeId)) return;
      split.push({ milestoneId: derivedNodeId, stepDerivedNodeIds: draft.stepDerivedNodeIds.slice(start, index + 1) });
      start = index + 1;
    });
    split.push({ milestoneId: draft.milestoneId, stepDerivedNodeIds: draft.stepDerivedNodeIds.slice(start) });
  }
  return split;
}

// MERGE (KTD6, KTD8). A section with no current Study Item can never produce a lineup, so its
// Guardian can never be won — and the summit gate requires every Leg won, which would make the
// Expedition Guardian and the keystone permanently unreachable (a liveness failure in a
// progression gate). Because sections are derived and never persisted, the achievable subset is
// made equal to the whole set by deleting the boundary: an item-less section is absorbed by the
// section that FOLLOWS it and the merged Leg keeps the later milestone, so the summit — the last
// section's milestone — is invariant. A trailing item-less run folds back into the previous Leg
// but still adopts the run's last milestone. A layer with no Study Items at all emits one section
// holding the whole trail: the one case no boundary edit can repair, which the summit gate names
// honestly instead of locking forever (KTD11). A merge only removes the milestone of a section
// that had no Study Item and therefore could never have been won, so no durable victory can lose
// its anchor (KTD12).
function mergeItemlessSections(drafts: SectionDraft[], hasStudyItem: (derivedNodeId: string) => boolean): SectionDraft[] {
  const merged: SectionDraft[] = [];
  let run: SectionDraft[] = [];
  for (const draft of drafts) {
    run.push(draft);
    if (!draft.stepDerivedNodeIds.some(hasStudyItem)) continue;
    merged.push({ milestoneId: draft.milestoneId, stepDerivedNodeIds: run.flatMap((section) => section.stepDerivedNodeIds) });
    run = [];
  }
  if (run.length === 0) return merged;
  const trailingSteps = run.flatMap((section) => section.stepDerivedNodeIds);
  const trailingMilestoneId = run[run.length - 1].milestoneId;
  const last = merged[merged.length - 1];
  if (!last) return [{ milestoneId: trailingMilestoneId, stepDerivedNodeIds: trailingSteps }];
  last.milestoneId = trailingMilestoneId;
  last.stepDerivedNodeIds = [...last.stepDerivedNodeIds, ...trailingSteps];
  return merged;
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
  const drafts: SectionDraft[] = [];
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
    for (const derivedNodeId of order) claimed.add(derivedNodeId);
    drafts.push({ milestoneId, stepDerivedNodeIds: order });
  }

  // The two boundary edits over the emitted order, then one renumbering pass. Everything below
  // is a function of the drafts alone: the concatenated `derivedNodeId` order, the node set, and
  // the summit are identical before and after.
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const dependents = dependentsOf.get(edge.prerequisiteDerivedNodeId);
    if (dependents) dependents.push(edge.dependentDerivedNodeId);
    else dependentsOf.set(edge.prerequisiteDerivedNodeId, [edge.dependentDerivedNodeId]);
  }
  const itemfulNodeIds = new Set(input.detail.nodes.filter((node) => node.hasStudyItem).map((node) => node.derivedNodeId));
  const hasStudyItem = (derivedNodeId: string): boolean => itemfulNodeIds.has(derivedNodeId);
  const partition = mergeItemlessSections(splitOverCapSections(drafts, { dependentsOf, hasStudyItem }), hasStudyItem);

  const sections: ExpeditionSection[] = [];
  const steps: ExpeditionSectionStep[] = [];
  partition.forEach(({ milestoneId, stepDerivedNodeIds }, sectionIndex) => {
    const milestoneLabel = labelOf.get(milestoneId) ?? milestoneId;
    stepDerivedNodeIds.forEach((derivedNodeId, sectionPositionIndex) => {
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
        milestoneLabel,
        isMilestone: derivedNodeId === milestoneId
      });
    });
    sections.push({
      sectionIndex,
      milestoneDerivedNodeId: milestoneId,
      milestoneLabel,
      stepDerivedNodeIds,
      meanDifficulty: stepDerivedNodeIds.reduce((sum, id) => sum + (difficultyOf.get(id) ?? 0), 0) / stepDerivedNodeIds.length,
      hasStudyItems: stepDerivedNodeIds.some(hasStudyItem)
    });
  });

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
