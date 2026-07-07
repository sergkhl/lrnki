"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { LeaderboardDialogContent } from "./LeaderboardDialog";
import type { BoardEntry, ChaseTarget } from "./rivalSimulation";
import { classifySeam, readBoardSeen, writeBoardSeen, type SeamChange } from "./seenState";
import { learnerTerm } from "./vocabulary";

export type LeaderboardSplashView = {
  learnerRef: string;
  weekKey: string;
  entries: BoardEntry[];
  chase: ChaseTarget | null;
  viewerRank: number | null;
  viewerPoints: number;
  masteredCrystalCount: number;
  podiumEarnedForPreviousWeek: boolean;
};

function splashTitle(seam: SeamChange, podium: boolean): string {
  if (podium) return learnerTerm("podiumTitle");
  if (seam === "new_week") return learnerTerm("splashNewWeekTitle");
  if (seam === "rank_down") return learnerTerm("splashRankDownTitle");
  return learnerTerm("splashRankUpTitle");
}

// The seam-triggered leaderboard splash (R3, KTD5). On mount it compares the current board to the
// learner's client-local last-seen snapshot: a new week, a rank change, or a freshly-earned podium
// opens the full-screen board; anything else stays silent so an activity is never interrupted. It
// never renders during study — the landing page mounts it only at app entry. Dismissing records
// the snapshot so the same beat never re-fires.
export function LeaderboardSplash(view: LeaderboardSplashView) {
  const [open, setOpen] = useState(false);
  const [seam, setSeam] = useState<SeamChange>("none");

  useEffect(() => {
    const prev = readBoardSeen(view.learnerRef);
    const change = classifySeam(prev, { weekKey: view.weekKey, rank: view.viewerRank, points: view.viewerPoints });
    if (change !== "none" || view.podiumEarnedForPreviousWeek) {
      // Reading the client-local seen store must happen post-mount (SSR has no localStorage), so
      // this synchronous set from an external store is deliberate and hydration-safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeam(change);
      setOpen(true);
    } else {
      // Nothing to celebrate, but keep the snapshot fresh so a later beat compares correctly.
      writeBoardSeen(view.learnerRef, { weekKey: view.weekKey, rank: view.viewerRank, points: view.viewerPoints });
    }
  }, [view.learnerRef, view.weekKey, view.viewerRank, view.viewerPoints, view.podiumEarnedForPreviousWeek]);

  const dismiss = () => {
    writeBoardSeen(view.learnerRef, { weekKey: view.weekKey, rank: view.viewerRank, points: view.viewerPoints });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : dismiss())}>
      <LeaderboardDialogContent
        view={view}
        title={splashTitle(seam, view.podiumEarnedForPreviousWeek)}
        description={view.podiumEarnedForPreviousWeek ? learnerTerm("podiumBody") : seam === "new_week" ? learnerTerm("splashNewWeekBody") : learnerTerm("leaderboardHint")}
      />
    </Dialog>
  );
}
