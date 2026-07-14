import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Menu as MenuIcon } from "lucide-react-native";
import { ExpeditionEntry } from "@/components/ExpeditionEntry";
import { JournalSplashCoordinator } from "@/components/JournalSplashCoordinator";
import { LeaderboardDialog } from "@/components/LeaderboardDialog";
import { LearnerMenuSheet } from "@/components/LearnerMenuSheet";
import { LearnerNameGate } from "@/components/LearnerNameGate";
import { journalQuery, leaderboardQuery, meQuery } from "@/lib/queries";
import { logout } from "@/lib/session";
import { IconButton, RouteStatus, Screen, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

const GENERATION_POLL_MS = 5_000;

// The journal screen. `me` is the session state machine (plan 2026-07-14-001 KTD1): the
// registry gate renders only for a SETTLED signed-out `null`, a stored token being
// validated shows a visible loading state, and a transport failure offers retry while
// keeping the token — never a blank frame (R6). Once signed in, a Journal-fetch failure
// stays signed in and offers Retry + Sign out (R5), so a bad read never bounces the learner
// back to the gate. Recall practice lives on each expedition's trail as Crystal Guardian
// challenges (plan 2026-07-13-003 KTD10 removed the global Duel).
export default function JournalPage() {
  const me = useQuery(meQuery);
  const signedIn = me.data != null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  const journal = useQuery({
    ...journalQuery,
    enabled: signedIn,
    refetchInterval: (query) =>
      query.state.data?.yours.some((expedition) => expedition.status === "generating")
        ? GENERATION_POLL_MS
        : false
  });
  const board = useQuery({ ...leaderboardQuery, enabled: signedIn });

  // Session validation (KTD1): pending = a stored token is being checked; error = the check
  // could not complete (network) — retain the token and retry, do not sign out.
  if (me.isPending) {
    return <RouteStatus tone="loading" title={learnerTerm("sessionValidating")} />;
  }
  if (me.isError) {
    return (
      <RouteStatus
        tone="error"
        title={learnerTerm("sessionErrorTitle")}
        message={learnerTerm("sessionErrorBody")}
        actions={[{ label: learnerTerm("retryAction"), onPress: () => void me.refetch() }]}
      />
    );
  }
  if (!signedIn) {
    return (
      <Screen className="items-center justify-center p-4">
        <LearnerNameGate />
      </Screen>
    );
  }

  const doLogout = () => {
    void logout();
  };

  // Signed in from here: the session is settled, so Journal loading/error are shown WITHOUT
  // returning to the gate (R5, AE2).
  if (journal.isPending) {
    return <RouteStatus tone="loading" title={learnerTerm("journalLoading")} />;
  }
  if (journal.isError || !journal.data) {
    return (
      <RouteStatus
        tone="error"
        title={learnerTerm("journalErrorTitle")}
        message={learnerTerm("journalErrorBody")}
        actions={[
          { label: learnerTerm("retryAction"), onPress: () => void journal.refetch() },
          { label: learnerTerm("logoutAction"), variant: "outline", onPress: doLogout }
        ]}
      />
    );
  }

  const learnerStateRef = me.data!.learnerStateRef;

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
