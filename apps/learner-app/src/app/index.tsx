import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Menu as MenuIcon } from "lucide-react-native";
import { ExpeditionEntry } from "@/components/ExpeditionEntry";
import { JournalSplashCoordinator } from "@/components/JournalSplashCoordinator";
import { LeaderboardDialog } from "@/components/LeaderboardDialog";
import { LearnerMenuSheet } from "@/components/LearnerMenuSheet";
import { LearnerNameGate } from "@/components/LearnerNameGate";
import { readToken } from "@/lib/api";
import { journalQuery, leaderboardQuery, meQuery } from "@/lib/queries";
import { logout } from "@/lib/session";
import { IconButton, Screen, colors } from "@/ui";

const GENERATION_POLL_MS = 5_000;

// The journal screen (R3/R11): gate when signed out, otherwise the entry surface — one
// menu trigger (Board / logout as sheet rows), the partitioned expedition journal, and
// the one-splash-per-visit coordinator. Recall practice lives on each expedition's trail
// as Crystal Guardian challenges (plan 2026-07-13-003 KTD10 removed the global Duel).
export default function JournalPage() {
  // The token is the session; `me` only validates it (a dev DB reset orphans tokens the
  // same way it orphaned cookies).
  const [hasToken, setHasToken] = useState(() => Boolean(readToken()));
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const me = useQuery({ ...meQuery, enabled: hasToken });
  const signedIn = hasToken && me.data != null;

  const journal = useQuery({
    ...journalQuery,
    enabled: signedIn,
    refetchInterval: (query) =>
      query.state.data?.yours.some((expedition) => expedition.status === "generating")
        ? GENERATION_POLL_MS
        : false
  });
  const board = useQuery({ ...leaderboardQuery, enabled: signedIn });

  if (!signedIn) {
    if (hasToken && me.isPending) return null;
    return (
      <Screen className="items-center justify-center p-4">
        <LearnerNameGate onEntered={() => setHasToken(true)} />
      </Screen>
    );
  }

  const learnerStateRef = me.data!.learnerStateRef;
  if (!journal.data) return null;

  const doLogout = () => {
    void logout().then(() => setHasToken(false));
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4">
        <View className="flex-row justify-end">
          <IconButton
            icon={<MenuIcon size={18} color={colors.ink} />}
            accessibilityLabel="Menu"
            onPress={() => setMenuOpen(true)}
          />
        </View>
        <ExpeditionEntry learnerStateRef={learnerStateRef} entry={journal.data} />
      </ScrollView>
      <LearnerMenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        boardAvailable={board.data != null}
        onOpenBoard={() => setBoardOpen(true)}
        onLogout={doLogout}
      />
      {board.data ? <LeaderboardDialog open={boardOpen} onOpenChange={setBoardOpen} board={board.data} /> : null}
      <JournalSplashCoordinator
        learnerStateRef={learnerStateRef}
        board={board.isPending ? undefined : board.data ?? null}
      />
    </Screen>
  );
}
