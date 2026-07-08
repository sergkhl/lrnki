import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExpeditionEntry } from "@/components/learn/ExpeditionEntry";
import { DuelUnlockSplash } from "@/components/learn/DuelUnlockSplash";
import { LearnerMenuDrawer } from "@/components/learn/LearnerMenuDrawer";
import { LearnerNameGate } from "@/components/learn/LearnerNameGate";
import { LeaderboardSplash } from "@/components/learn/LeaderboardSplash";
import { readToken } from "@/lib/api";
import { duelSetupQuery, journalQuery, leaderboardQuery, meQuery } from "@/lib/queries";

const GENERATION_POLL_MS = 5_000;

// The journal screen (R3): gate when signed out, otherwise the same entry surface the
// SSR page rendered — splashes, menu drawer, and the partitioned expedition journal.
// Query polling replaces revalidatePath while any expedition is scouting.
export function JournalPage() {
  // The token is the session; `me` only validates it (a dev DB reset orphans tokens the
  // same way it orphaned cookies).
  const [hasToken, setHasToken] = useState(() => Boolean(readToken()));
  const me = useQuery({ ...meQuery, enabled: hasToken });
  const signedIn = hasToken && me.data != null;

  const journal = useQuery({
    ...journalQuery,
    enabled: signedIn,
    refetchInterval: (query) =>
      query.state.data?.learnerExpeditions.some((expedition) => expedition.status === "generating")
        ? GENERATION_POLL_MS
        : false
  });
  const board = useQuery({ ...leaderboardQuery, enabled: signedIn });
  const duel = useQuery({ ...duelSetupQuery, enabled: signedIn });

  if (!signedIn) {
    if (hasToken && me.isPending) return null;
    return (
      <section className="flex min-h-[calc(100svh-2rem)] items-center justify-center">
        <LearnerNameGate onEntered={() => setHasToken(true)} />
      </section>
    );
  }

  const learnerStateRef = me.data!.learnerStateRef;
  if (!journal.data) return null;

  return (
    <>
      {board.data ? <LeaderboardSplash learnerRef={learnerStateRef} {...board.data} /> : null}
      <DuelUnlockSplash learnerRef={learnerStateRef} unlocked={Boolean(board.isFetched && duel.data?.unlocked)} />
      <div className="flex justify-end pb-2">
        <LearnerMenuDrawer board={board.data ?? null} onLoggedOut={() => setHasToken(false)} />
      </div>
      <ExpeditionEntry learnerStateRef={learnerStateRef} entry={journal.data} />
    </>
  );
}
