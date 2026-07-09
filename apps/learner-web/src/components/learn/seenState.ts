// Client-local board navigation memory (KTD5, ADR-0032 "the client may remember navigation
// state"). Stored in `localStorage` keyed by learner ref — never in the schema. Clearing storage
// re-fires a celebration at worst (idempotent and harmless). The classifier is pure so the seam
// decisions are unit-tested without a DOM.

export type BoardSeen = { weekKey: string; rank: number | null; points: number };
export type BoardNow = { weekKey: string; rank: number | null; points: number };
export type SeamChange = "new_week" | "rank_up" | "rank_down" | "none";

// Which splash seam (if any) firing the current board against what the learner last saw (R3):
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

const KEY_PREFIX = "lrnki_board_seen_";

export function readBoardSeen(learnerRef: string): BoardSeen | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + learnerRef);
    return raw ? (JSON.parse(raw) as BoardSeen) : null;
  } catch {
    return null;
  }
}

export function writeBoardSeen(learnerRef: string, seen: BoardSeen): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + learnerRef, JSON.stringify(seen));
  } catch {
    // A storage failure only means a celebration may re-fire — never a correctness problem.
  }
}

const DUEL_UNLOCK_KEY_PREFIX = "lrnki_duel_unlocked_seen_";

// One-time Crystal Duel unlock celebration memory (R7, KTD5). Client-local, so clearing storage
// re-fires the splash at worst — harmless.
export function readDuelUnlockSeen(learnerRef: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef) === "1";
  } catch {
    return true;
  }
}

export function markDuelUnlockSeen(learnerRef: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef, "1");
  } catch {
    // Non-fatal: the splash may re-fire.
  }
}
