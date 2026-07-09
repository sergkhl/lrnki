import type { BoardSeen } from "@/learn/seamClassifier";

// Web storage half of the navigation memory seam (KTD5): same async contract as the
// native AsyncStorage module so callers never branch on platform.

const BOARD_KEY_PREFIX = "lrnki_board_seen_";
const DUEL_UNLOCK_KEY_PREFIX = "lrnki_duel_unlocked_seen_";

export async function readBoardSeen(learnerRef: string): Promise<BoardSeen | null> {
  try {
    const raw = window.localStorage.getItem(BOARD_KEY_PREFIX + learnerRef);
    return raw ? (JSON.parse(raw) as BoardSeen) : null;
  } catch {
    return null;
  }
}

export async function writeBoardSeen(learnerRef: string, seen: BoardSeen): Promise<void> {
  try {
    window.localStorage.setItem(BOARD_KEY_PREFIX + learnerRef, JSON.stringify(seen));
  } catch {
    // A storage failure only means a celebration may re-fire — never a correctness problem.
  }
}

export async function readDuelUnlockSeen(learnerRef: string): Promise<boolean> {
  try {
    return window.localStorage.getItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef) === "1";
  } catch {
    return true;
  }
}

export async function markDuelUnlockSeen(learnerRef: string): Promise<void> {
  try {
    window.localStorage.setItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef, "1");
  } catch {
    // Non-fatal: the splash may re-fire.
  }
}
