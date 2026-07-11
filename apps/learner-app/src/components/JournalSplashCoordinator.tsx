import { useEffect, useRef, useState } from "react";
import type { LeaderboardView } from "@/lib/api";
import { classifySeam, type SeamChange } from "@/learn/seamClassifier";
import { chooseSplash, isBoardSplash, type SplashEvent } from "@/learn/splashPriority";
import { markDuelUnlockSeen, readBoardSeen, readDuelUnlockSeen, writeBoardSeen } from "@/lib/navMemory";
import { DuelUnlockDialog } from "./DuelUnlockDialog";
import { LeaderboardDialog } from "./LeaderboardDialog";
import { learnerTerm } from "@/learn/vocabulary";

// One coordinator per journal visit (R13, KTD5): after the Board and Duel reads AND the
// device navigation memory settle, a pure priority pick mounts at most one splash for
// this mount. Dismissing (or accepting) writes ONLY the shown event's lossable seen
// state — an eligible lower-priority event stays unseen for a later visit (AE5).
export function JournalSplashCoordinator({
  learnerStateRef,
  board,
  duelUnlocked,
  onEnterDuel
}: Readonly<{
  learnerStateRef: string;
  /** The settled board view, or null when the read is unavailable. */
  board: LeaderboardView | null | undefined;
  /** The settled duel unlock flag, or null when the read is unavailable. */
  duelUnlocked: boolean | null | undefined;
  onEnterDuel: () => void;
}>) {
  // The seam rides along only to pick the rank-up vs rank-down title copy.
  const [splash, setSplash] = useState<{ event: SplashEvent; seam: SeamChange } | null>(null);
  const decidedRef = useRef(false);

  useEffect(() => {
    // undefined = still loading; null = settled but unavailable. Decide exactly once.
    if (decidedRef.current || board === undefined || duelUnlocked === undefined) return;
    decidedRef.current = true;
    void (async () => {
      const [duelSeen, boardSeen] = await Promise.all([
        readDuelUnlockSeen(learnerStateRef),
        readBoardSeen(learnerStateRef)
      ]);
      const seam = board
        ? classifySeam(boardSeen, { weekKey: board.weekKey, rank: board.viewerRank, points: board.viewerPoints })
        : "none";
      const chosen = chooseSplash({
        duelUnlockEligible: duelUnlocked === true && !duelSeen,
        podiumEarnedForPreviousWeek: board?.podiumEarnedForPreviousWeek ?? false,
        seam
      });
      if (chosen === null) {
        // Nothing to celebrate: keep the snapshot fresh so a later beat compares right.
        if (board) await writeBoardSeen(learnerStateRef, { weekKey: board.weekKey, rank: board.viewerRank, points: board.viewerPoints });
        return;
      }
      setSplash({ event: chosen, seam });
    })();
  }, [board, duelUnlocked, learnerStateRef]);

  const dismiss = () => {
    if (splash === null) return;
    if (isBoardSplash(splash.event) && board) {
      void writeBoardSeen(learnerStateRef, { weekKey: board.weekKey, rank: board.viewerRank, points: board.viewerPoints });
    }
    if (splash.event === "duel_unlock") {
      void markDuelUnlockSeen(learnerStateRef);
    }
    // No chaining: the next eligible event waits for a later journal visit.
    setSplash(null);
  };

  if (splash === null) return null;

  if (splash.event === "duel_unlock") {
    return (
      <DuelUnlockDialog
        open
        onOpenChange={(next) => {
          if (!next) dismiss();
        }}
        onEnterDuel={() => {
          // Mark seen BEFORE navigating; a storage failure never blocks the arena.
          void markDuelUnlockSeen(learnerStateRef);
          setSplash(null);
          onEnterDuel();
        }}
      />
    );
  }

  if (!board) return null;
  return (
    <LeaderboardDialog
      open
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      board={board}
      title={boardSplashTitle(splash.event, splash.seam)}
      description={boardSplashDescription(splash.event)}
    />
  );
}

function boardSplashTitle(event: SplashEvent, seam: SeamChange): string {
  if (event === "podium") return learnerTerm("podiumTitle");
  if (event === "new_week") return learnerTerm("splashNewWeekTitle");
  return seam === "rank_down" ? learnerTerm("splashRankDownTitle") : learnerTerm("splashRankUpTitle");
}

function boardSplashDescription(event: SplashEvent): string {
  if (event === "podium") return learnerTerm("podiumBody");
  if (event === "new_week") return learnerTerm("splashNewWeekBody");
  return learnerTerm("leaderboardHint");
}
