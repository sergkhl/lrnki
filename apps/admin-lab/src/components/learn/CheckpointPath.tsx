"use client";

import { useEffect, useRef, useState } from "react";
import type { StudySession } from "@lrnki/application";
import { FlagIcon } from "lucide-react";
import { ActivitySheet } from "./ActivitySheet";
import { CheckpointCircle } from "./CheckpointCircle";
import { ConceptMarker } from "./ConceptMarker";
import { SectionCrystalStrip } from "./SectionCrystalStrip";
import { cn } from "@/lib/utils";
import { learnerTerm } from "./vocabulary";
import { sectionAnchorId, type TrailCluster, type TrailStop, type TrailView } from "./trailView";

const WINDING_OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1] as const;
const WINDING_STEP_PX = 28;

export function CheckpointPath({ view, session }: Readonly<{ view: TrailView; session: StudySession }>) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);

  // Landing auto-scrolls to the next stop so the guided "continue" is always in view (F1) — no
  // interstitial route. Runs once on mount and whenever the next stop changes after a refresh.
  useEffect(() => {
    if (!view.nextStopId) return;
    const target = scrollRootRef.current?.querySelector(`[data-stop-id="${CSS.escape(view.nextStopId)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [view.nextStopId]);

  return (
    <>
      <div ref={scrollRootRef} className="relative mx-auto flex w-full max-w-sm flex-col gap-5 overflow-hidden px-2 py-2">
        <svg aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 text-[color:var(--journal-trail-muted)]">
          <line x1="16" x2="16" y1="0" y2="100%" stroke="currentColor" strokeWidth="3" strokeDasharray="8 8" />
        </svg>
        {view.concepts.map((concept, conceptIndex) => (
          <div key={concept.derivedNodeId} className="flex flex-col gap-5">
            {concept.isSectionStart ? (
              <SectionDivider
                concept={concept}
                sectionConcepts={view.concepts.filter((candidate) => candidate.sectionIndex === concept.sectionIndex)}
              />
            ) : null}
            <section className="relative z-10 flex flex-col gap-3">
              <ConceptMarker concept={concept} session={session} />
              <div className="flex flex-col gap-3">
                {concept.stops.map((stop, stopIndex) => {
                  const globalStopIndex = view.concepts
                    .slice(0, conceptIndex)
                    .reduce((count, priorConcept) => count + priorConcept.stops.length, stopIndex);
                  const offset = WINDING_OFFSETS[globalStopIndex % WINDING_OFFSETS.length] * WINDING_STEP_PX;
                  return <CheckpointStopRow key={stop.stopId} stop={stop} concept={concept} offset={offset} onSelect={setSelectedStopId} />;
                })}
              </div>
            </section>
          </div>
        ))}
      </div>
      <ActivitySheet
        session={session}
        stopId={selectedStopId}
        open={selectedStopId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedStopId(null);
        }}
      />
    </>
  );
}

// A section boundary marker (R5 display) carrying the scroll anchor the overview jumps to.
// Its crystal strip previews the section's formation growing as concepts complete.
function SectionDivider({ concept, sectionConcepts }: Readonly<{ concept: TrailCluster; sectionConcepts: TrailCluster[] }>) {
  return (
    <div
      id={sectionAnchorId(concept.sectionIndex)}
      className="relative z-10 flex scroll-mt-20 items-center gap-2 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] px-3 py-2"
    >
      <FlagIcon className="size-4 shrink-0 text-[color:var(--journal-frontier)]" />
      <p className="min-w-0 truncate text-sm font-semibold">
        <span className="text-muted-foreground">{learnerTerm("section")} {concept.sectionIndex + 1}</span> · {concept.milestoneLabel}
      </p>
      <SectionCrystalStrip concepts={sectionConcepts} className="ml-auto shrink-0 justify-end" />
    </div>
  );
}

function CheckpointStopRow({
  stop,
  concept,
  offset,
  onSelect
}: Readonly<{ stop: TrailStop; concept: TrailCluster; offset: number; onSelect: (stopId: string) => void }>) {
  return (
    <div
      data-stop-id={stop.stopId}
      className={cn(
        "relative flex min-h-24 scroll-mt-24 justify-center rounded-md py-1 transition",
        // Per-stop lock dimming replaces the single fog-boundary gradient (U5): every fogged
        // stop dims individually, so section boundaries read as steps rather than one wall.
        stop.isFogged ? "opacity-55 saturate-50" : null
      )}
    >
      <div className="relative z-10" style={{ transform: `translateX(${offset}px)` }}>
        <CheckpointCircle stop={stop} concept={concept} onSelect={onSelect} />
      </div>
    </div>
  );
}
