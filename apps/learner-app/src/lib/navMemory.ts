import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardSeen } from "@/learn/seamClassifier";

// Native storage half of the board/duel navigation memory seam (KTD5). Client-local only —
// never in the schema; losing it re-fires a celebration at worst. Async on native, so the
// splash surfaces (follow-up pass) read it once during their query phase.

const BOARD_KEY_PREFIX = "lrnki_board_seen_";
const DUEL_UNLOCK_KEY_PREFIX = "lrnki_duel_unlocked_seen_";

export async function readBoardSeen(learnerRef: string): Promise<BoardSeen | null> {
  try {
    const raw = await AsyncStorage.getItem(BOARD_KEY_PREFIX + learnerRef);
    return raw ? (JSON.parse(raw) as BoardSeen) : null;
  } catch {
    return null;
  }
}

export async function writeBoardSeen(learnerRef: string, seen: BoardSeen): Promise<void> {
  try {
    await AsyncStorage.setItem(BOARD_KEY_PREFIX + learnerRef, JSON.stringify(seen));
  } catch {
    // A storage failure only means a celebration may re-fire — never a correctness problem.
  }
}

export async function readDuelUnlockSeen(learnerRef: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef)) === "1";
  } catch {
    return true;
  }
}

export async function markDuelUnlockSeen(learnerRef: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DUEL_UNLOCK_KEY_PREFIX + learnerRef, "1");
  } catch {
    // Non-fatal: the splash may re-fire.
  }
}
