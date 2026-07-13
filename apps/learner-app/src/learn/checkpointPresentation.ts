// Pure checkpoint presentation (KTD4, AE3): ONE mapping from a trail stop to its icon
// and label, consumed by both the trail circle and the full-screen activity header so a
// map-pin checkpoint always opens under a map-pin header.
import type { TrailStop } from "@lrnki/application/projection";
import { learnerTerm } from "./vocabulary";

export type CheckpointIcon = "lock" | "book" | "map-pin" | "rows" | "search" | "crystal";

export type CheckpointPresentation = {
  icon: CheckpointIcon;
  label: string;
  description: string;
};

export function checkpointPresentation(stop: Pick<TrailStop, "kind" | "state">): CheckpointPresentation {
  if (stop.state === "locked") {
    return { icon: "lock", label: labelForKind(stop.kind), description: learnerTerm("locked") };
  }
  return { icon: iconForKind(stop.kind), label: labelForKind(stop.kind), description: labelForKind(stop.kind) };
}

function iconForKind(kind: TrailStop["kind"]): CheckpointIcon {
  if (kind === "theory") return "book";
  if (kind === "option_select") return "map-pin";
  if (kind === "matching") return "rows";
  if (kind === "impostor") return "search";
  return "crystal";
}

function labelForKind(kind: TrailStop["kind"]): string {
  if (kind === "theory") return learnerTerm("theoryStop");
  if (kind === "option_select") return learnerTerm("question");
  if (kind === "matching") return learnerTerm("matching");
  if (kind === "impostor") return learnerTerm("spotTheFake");
  return learnerTerm("capstone");
}
