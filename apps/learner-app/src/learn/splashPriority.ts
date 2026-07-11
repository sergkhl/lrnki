// Pure splash priority (KTD5, AE5): at most ONE celebration mounts per journal visit,
// chosen in the fixed order Duel unlock, podium, new week, rank change. Everything the
// decision needs arrives as plain values — queries and navigation memory stay outside.
import type { SeamChange } from "./seamClassifier";

export type SplashEvent = "duel_unlock" | "podium" | "new_week" | "rank_change";

export type SplashEligibility = {
  /** Server says the duel is unlocked and the device has not celebrated it yet. */
  duelUnlockEligible: boolean;
  /** The board recorded a top-three finish for the prior week on this load. */
  podiumEarnedForPreviousWeek: boolean;
  /** Board movement against the device's last-seen snapshot. */
  seam: SeamChange;
};

export function chooseSplash(eligibility: SplashEligibility): SplashEvent | null {
  if (eligibility.duelUnlockEligible) return "duel_unlock";
  if (eligibility.podiumEarnedForPreviousWeek) return "podium";
  if (eligibility.seam === "new_week") return "new_week";
  if (eligibility.seam === "rank_up" || eligibility.seam === "rank_down") return "rank_change";
  return null;
}

/** Whether the chosen event consumes the BOARD seen-snapshot on dismissal. The duel
 * unlock writes only its own mark, leaving an eligible board event for a later visit. */
export function isBoardSplash(event: SplashEvent): boolean {
  return event !== "duel_unlock";
}
