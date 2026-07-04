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

export type TrailView = {
  concepts: TrailCluster[];
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
      const state = stateForStop({ baseState, kind, studyItemId, session });
      const isNext = !nextStopAssigned && step.derivedNodeId === nextNodeId && state !== "complete";
      if (isNext) nextStopAssigned = true;
      stops.push({ stopId, kind, derivedNodeId: step.derivedNodeId, label, state, isNext, isFogged: baseState === "locked", studyItemId });
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

  const nextStopId = clusters.flatMap((cluster) => cluster.stops).find((stop) => stop.isNext)?.stopId ?? null;
  return {
    concepts: clusters,
    nextStopId,
    fogBoundaryStopId: nextStopId,
    masteredCount: clusters.filter((cluster) => cluster.state === "mastered").length,
    totalClusters: clusters.length
  };
}

function stateForStop(input: {
  baseState: TrailStopState;
  kind: TrailStopKind;
  studyItemId: string | null;
  session: StudySession;
}): TrailStopState {
  if (input.kind === "theory" || input.kind === "capstone") return input.baseState;
  if (input.baseState === "locked") return "locked";
  if (!input.studyItemId) return input.baseState;
  return input.session.latestOutcomeByStudyItemId[input.studyItemId] === "correct" ? "complete" : input.baseState;
}
