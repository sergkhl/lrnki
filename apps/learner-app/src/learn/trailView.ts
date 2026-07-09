import type { StudySession } from "@lrnki/application/projection";

export type TrailStopKind = "theory" | StudyItemView["kind"] | "capstone";
export type TrailStopState = "complete" | "available" | "locked";

// A local alias so the view types below do not import the union twice.
type StudyItemView = StudySession["studySegmentsByNode"][string][number];

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
  difficulty: number;
  topologicalDepth: number;
  state: StudySession["expeditionPath"][number]["state"];
  isTarget: boolean;
  isKnownSkipped: boolean;
  // Section metadata (U5, R3-display): which milestone-anchored section this concept belongs to,
  // and whether it opens that section on the trail (the first concept of the section).
  sectionIndex: number;
  milestoneLabel: string;
  isSectionStart: boolean;
  // How far this concept's crystal has grown: the fraction of its own non-capstone
  // stops complete. Mastery forces 1 (a calibration `known` node may have unread
  // stops), so the crystal finishes exactly when the completion rule says so.
  growthFraction: number;
  stops: TrailStop[];
};

// One section as the non-blocking overview and the trail dividers render it (R5). State and
// gating are derived from the SAME classification/sheets the trail stops use, so the overview
// never drifts from the trail.
export type TrailSectionView = {
  sectionIndex: number;
  milestoneLabel: string;
  state: "complete" | "available" | "locked";
  conceptCount: number;
  masteredCount: number;
  stopsComplete: number;
  stopsTotal: number;
  // The first concept id of the section — the overview scrolls the trail here when tapped.
  firstConceptId: string;
  // For a locked section: the unmet prerequisite milestone/concept labels gating entry, deduped.
  gatingLabels: string[];
};

export type TrailView = {
  concepts: TrailCluster[];
  sections: TrailSectionView[];
  // The section the next stop lives in (for the header "k of n" indicator). 0 when the trail
  // is empty or fully complete.
  currentSectionIndex: number;
  nextStopId: string | null;
  nextStopLabel: string | null;
  masteredCount: number;
  totalClusters: number;
};

// The DOM id the trail gives a section's opening divider, so the non-blocking overview (R5) can
// scroll to it. One definition shared by the renderer and the overview (rule 18).
export function sectionAnchorId(sectionIndex: number): string {
  return `trail-section-${sectionIndex}`;
}

export function buildTrailView(session: StudySession): TrailView {
  const labelByNode = new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  let previousSectionIndex = -1;
  const clusters: TrailCluster[] = session.expeditionPath.map((step) => {
    const label = labelByNode.get(step.derivedNodeId) ?? step.derivedNodeId;
    const isKnownSkipped = session.verdictByNode[step.derivedNodeId] === "known";
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

    const isSectionStart = step.sectionIndex !== previousSectionIndex;
    previousSectionIndex = step.sectionIndex;

    const activityStops = stops.filter((stop) => stop.kind !== "capstone");
    const growthFraction =
      step.state === "mastered"
        ? 1
        : activityStops.length === 0
          ? 0
          : activityStops.filter((stop) => stop.state === "complete").length / activityStops.length;

    return {
      derivedNodeId: step.derivedNodeId,
      label,
      difficulty: step.difficulty,
      topologicalDepth: step.topologicalDepth,
      state: step.state,
      isTarget: step.isSummit,
      isKnownSkipped,
      sectionIndex: step.sectionIndex,
      milestoneLabel: step.milestoneLabel,
      isSectionStart,
      growthFraction,
      stops
    };
  });

  const flatStops = clusters.flatMap((cluster) => cluster.stops);
  const nextStop = flatStops.find((stop) => stop.state !== "complete" && stop.state !== "locked") ?? null;
  if (nextStop) nextStop.isNext = true;

  const sections = buildSections(clusters, session);
  const currentSectionIndex = nextStop
    ? clusters.find((cluster) => cluster.derivedNodeId === nextStop.derivedNodeId)?.sectionIndex ?? 0
    : Math.max(0, sections.length - 1);

  return {
    concepts: clusters,
    sections,
    currentSectionIndex,
    nextStopId: nextStop?.stopId ?? null,
    nextStopLabel: nextStop?.label ?? null,
    masteredCount: clusters.filter((cluster) => cluster.state === "mastered" && !cluster.isKnownSkipped).length,
    totalClusters: clusters.length
  };
}

// Group clusters into their sections and derive per-section state, progress, and gating labels.
// Gating labels reuse the projection's locked-sheet `unmetPrerequisiteLabels`, so the overview's
// "gated by" reasons match exactly what keeps the stops locked (one source of truth).
function buildSections(clusters: TrailCluster[], session: StudySession): TrailSectionView[] {
  const bySection = new Map<number, TrailCluster[]>();
  for (const cluster of clusters) {
    (bySection.get(cluster.sectionIndex) ?? bySection.set(cluster.sectionIndex, []).get(cluster.sectionIndex)!).push(cluster);
  }
  return [...bySection.entries()]
    .sort(([a], [b]) => a - b)
    .map(([sectionIndex, sectionClusters]) => {
      const conceptCount = sectionClusters.length;
      const masteredCount = sectionClusters.filter((cluster) => cluster.state === "mastered").length;
      const hasFrontier = sectionClusters.some((cluster) => cluster.state === "frontier");
      const state: TrailSectionView["state"] =
        masteredCount === conceptCount ? "complete" : hasFrontier || masteredCount > 0 ? "available" : "locked";
      const stops = sectionClusters.flatMap((cluster) => cluster.stops);
      const gatingLabels = state === "locked"
        ? [...new Set(sectionClusters.flatMap((cluster) => {
            const sheet = session.sheetByNode[cluster.derivedNodeId];
            return sheet?.kind === "locked" ? sheet.unmetPrerequisiteLabels : [];
          }))]
        : [];
      return {
        sectionIndex,
        milestoneLabel: sectionClusters[0]?.milestoneLabel ?? "",
        state,
        conceptCount,
        masteredCount,
        stopsComplete: stops.filter((stop) => stop.state === "complete").length,
        stopsTotal: stops.length,
        firstConceptId: sectionClusters[0]?.derivedNodeId ?? "",
        gatingLabels
      };
    });
}

// Per-stop state from that stop's OWN evidence (U2, R8): a theory stop completes when its
// lesson is read; an activity stop completes only when its own latest outcome is correct. The
// node-level `baseState` only distinguishes locked from playable — a "complete" node state never
// leaks into an individual stop (that was the one-answer-completes-all bug). The capstone is the
// gem: it mirrors the node's completion-based state (mastered ⟺ every stop complete).
function stateForStop(input: {
  baseState: TrailStopState;
  kind: TrailStopKind;
  studyItemId: string | null;
  derivedNodeId: string;
  session: StudySession;
}): TrailStopState {
  if (input.kind === "capstone") return input.baseState;
  if (input.baseState === "locked") return "locked";
  if (input.kind === "theory") {
    return input.session.lessonReadByNode[input.derivedNodeId] ? "complete" : "available";
  }
  if (!input.studyItemId) return "available";
  return input.session.latestOutcomeByStudyItemId[input.studyItemId] === "correct" ? "complete" : "available";
}
