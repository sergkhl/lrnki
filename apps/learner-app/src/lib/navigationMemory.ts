import type { BoardSeen } from "@/learn/seamClassifier";

export interface NavigationMemoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface NavigationMemory {
  readBoardSeen(learnerRef: string): Promise<BoardSeen | null>;
  writeBoardSeen(learnerRef: string, seen: BoardSeen): Promise<void>;
}

const BOARD_KEY_PREFIX = "lrnki_board_seen_";

// Logical identity, parsing, validation, and loss semantics live here once. Platform files provide
// only raw storage; this state is presentation memory and can safely disappear or be replayed.
export function createNavigationMemory(storage: NavigationMemoryStorage): NavigationMemory {
  return {
    async readBoardSeen(learnerRef) {
      try {
        const raw = await storage.getItem(boardKey(learnerRef));
        return raw === null ? null : parseBoardSeen(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async writeBoardSeen(learnerRef, seen) {
      try {
        await storage.setItem(boardKey(learnerRef), JSON.stringify(seen));
      } catch {
        // Losing presentation memory may replay a celebration; it cannot change durable progress.
      }
    }
  };
}

function boardKey(learnerRef: string): string {
  return `${BOARD_KEY_PREFIX}${encodeURIComponent(learnerRef)}`;
}

function parseBoardSeen(value: unknown): BoardSeen | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.weekKey !== "string" || candidate.weekKey.length === 0 ||
    typeof candidate.points !== "number" || !Number.isSafeInteger(candidate.points) || candidate.points < 0 ||
    !(candidate.rank === null || (
      typeof candidate.rank === "number" && Number.isSafeInteger(candidate.rank) && candidate.rank > 0
    ))
  ) return null;
  return {
    weekKey: candidate.weekKey,
    rank: candidate.rank as number | null,
    points: candidate.points as number
  };
}
