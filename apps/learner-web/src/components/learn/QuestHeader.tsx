import type { StudySession } from "@lrnki/application";
import { CrystalVista } from "./CrystalVista";
import { buildCrystalFormation } from "./crystalVistaView";
import { SectionOverview } from "./SectionOverview";
import type { TrailView } from "./trailView";

export function QuestHeader({
  session,
  trail,
  expeditionTitle
}: Readonly<{ session: StudySession; trail: TrailView; expeditionTitle: string | null }>) {
  // The learner's topic titles the expedition; the derived summit concept label
  // demotes to a secondary line (unmodified canonical label). Admin-door
  // expeditions carry no row, so the summit label stays the H1 there.
  const title = expeditionTitle ?? session.target.label;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Expedition</p>
          <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">{title}</h1>
          {title !== session.target.label ? (
            <p className="truncate text-xs text-muted-foreground">Summit: {session.target.label}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Non-blocking overview trigger (R5): opens the section map on demand; the guided
              continue flow never needs it. */}
          <SectionOverview sections={trail.sections} concepts={trail.concepts} currentSectionIndex={trail.currentSectionIndex} />
          {/* The crystal tally doubles as the vista door: tap the count to see the
              whole formation. View-only by design (ADR-0032) — a reward to admire, not
              a parallel objective. */}
          <CrystalVista formations={[buildCrystalFormation(session, trail)]} />
        </div>
      </div>
    </header>
  );
}
