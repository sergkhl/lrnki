// In-sheet advance memory: after "Continue" the sheet walks to the next stop without
// re-rendering the trail, remembering which trail stop the walk started from. The
// memory is valid only while the sheet stays open on that source stop — closing the
// sheet must drop it, or re-opening an earlier stop would resurrect the advanced one.
export type AdvanceMemory = { sourceStopId: string | null; activeStopId: string | null } | null;

export function activeStopFor(memory: AdvanceMemory, stopId: string | null): string | null {
  return memory !== null && memory.sourceStopId === stopId ? memory.activeStopId : stopId;
}
