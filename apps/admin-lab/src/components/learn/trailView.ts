import type { StudyItemView, StudySession } from "@lrnki/application";

export type TrailStopKind = "theory" | StudyItemView["kind"] | "capstone";
export type TrailStopState = "complete" | "available" | "locked";

export type TrailStop = {
  stopId: string;
  kind: TrailStopKind;
  derivedNodeId: string;
  label: string;
  state: TrailStopState;
  isNext: boolean;
  isFogged: boolean;
  studyItemId: string | null;
};

export type TrailCluster = {
  derivedNodeId: string;
  label: string;
  topologicalDepth: number;
  state: StudySession["statefulPath"][number]["state"];
  isTarget: boolean;
  stops: TrailStop[];
};

export type TrailCamp = {
  topologicalDepth: number;
  clusters: TrailCluster[];
};

export type TrailView = {
  camps: TrailCamp[];
  nextStopId: string | null;
  fogBoundaryStopId: string | null;
  masteredCount: number;
  totalClusters: number;
};

export function buildTrailView(session: StudySession): TrailView {
  const labelByNode = new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const nextNodeId = session.classification.selectedFrontierTarget ?? (session.isFoundationalRoot ? session.target.derivedNodeId : null);
  let nextStopAssigned = false;
  const clusters: TrailCluster[] = session.statefulPath.map((step) => {
    const label = labelByNode.get(step.derivedNodeId) ?? step.derivedNodeId;
    const baseState: TrailStopState = step.state === "mastered" ? "complete" : step.state === "frontier" ? "available" : "locked";
    const stops: TrailStop[] = [];
    const addStop = (kind: TrailStopKind, studyItemId: string | null) => {
      const stopId = `${step.derivedNodeId}:${kind}:${studyItemId ?? "main"}`;
      const isNext = !nextStopAssigned && step.derivedNodeId === nextNodeId && baseState !== "complete";
      if (isNext) nextStopAssigned = true;
      stops.push({ stopId, kind, derivedNodeId: step.derivedNodeId, label, state: baseState, isNext, isFogged: baseState === "locked", studyItemId });
    };

    if (session.lessonByNode[step.derivedNodeId]) addStop("theory", null);
    for (const segment of session.studySegmentsByNode[step.derivedNodeId] ?? []) {
      addStop(segment.kind, segment.item.studyItemId);
    }
    addStop("capstone", null);

    return {
      derivedNodeId: step.derivedNodeId,
      label,
      topologicalDepth: step.topologicalDepth,
      state: step.state,
      isTarget: step.isTarget,
      stops
    };
  });

  const camps = new Map<number, TrailCluster[]>();
  for (const cluster of clusters) {
    camps.set(cluster.topologicalDepth, [...(camps.get(cluster.topologicalDepth) ?? []), cluster]);
  }

  const nextStopId = clusters.flatMap((cluster) => cluster.stops).find((stop) => stop.isNext)?.stopId ?? null;
  return {
    camps: [...camps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([topologicalDepth, campClusters]) => ({
        topologicalDepth,
        clusters: campClusters.sort((a, b) => a.label.localeCompare(b.label))
      })),
    nextStopId,
    fogBoundaryStopId: nextStopId,
    masteredCount: clusters.filter((cluster) => cluster.state === "mastered").length,
    totalClusters: clusters.length
  };
}
