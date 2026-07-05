import { Badge } from "@/components/ui/badge";
import type { StudySession } from "@/lib/learnerStudySession";
import type { TrailView } from "./trailView";
import { learnerTerm } from "./vocabulary";

export function QuestHeader({ session, trail }: Readonly<{ session: StudySession; trail: TrailView }>) {
  const frontier = trail.nextStopLabel ?? learnerTerm("summit");
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--journal-panel)]/85">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Expedition target</p>
          <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">{session.target.label}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="max-w-28 truncate sm:max-w-48">{frontier}</Badge>
          <Badge variant="outline">{trail.masteredCount}/{trail.totalClusters}</Badge>
        </div>
      </div>
    </header>
  );
}
