import type { DerivedGraphDetail, DerivedGraphEdge } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { planExpeditionRoute } from "./expeditionRoutePlan";
import { topologicalDepth } from "./prerequisiteDag";

// Temporary consumer-shape adapter over the one Expedition Route Plan implementation. The old
// terminal-cone claim/split/merge algorithm is deleted: until U3/U4 pass the qualified source plan
// directly, layer-wide consumers receive the same ordered route through the projection policy.

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
}): SectionedExpedition {
  const edges = trustedEdges(input.detail.edges);
  const planning = planExpeditionRoute({
    concepts: input.detail.nodes.map((node) => ({
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

  const difficultyOf = new Map(input.detail.nodes.map((node) => [
    node.derivedNodeId,
    node.difficulty ?? 0
  ] as const));
  const labelOf = new Map(input.detail.nodes.map((node) => [
    node.derivedNodeId,
    node.label
  ] as const));
  const itemfulNodeIds = new Set(input.detail.nodes.filter((node) =>
    node.hasStudyItem
  ).map((node) => node.derivedNodeId));
  const depthByNode = topologicalDepth(
    planning.plan.orderedDerivedNodeIds,
    edges
  );
  const sections: ExpeditionSection[] = [];
  const steps: ExpeditionSectionStep[] = [];

  for (const leg of planning.plan.legs) {
    const milestoneLabel = labelOf.get(leg.anchorDerivedNodeId) ?? leg.anchorDerivedNodeId;
    for (const [sectionPositionIndex, derivedNodeId] of leg.derivedNodeIds.entries()) {
      steps.push({
        position: steps.length,
        derivedNodeId,
        difficulty: difficultyOf.get(derivedNodeId) ?? 0,
        topologicalDepth: depthByNode.get(derivedNodeId) ?? 0,
        state: input.stateByNode[derivedNodeId] ?? "locked",
        isSummit: derivedNodeId === planning.plan.summitDerivedNodeId,
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

  const summitDerivedNodeId = planning.plan.summitDerivedNodeId;
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
