import { GemIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StudySession } from "@/lib/learnerStudySession";
import { SectionOverview } from "./SectionOverview";
import type { TrailView } from "./trailView";

export function QuestHeader({ session, trail }: Readonly<{ session: StudySession; trail: TrailView }>) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--journal-panel)]/85">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Expedition summit</p>
          <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">{session.target.label}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Non-blocking overview trigger (R5): opens the section map on demand; the guided
              continue flow never needs it. */}
          <SectionOverview sections={trail.sections} currentSectionIndex={trail.currentSectionIndex} />
          <Badge variant="outline" className="gap-1">
            <GemIcon className="size-3.5" />
            {trail.masteredCount}/{trail.totalClusters}
          </Badge>
        </div>
      </div>
    </header>
  );
}
