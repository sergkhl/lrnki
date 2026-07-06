"use client";

import { useState } from "react";
import { CheckIcon, LockIcon, MapIcon, MoveRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { learnerTerm } from "./vocabulary";
import { SectionCrystalStrip } from "./SectionCrystalStrip";
import { sectionAnchorId, type TrailCluster, type TrailSectionView } from "./trailView";

// The non-blocking section overview (R5, U5). Opened on demand from the header — the guided
// "continue" flow never requires it. Lists every section with its state and progress; tapping an
// unlocked section scrolls the trail to it (F2 directed jump), while a fogged section names the
// concepts that gate it rather than blocking. Landing state is not touched, so the header's
// guided-continue affordance stays the default path (F1).
export function SectionOverview({
  sections,
  concepts,
  currentSectionIndex
}: Readonly<{ sections: TrailSectionView[]; concepts: TrailCluster[]; currentSectionIndex: number }>) {
  const [open, setOpen] = useState(false);
  const current = sections.find((section) => section.sectionIndex === currentSectionIndex) ?? sections[0];

  const jumpTo = (section: TrailSectionView) => {
    if (section.state === "locked") return;
    setOpen(false);
    // Defer until the sheet begins closing so the scroll target is not under the overlay.
    requestAnimationFrame(() => {
      document.getElementById(sectionAnchorId(section.sectionIndex))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="max-w-[10rem] gap-1.5 sm:max-w-none">
            <MapIcon data-icon="inline-start" />
            <span className="truncate">
              {learnerTerm("section")} {sections.length === 0 ? 0 : (current?.sectionIndex ?? 0) + 1}/{sections.length}
            </span>
          </Button>
        }
      />
      <SheetContent side="bottom" className="max-h-[70dvh] gap-0 border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-0">
        <SheetHeader className="border-b border-[color:var(--journal-line)] px-4 py-3">
          <SheetTitle>{learnerTerm("sectionOverview")}</SheetTitle>
          <SheetDescription>{learnerTerm("sectionOverviewHint")}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {sections.map((section) => (
            <li key={section.sectionIndex}>
              <button
                type="button"
                disabled={section.state === "locked"}
                onClick={() => jumpTo(section)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border border-[color:var(--journal-line)] p-3 text-left transition",
                  section.state === "locked" ? "opacity-60" : "hover:bg-[color:var(--journal-background)]",
                  section.sectionIndex === currentSectionIndex ? "ring-2 ring-[color:var(--journal-frontier)]" : null
                )}
              >
                <SectionStateIcon state={section.state} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {learnerTerm("section")} {section.sectionIndex + 1}: {section.milestoneLabel}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {section.masteredCount}/{section.conceptCount} concepts · {section.stopsComplete}/{section.stopsTotal} stops
                    {section.state === "locked" && section.gatingLabels.length
                      ? ` · ${learnerTerm("gatedBy")}: ${section.gatingLabels.join(", ")}`
                      : ""}
                  </p>
                  <SectionCrystalStrip
                    concepts={concepts.filter((concept) => concept.sectionIndex === section.sectionIndex)}
                    className="mt-1"
                  />
                </div>
                {section.state === "locked" ? null : <MoveRightIcon className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SectionStateIcon({ state }: Readonly<{ state: TrailSectionView["state"] }>) {
  if (state === "complete") {
    return (
      <Badge variant="secondary" className="shrink-0 rounded-full p-1.5">
        <CheckIcon className="size-3.5" />
      </Badge>
    );
  }
  if (state === "locked") {
    return (
      <Badge variant="outline" className="shrink-0 rounded-full p-1.5">
        <LockIcon className="size-3.5" />
      </Badge>
    );
  }
  return <span className="size-2.5 shrink-0 rounded-full bg-[color:var(--journal-frontier)]" aria-hidden />;
}
