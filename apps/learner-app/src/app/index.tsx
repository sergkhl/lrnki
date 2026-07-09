import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LogOut, Trophy } from "lucide-react-native";
import { ExpeditionEntry } from "@/components/ExpeditionEntry";
import { LearnerNameGate } from "@/components/LearnerNameGate";
import { readToken } from "@/lib/api";
import { journalQuery, meQuery } from "@/lib/queries";
import { logout } from "@/lib/session";
import { learnerTerm } from "@/learn/vocabulary";

const GENERATION_POLL_MS = 5_000;

// The journal screen (R3): gate when signed out, otherwise the entry surface — header menu
// (Board / Logout) and the partitioned expedition journal. Query polling replaces
// revalidatePath while any expedition is scouting. Splashes and the Duel door return in the
// follow-up pass.
export default function JournalPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  if (!signedIn) {
    if (hasToken && me.isPending) return null;
    return (
      <View className="flex-1 items-center justify-center bg-background p-4" style={{ paddingTop: insets.top }}>
        <LearnerNameGate onEntered={() => setHasToken(true)} />
      </View>
    );
  }

  const learnerStateRef = me.data!.learnerStateRef;
  if (!journal.data) return null;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4">
        <View className="flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={learnerTerm("leaderboardTitle")}
            onPress={() => router.push("/leaderboard")}
            className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 active:opacity-80"
          >
            <Trophy size={14} color="#241f18" />
            <Text className="text-xs font-medium text-ink">Board</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={learnerTerm("logoutAction")}
            onPress={() => {
              void logout().then(() => setHasToken(false));
            }}
            className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 active:opacity-80"
          >
            <LogOut size={14} color="#241f18" />
            <Text className="text-xs font-medium text-ink">{learnerTerm("logoutAction")}</Text>
          </Pressable>
        </View>
        <ExpeditionEntry learnerStateRef={learnerStateRef} entry={journal.data} />
      </ScrollView>
    </View>
  );
}
