import { View } from "react-native";
import { Award, Target } from "lucide-react-native";
import { divisionForMasteredCrystals } from "@/learn/division";
import type { BoardEntry, ChaseTarget } from "@lrnki/learner-api/rival-simulation";
import { Badge, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The board projection (R3): a ranked list of real learners and seeded rivals, the viewer's row
// highlighted, durable award flair rendered beside real rows. Presentational only — the query
// assembles the entries and the chase.
export function LeaderboardBoard({ entries, weekKey, masteredCrystalCount }: { entries: BoardEntry[]; weekKey: string; masteredCrystalCount?: number }) {
  const division = masteredCrystalCount === undefined ? null : divisionForMasteredCrystals(masteredCrystalCount);
  return (
    <View className="gap-2">
      {/* The board's title lives in the owning dialog header (R12); this row keeps the
          week key and division badge beside the entries. */}
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="caption" color="muted">
          {learnerTerm("leaderboardWeek")} {weekKey}
        </Text>
        {division ? (
          <Badge className="border-gem-soft bg-gem-soft">
            {division.name} · {masteredCrystalCount} {learnerTerm("divisionCrystals")}
          </Badge>
        ) : null}
      </View>
      <View className="gap-1">
        {entries.map((entry) => (
          <View
            key={entry.id}
            className={`flex-row items-center gap-3 rounded-card px-3 py-2 ${entry.isViewer ? "border border-trail bg-gem-soft" : "bg-muted-panel"}`}
          >
            <Text variant="label" color="muted" className="w-6 shrink-0 tabular-nums">{entry.rank}</Text>
            <Text variant="label" className={`flex-1 ${entry.isViewer ? "" : "font-normal"}`} numberOfLines={1}>
              {entry.name}
              {entry.isViewer ? <Text variant="caption" color="trail"> ({learnerTerm("leaderboardYou")})</Text> : null}
            </Text>
            {entry.badges.podiums > 0 ? (
              <View className="flex-row items-center gap-0.5">
                <Award size={14} color={colors.award} />
                <Text variant="caption" color="award">{entry.badges.podiums}</Text>
              </View>
            ) : null}
            <Text variant="label" color="muted" className="tabular-nums">
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
    <View className="flex-row items-center gap-2 rounded-card border border-line bg-muted-panel px-3 py-2">
      <Target size={16} color={colors.trail} />
      <Text variant="label" className="flex-1 font-normal">{chaseMessage(chase)}</Text>
    </View>
  );
}
