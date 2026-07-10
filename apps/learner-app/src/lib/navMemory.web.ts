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

const VISTA_FUSED_KEY_PREFIX = "lrnki_vista_fused_";

// Fused-cluster memory for the Crystal Vista (plan 2026-07-10-001 U3): which section
// indexes this device has already celebrated, per learner+enrichment. Same seam pattern
// as the board memory — client-local, lossable, worst case one replayed fusion.
export async function readFusedSections(learnerRef: string, enrichmentId: string): Promise<number[] | null> {
  try {
    const raw = window.localStorage.getItem(VISTA_FUSED_KEY_PREFIX + learnerRef + "_" + enrichmentId);
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

export async function writeFusedSections(learnerRef: string, enrichmentId: string, sections: number[]): Promise<void> {
  try {
    window.localStorage.setItem(VISTA_FUSED_KEY_PREFIX + learnerRef + "_" + enrichmentId, JSON.stringify(sections));
  } catch {
    // Non-fatal: the fusion celebration may re-fire.
  }
}
