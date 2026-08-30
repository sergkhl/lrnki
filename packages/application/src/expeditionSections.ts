import type { StudyItem } from "@lrnki/domain-core";
import type { DerivedGraphDetail, DerivedGraphEdge } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import {
  planExpeditionRoute,
  type ExpeditionRoutePlan
} from "./expeditionRoutePlan";
import { topologicalDepth } from "./prerequisiteDag";

// Consumer projection over the one Expedition Route Plan shape. Source Expedition callers pass
// their already-qualified plan and current Study Items; inspection/non-source callers may still
// request the layer-projection policy. No source learner consumer is allowed to plan again here.

export type ExpeditionSectionStep = {
  position: number;
  derivedNodeId: string;
  difficulty: number;
  topologicalDepth: number;
  state: AdaptedNodeState;
  isSummit: boolean;
  sectionIndex: number;
  sectionPositionIndex: number;
  milestoneDerivedNodeId: string;
  milestoneLabel: string;
  isMilestone: boolean;
};

export type ExpeditionSection = {
  sectionIndex: number;
  milestoneDerivedNodeId: string;
  milestoneLabel: string;
  stepDerivedNodeIds: string[];
  meanDifficulty: number;
  hasStudyItems: boolean;
};

export type SectionedExpedition = {
  steps: ExpeditionSectionStep[];
  sections: ExpeditionSection[];
  summit: { derivedNodeId: string; label: string } | null;
};

type SectioningDetail = Pick<DerivedGraphDetail, "nodes" | "edges">;

export function projectExpeditionSections(input: {
  detail: SectioningDetail;
  stateByNode: Record<string, AdaptedNodeState>;
  routePlan?: ExpeditionRoutePlan;
  studyItems?: readonly Pick<StudyItem, "studyItemId" | "derivedNodeId" | "itemType">[];
}): SectionedExpedition {
  const edges = trustedEdges(input.detail.edges);
  const routePlan = input.routePlan ?? layerProjectionPlan(input.detail, edges);
  if (input.routePlan) {
    const mismatchReasons = expeditionRouteAssetMismatchReasons({
      detail: input.detail,
      studyItems: input.studyItems ?? [],
      routePlan
    });
    if (mismatchReasons.length > 0) {
      throw new Error(`Expedition route/assets mismatch: ${mismatchReasons.join("; ")}`);
    }
  }

  const difficultyOf = new Map(input.detail.nodes.map((node) => [
    node.derivedNodeId,
    node.difficulty ?? 0
  ] as const));
  const labelOf = new Map(input.detail.nodes.map((node) => [
    node.derivedNodeId,
    node.label
  ] as const));
  const itemfulNodeIds = input.routePlan
    ? new Set((input.studyItems ?? []).map((item) => item.derivedNodeId))
    : new Set(input.detail.nodes.filter((node) =>
        node.hasStudyItem
      ).map((node) => node.derivedNodeId));
  const depthByNode = topologicalDepth(
    routePlan.orderedDerivedNodeIds,
    edges
  );
  const sections: ExpeditionSection[] = [];
  const steps: ExpeditionSectionStep[] = [];

  for (const leg of routePlan.legs) {
    const milestoneLabel = labelOf.get(leg.anchorDerivedNodeId) ?? leg.anchorDerivedNodeId;
    for (const [sectionPositionIndex, derivedNodeId] of leg.derivedNodeIds.entries()) {
      steps.push({
        position: steps.length,
        derivedNodeId,
        difficulty: difficultyOf.get(derivedNodeId) ?? 0,
        topologicalDepth: depthByNode.get(derivedNodeId) ?? 0,
        state: input.stateByNode[derivedNodeId] ?? "locked",
        isSummit: derivedNodeId === routePlan.summitDerivedNodeId,
        sectionIndex: leg.legIndex,
        sectionPositionIndex,
        milestoneDerivedNodeId: leg.anchorDerivedNodeId,
        milestoneLabel,
        isMilestone: derivedNodeId === leg.anchorDerivedNodeId
      });
    }
    sections.push({
      sectionIndex: leg.legIndex,
      milestoneDerivedNodeId: leg.anchorDerivedNodeId,
      milestoneLabel,
      stepDerivedNodeIds: leg.derivedNodeIds,
      meanDifficulty: leg.derivedNodeIds.reduce((sum, derivedNodeId) =>
        sum + (difficultyOf.get(derivedNodeId) ?? 0), 0
      ) / leg.derivedNodeIds.length,
      hasStudyItems: leg.derivedNodeIds.some((derivedNodeId) =>
        itemfulNodeIds.has(derivedNodeId)
      )
    });
  }

  const summitDerivedNodeId = routePlan.summitDerivedNodeId;
  return {
    steps,
    sections,
    summit: summitDerivedNodeId
      ? {
          derivedNodeId: summitDerivedNodeId,
          label: labelOf.get(summitDerivedNodeId) ?? summitDerivedNodeId
        }
      : null
  };
}

// One deterministic fail-closed contract shared by Study Session and Recall Challenge. It checks
// only cross-owner consistency: qualification owns whether the content is good enough, while this
// seam proves that consumers received the same route nodes and selected bonus IDs they were given.
export function expeditionRouteAssetMismatchReasons(input: {
  detail: SectioningDetail;
  studyItems: readonly Pick<StudyItem, "studyItemId" | "derivedNodeId" | "itemType">[];
  routePlan: ExpeditionRoutePlan;
}): string[] {
  const reasons: string[] = [];
  const detailIds = input.detail.nodes.map((node) => node.derivedNodeId);
  const orderedIds = input.routePlan.orderedDerivedNodeIds;
  const duplicateDetailIds = duplicates(detailIds);
  const duplicateOrderedIds = duplicates(orderedIds);
  if (duplicateDetailIds.length > 0) reasons.push(`duplicate detail nodes ${duplicateDetailIds.join(",")}`);
  if (duplicateOrderedIds.length > 0) reasons.push(`duplicate route nodes ${duplicateOrderedIds.join(",")}`);
  if (!sameTextSet(detailIds, orderedIds)) reasons.push("route nodes do not equal detail nodes");

  const legIds = input.routePlan.legs.flatMap((leg) => leg.derivedNodeIds);
  if (!sameTextSequence(legIds, orderedIds)) reasons.push("Leg concatenation does not equal route order");
  for (const [position, leg] of input.routePlan.legs.entries()) {
    if (leg.legIndex !== position) reasons.push(`Leg ${position} has index ${leg.legIndex}`);
    if (leg.derivedNodeIds.at(-1) !== leg.anchorDerivedNodeId) {
      reasons.push(`Leg ${position} anchor is not its final Concept`);
    }
  }
  if ((orderedIds.at(-1) ?? null) !== input.routePlan.summitDerivedNodeId) {
    reasons.push("summit is not the final route Concept");
  }

  const itemIds = input.studyItems.map((item) => item.studyItemId);
  const duplicateItemIds = duplicates(itemIds);
  if (duplicateItemIds.length > 0) reasons.push(`duplicate Study Item IDs ${duplicateItemIds.join(",")}`);
  const routeNodeIds = new Set(orderedIds);
  const outsideItems = input.studyItems
    .filter((item) => !routeNodeIds.has(item.derivedNodeId))
    .map((item) => item.studyItemId)
    .sort(compareText);
  if (outsideItems.length > 0) reasons.push(`Study Items outside route ${outsideItems.join(",")}`);

  const itemById = new Map(input.studyItems.map((item) => [item.studyItemId, item] as const));
  const selectedBonusIds = input.routePlan.legs.flatMap((leg) => leg.selectedBonusStudyItemIds);
  const duplicateBonusIds = duplicates(selectedBonusIds);
  if (duplicateBonusIds.length > 0) reasons.push(`duplicate selected bonus IDs ${duplicateBonusIds.join(",")}`);
  for (const leg of input.routePlan.legs) {
    const legNodeIds = new Set(leg.derivedNodeIds);
    for (const studyItemId of leg.selectedBonusStudyItemIds) {
      const item = itemById.get(studyItemId);
      if (!item) reasons.push(`selected bonus ${studyItemId} is missing`);
      else if (item.itemType === "option_select") reasons.push(`selected bonus ${studyItemId} is option-select`);
      else if (!legNodeIds.has(item.derivedNodeId)) reasons.push(`selected bonus ${studyItemId} is outside its Leg`);
    }
  }
  const currentBonusIds = input.studyItems
    .filter((item) => item.itemType !== "option_select")
    .map((item) => item.studyItemId);
  if (!sameTextSet(currentBonusIds, selectedBonusIds)) {
    reasons.push("current non-option Study Items do not equal selected route bonuses");
  }
  return reasons;
}

// The trail scope shared by expedition-entry surfaces and the projection. Difficulty-floor
// contraction remains upstream; route ordering and Leg boundaries come only from the plan module.
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
  const trailNodes = detail.nodes.filter((node) =>
    floor.includedNodeIds.has(node.derivedNodeId)
  );
  const { summit, sections } = projectExpeditionSections({
    detail: { nodes: trailNodes, edges: floor.contractedEdges },
    stateByNode: {}
  });
  return { summit, sections, trailNodeIds: floor.includedNodeIds };
}

function trustedEdges(edges: readonly DerivedGraphEdge[]): DerivedGraphEdge[] {
  return edges.filter((edge) => !edge.uncertain);
}

function layerProjectionPlan(
  detail: SectioningDetail,
  edges: readonly DerivedGraphEdge[]
): ExpeditionRoutePlan {
  const planning = planExpeditionRoute({
    concepts: detail.nodes.map((node) => ({
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.label,
      difficulty: node.difficulty
    })),
    trustedPrerequisiteEdges: edges,
    policy: "layer_projection"
  });
  if (planning.status === "unavailable") {
    throw new Error(
      `Expedition route projection failed: ${planning.reason} ${JSON.stringify(planning.diagnostics)}`
    );
  }
  return planning.plan;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort(compareText);
}

function sameTextSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort(compareText);
  const sortedRight = [...right].sort(compareText);
  return sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameTextSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
