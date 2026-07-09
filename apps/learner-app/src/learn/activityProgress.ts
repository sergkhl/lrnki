import type { ConceptLessonView, StudyImpostorView, StudyMatchingView, StudyOptionSelectView, StudySession } from "@lrnki/application/projection";
import { buildTrailView } from "./trailView";

export type StopActivity =
  | { kind: "theory"; derivedNodeId: string; label: string; lesson: ConceptLessonView | undefined }
  | { kind: "option_select"; derivedNodeId: string; label: string; item: StudyOptionSelectView }
  | { kind: "matching"; derivedNodeId: string; label: string; item: StudyMatchingView }
  | { kind: "impostor"; derivedNodeId: string; label: string; item: StudyImpostorView }
  | { kind: "capstone"; derivedNodeId: string; label: string; mastered: boolean; difficulty: number; growthFraction: number; isKnownSkipped: boolean }
  | { kind: "missing"; message: string };

export function resolveStopActivity(session: StudySession, stopId: string): StopActivity {
  const [derivedNodeId, kind, studyItemId] = stopId.split(":");
  const label = session.detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
  if (!derivedNodeId || !kind) return { kind: "missing", message: "This stop is no longer on the trail." };
  if (kind === "theory") return { kind: "theory", derivedNodeId, label, lesson: session.lessonByNode[derivedNodeId] };
  if (kind === "capstone") {
    // The capstone reveal shows the node's crystal, so it carries the same growth
    // number every other surface reads (one completion rule, one visible truth).
    const cluster = buildTrailView(session).concepts.find((candidate) => candidate.derivedNodeId === derivedNodeId);
    return {
      kind: "capstone",
      derivedNodeId,
      label,
      mastered: cluster?.state === "mastered",
      difficulty: cluster?.difficulty ?? 0,
      growthFraction: cluster?.growthFraction ?? 0,
      isKnownSkipped: cluster?.isKnownSkipped ?? false
    };
  }
  const segment = (session.studySegmentsByNode[derivedNodeId] ?? []).find((candidate) => candidate.item.studyItemId === studyItemId);
  if (!segment) return { kind: "missing", message: "This activity is no longer available." };
  switch (segment.kind) {
    case "option_select":
      return { kind: "option_select", derivedNodeId, label, item: segment.item };
    case "matching":
      return { kind: "matching", derivedNodeId, label, item: segment.item };
    case "impostor":
      return { kind: "impostor", derivedNodeId, label, item: segment.item };
  }
}
