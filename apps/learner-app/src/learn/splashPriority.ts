// Pure splash priority (KTD5, AE5): at most ONE celebration mounts per journal visit,
// chosen in the fixed order podium, new week, rank change. Everything the decision needs
// arrives as plain values — queries and navigation memory stay outside.
import type { SeamChange } from "./seamClassifier";

export type SplashEvent = "podium" | "new_week" | "rank_change";

export type SplashEligibility = {
  /** The board recorded a top-three finish for the prior week on this load. */
  podiumEarnedForPreviousWeek: boolean;
  /** Board movement against the device's last-seen snapshot. */
  seam: SeamChange;
};

export function chooseSplash(eligibility: SplashEligibility): SplashEvent | null {
  if (eligibility.podiumEarnedForPreviousWeek) return "podium";
  if (eligibility.seam === "new_week") return "new_week";
  if (eligibility.seam === "rank_up" || eligibility.seam === "rank_down") return "rank_change";
  return null;
}
