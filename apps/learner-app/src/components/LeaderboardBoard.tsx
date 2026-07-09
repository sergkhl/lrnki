import { Text, View } from "react-native";
import { Award, Swords, Target } from "lucide-react-native";
import { divisionForMasteredCrystals } from "@/learn/division";
import type { BoardEntry, ChaseTarget } from "@lrnki/learner-api/rival-simulation";
import { BadgeLabel } from "./ui";
import { learnerTerm } from "@/learn/vocabulary";

// The board projection (R3): a ranked list of real learners and seeded rivals, the viewer's row
// highlighted, durable award flair rendered beside real rows. Presentational only — the query
// assembles the entries and the chase.
export function LeaderboardBoard({ entries, weekKey, masteredCrystalCount }: { entries: BoardEntry[]; weekKey: string; masteredCrystalCount?: number }) {
  const division = masteredCrystalCount === undefined ? null : divisionForMasteredCrystals(masteredCrystalCount);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View>
          <Text className="text-sm font-semibold text-ink">{learnerTerm("leaderboardTitle")}</Text>
          <Text className="text-xs text-muted">
            {learnerTerm("leaderboardWeek")} {weekKey}
          </Text>
        </View>
        {division ? (
          <BadgeLabel className="border-gem-soft bg-gem-soft">
            {division.name} · {masteredCrystalCount} {learnerTerm("divisionCrystals")}
          </BadgeLabel>
        ) : null}
      </View>
      <View className="gap-1">
        {entries.map((entry) => (
          <View
            key={entry.id}
            className={`flex-row items-center gap-3 rounded-xl px-3 py-2 ${entry.isViewer ? "border border-trail bg-gem-soft" : "bg-muted-panel"}`}
          >
            <Text className="w-6 shrink-0 text-sm tabular-nums text-muted">{entry.rank}</Text>
            <Text className={`flex-1 text-sm text-ink ${entry.isViewer ? "font-medium" : ""}`} numberOfLines={1}>
              {entry.name}
              {entry.isViewer ? <Text className="text-xs text-trail"> ({learnerTerm("leaderboardYou")})</Text> : null}
            </Text>
            {entry.badges.duelWins > 0 ? (
              <View className="flex-row items-center gap-0.5">
                <Swords size={14} color="#b45309" />
                <Text className="text-xs text-[#b45309]">{entry.badges.duelWins}</Text>
              </View>
            ) : null}
            {entry.badges.podiums > 0 ? (
              <View className="flex-row items-center gap-0.5">
                <Award size={14} color="#b45309" />
                <Text className="text-xs text-[#b45309]">{entry.badges.podiums}</Text>
              </View>
            ) : null}
            <Text className="text-sm tabular-nums text-muted">
              {entry.points} {learnerTerm("leaderboardPoints")}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// The chase framing (R6): one highlighted rival rendered as a single banner. Pure copy assembly
// over the vocabulary templates — no new gameplay, no new state.
export function chaseMessage(chase: ChaseTarget): string {
  if (chase.direction === "behind") {
    return learnerTerm("chaseBehindTemplate").replace("{name}", chase.name).replace("{gap}", String(chase.gap));
  }
  const crystals = chase.gap <= 5 ? learnerTerm("chaseCrystalSingular") : learnerTerm("chaseCrystalPlural");
  return learnerTerm("chaseAheadTemplate").replace("{name}", chase.name).replace("{gap}", String(chase.gap)).replace("{crystals}", crystals);
}

export function ChaseBanner({ chase }: { chase: ChaseTarget | null }) {
  if (!chase) return null;
  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-line bg-muted-panel px-3 py-2">
      <Target size={16} color="#617a55" />
      <Text className="flex-1 text-sm text-ink">{chaseMessage(chase)}</Text>
    </View>
  );
}
