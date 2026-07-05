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
  nextStopLabel: string | null;
  fogBoundaryStopId: string | null;
  masteredCount: number;
  totalClusters: number;
};

export function buildTrailView(session: StudySession): TrailView {
  const labelByNode = new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const clusters: TrailCluster[] = session.statefulPath.map((step) => {
    const label = labelByNode.get(step.derivedNodeId) ?? step.derivedNodeId;
    const baseState: TrailStopState = step.state === "mastered" ? "complete" : step.state === "frontier" ? "available" : "locked";
    const stops: TrailStop[] = [];
    const addStop = (kind: TrailStopKind, studyItemId: string | null) => {
      const stopId = `${step.derivedNodeId}:${kind}:${studyItemId ?? "main"}`;
      const state = stateForStop({ baseState, kind, studyItemId, derivedNodeId: step.derivedNodeId, session });
      stops.push({ stopId, kind, derivedNodeId: step.derivedNodeId, label, state, isNext: false, isFogged: baseState === "locked", studyItemId });
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

  const flatStops = clusters.flatMap((cluster) => cluster.stops);
  const nextStop = flatStops.find((stop) => stop.state !== "complete" && stop.state !== "locked") ?? null;
  if (nextStop) nextStop.isNext = true;
  return {
    concepts: clusters,
    nextStopId: nextStop?.stopId ?? null,
    nextStopLabel: nextStop?.label ?? null,
    fogBoundaryStopId: nextStop?.stopId ?? null,
    masteredCount: clusters.filter((cluster) => cluster.state === "mastered").length,
    totalClusters: clusters.length
  };
}

function stateForStop(input: {
  baseState: TrailStopState;
  kind: TrailStopKind;
  studyItemId: string | null;
  derivedNodeId: string;
  session: StudySession;
}): TrailStopState {
  if (input.kind === "theory") {
    if (input.baseState === "locked") return "locked";
    return input.session.lessonReadByNode[input.derivedNodeId] ? "complete" : input.baseState;
  }
  if (input.kind === "capstone") return input.baseState;
  if (input.baseState === "locked") return "locked";
  if (!input.studyItemId) return input.baseState;
  return input.session.latestOutcomeByStudyItemId[input.studyItemId] === "correct" ? "complete" : input.baseState;
}
