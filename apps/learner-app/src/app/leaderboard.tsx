import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ChaseBanner, LeaderboardBoard } from "@/components/LeaderboardBoard";
import { leaderboardQuery } from "@/lib/queries";

// Read-only leaderboard screen (U4): 10-row cohort board with viewer highlight, division
// badge, chase banner. The seam-triggered splash is deferred with the other splashes.
export default function LeaderboardPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const board = useQuery(leaderboardQuery);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-line bg-card px-4 py-2">
        <Pressable
          accessibilityRole="button"
          onPress={goHome}
          className="flex-row items-center gap-1.5 self-start rounded-xl border border-line bg-card px-3 py-1.5 active:opacity-80"
        >
          <ArrowLeft size={14} color="#241f18" />
          <Text className="text-xs font-medium text-ink">Expeditions</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4">
        {board.data ? (
          <>
            <ChaseBanner chase={board.data.chase} />
            <LeaderboardBoard
              entries={board.data.entries}
              weekKey={board.data.weekKey}
              masteredCrystalCount={board.data.masteredCrystalCount}
            />
          </>
        ) : (
          <Text className="text-sm text-muted">{board.isPending ? "Loading the board…" : "The board is not available."}</Text>
        )}
      </ScrollView>
    </View>
  );
}
