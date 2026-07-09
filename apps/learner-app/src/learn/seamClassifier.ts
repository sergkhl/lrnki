// The pure half of the board navigation memory seam (KTD5, ADR-0032 "the client may
// remember navigation state"). Storage lives in `src/lib/navMemory` per platform; the
// classifier is pure so the seam decisions are unit-tested without a device.

export type BoardSeen = { weekKey: string; rank: number | null; points: number };
export type BoardNow = { weekKey: string; rank: number | null; points: number };
export type SeamChange = "new_week" | "rank_up" | "rank_down" | "none";

// Which splash seam (if any) fires the current board against what the learner last saw (R3):
// a new ISO week always shows final standings; otherwise a rank improvement or drop shows the
// board. A first-ever visit only celebrates once the learner has actually scored, so an empty
// board never nags.
export function classifySeam(prev: BoardSeen | null, now: BoardNow): SeamChange {
  if (prev === null) return now.points > 0 ? "rank_up" : "none";
  if (prev.weekKey !== now.weekKey) return "new_week";
  if (now.rank !== null && prev.rank !== null) {
    if (now.rank < prev.rank) return "rank_up";
    if (now.rank > prev.rank) return "rank_down";
  }
  return "none";
}
