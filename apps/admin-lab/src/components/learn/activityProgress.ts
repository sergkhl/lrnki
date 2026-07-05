import type { ConceptLessonView, StudyImpostorView, StudyMatchingView, StudyOptionSelectView, StudySession } from "@lrnki/application";

export type StopActivity =
  | { kind: "theory"; derivedNodeId: string; label: string; lesson: ConceptLessonView | undefined }
  | { kind: "option_select"; derivedNodeId: string; label: string; item: StudyOptionSelectView }
  | { kind: "matching"; derivedNodeId: string; label: string; item: StudyMatchingView }
  | { kind: "impostor"; derivedNodeId: string; label: string; item: StudyImpostorView }
  | { kind: "capstone"; derivedNodeId: string; label: string; mastered: boolean }
  | { kind: "missing"; message: string };

export function resolveStopActivity(session: StudySession, stopId: string): StopActivity {
  const [derivedNodeId, kind, studyItemId] = stopId.split(":");
  const label = session.detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
  if (!derivedNodeId || !kind) return { kind: "missing", message: "This stop is no longer on the trail." };
  if (kind === "theory") return { kind: "theory", derivedNodeId, label, lesson: session.lessonByNode[derivedNodeId] };
  if (kind === "capstone") {
    const step = session.statefulPath.find((candidate) => candidate.derivedNodeId === derivedNodeId);
    return { kind: "capstone", derivedNodeId, label, mastered: step?.state === "mastered" };
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
