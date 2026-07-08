import { AwardIcon, SwordsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { divisionForMasteredCrystals } from "./division";
import type { BoardEntry } from "./rivalSimulation";
import { learnerTerm } from "./vocabulary";

// The board projection (R3): a ranked list of real learners and seeded rivals, the viewer's row
// highlighted, durable award flair rendered beside real rows. Presentational only — the loader
// assembles the entries and the chase.
export function LeaderboardBoard({ entries, weekKey, masteredCrystalCount }: { entries: BoardEntry[]; weekKey: string; masteredCrystalCount?: number }) {
  const division = masteredCrystalCount === undefined ? null : divisionForMasteredCrystals(masteredCrystalCount);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">{learnerTerm("leaderboardTitle")}</h2>
          <span className="text-xs text-muted-foreground">
            {learnerTerm("leaderboardWeek")} {weekKey}
          </span>
        </div>
        {division ? (
          <Badge variant="secondary">
            {division.name} · {masteredCrystalCount} {learnerTerm("divisionCrystals")}
          </Badge>
        ) : null}
      </div>
      <ol className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${entry.isViewer ? "bg-primary/10 font-medium ring-1 ring-primary/40" : "bg-muted/30"}`}
          >
            <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{entry.rank}</span>
            <span className="flex-1 truncate">
              {entry.name}
              {entry.isViewer ? <span className="ml-1 text-xs text-primary">({learnerTerm("leaderboardYou")})</span> : null}
            </span>
            {entry.badges.duelWins > 0 ? (
              <span className="flex items-center gap-0.5 text-xs text-amber-500" title={`${entry.badges.duelWins} duel wins`}>
                <SwordsIcon className="size-3.5" aria-hidden />
                {entry.badges.duelWins}
              </span>
            ) : null}
            {entry.badges.podiums > 0 ? (
              <span className="flex items-center gap-0.5 text-xs text-amber-500" title={`${entry.badges.podiums} podiums`}>
                <AwardIcon className="size-3.5" aria-hidden />
                {entry.badges.podiums}
              </span>
            ) : null}
            <span className="tabular-nums text-muted-foreground">
              {entry.points} {learnerTerm("leaderboardPoints")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
