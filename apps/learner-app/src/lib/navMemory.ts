import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardSeen } from "@/learn/seamClassifier";
import type { VistaRewardKey } from "@/learn/crystalFormationLayout";

// Native storage half of the board navigation memory seam (KTD5). Client-local only —
// never in the schema; losing it re-fires a celebration at worst. Async on native, so the
// splash surfaces (follow-up pass) read it once during their query phase.

const BOARD_KEY_PREFIX = "lrnki_board_seen_";

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

const GUARDIAN_ARRIVAL_KEY_PREFIX = "lrnki_guardian_arrival_";

// Guardian arrival acknowledgement (plan 2026-07-13-003 U6, KTD3): whether this device has
// already offered the arrival dialog for a scope, keyed by that scope's identity — build it with
// `recallScopeKey`, never from the anchor alone. Losing it re-offers the dialog at worst; the
// formation itself is server-owned.
export async function readGuardianArrivalSeen(learnerRef: string, scopeKey: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUARDIAN_ARRIVAL_KEY_PREFIX + learnerRef + "_" + scopeKey)) === "1";
  } catch {
    return true;
  }
}

export async function markGuardianArrivalSeen(learnerRef: string, scopeKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(GUARDIAN_ARRIVAL_KEY_PREFIX + learnerRef + "_" + scopeKey, "1");
  } catch {
    // Non-fatal: the arrival offer may re-fire.
  }
}

const VISTA_BINDINGS_KEY_PREFIX = "lrnki_vista_bindings_";

// Lossable Vista contextualization memory. Permanent reward existence remains in the
// server projection; this snapshot only prevents stale binding scenes from replaying.
export async function readVistaSeenBindings(learnerRef: string, enrichmentId: string): Promise<VistaRewardKey[] | null> {
  try {
    const raw = await AsyncStorage.getItem(VISTA_BINDINGS_KEY_PREFIX + learnerRef + "_" + enrichmentId);
    return raw ? parseVistaBindings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function writeVistaSeenBindings(learnerRef: string, enrichmentId: string, bindings: readonly VistaRewardKey[]): Promise<void> {
  try {
    await AsyncStorage.setItem(VISTA_BINDINGS_KEY_PREFIX + learnerRef + "_" + enrichmentId, JSON.stringify(bindings));
  } catch {
    // Non-fatal: a settled Vista contextualization may replay.
  }
}

function parseVistaBindings(value: unknown): VistaRewardKey[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.filter((entry): entry is VistaRewardKey =>
    entry === "summit" || (typeof entry === "string" && /^leg:\d+$/.test(entry))
  );
  return valid.length === value.length ? [...new Set(valid)] : null;
}
