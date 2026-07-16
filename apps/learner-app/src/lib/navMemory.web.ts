import type { BoardSeen } from "@/learn/seamClassifier";
import type { VistaRewardKey } from "@/learn/crystalFormationLayout";

// Web storage half of the navigation memory seam (KTD5): same async contract as the
// native AsyncStorage module so callers never branch on platform.

const BOARD_KEY_PREFIX = "lrnki_board_seen_";

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

const GUARDIAN_ARRIVAL_KEY_PREFIX = "lrnki_guardian_arrival_";

// Guardian arrival acknowledgement (plan 2026-07-13-003 U6, KTD3): whether this device has
// already offered the arrival dialog for a scope, keyed by its durable anchor node. Losing
// it re-offers the dialog at worst; the formation itself is server-owned.
export async function readGuardianArrivalSeen(learnerRef: string, scopeAnchorId: string): Promise<boolean> {
  try {
    return window.localStorage.getItem(GUARDIAN_ARRIVAL_KEY_PREFIX + learnerRef + "_" + scopeAnchorId) === "1";
  } catch {
    return true;
  }
}

export async function markGuardianArrivalSeen(learnerRef: string, scopeAnchorId: string): Promise<void> {
  try {
    window.localStorage.setItem(GUARDIAN_ARRIVAL_KEY_PREFIX + learnerRef + "_" + scopeAnchorId, "1");
  } catch {
    // Non-fatal: the arrival offer may re-fire.
  }
}

const VISTA_BINDINGS_KEY_PREFIX = "lrnki_vista_bindings_";

// Web half of the lossable Vista contextualization seam; identical reward-key contract
// to native AsyncStorage.
export async function readVistaSeenBindings(learnerRef: string, enrichmentId: string): Promise<VistaRewardKey[] | null> {
  try {
    const raw = window.localStorage.getItem(VISTA_BINDINGS_KEY_PREFIX + learnerRef + "_" + enrichmentId);
    return raw ? parseVistaBindings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function writeVistaSeenBindings(learnerRef: string, enrichmentId: string, bindings: readonly VistaRewardKey[]): Promise<void> {
  try {
    window.localStorage.setItem(VISTA_BINDINGS_KEY_PREFIX + learnerRef + "_" + enrichmentId, JSON.stringify(bindings));
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
