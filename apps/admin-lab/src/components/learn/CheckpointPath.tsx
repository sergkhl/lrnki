"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { StudySession } from "@lrnki/application";
import { ActivitySheet } from "./ActivitySheet";
import { CheckpointCircle } from "./CheckpointCircle";
import { ConceptMarker } from "./ConceptMarker";
import { cn } from "@/lib/utils";
import type { TrailStop, TrailView } from "./trailView";

const WINDING_OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1] as const;
const WINDING_STEP_PX = 28;

export function CheckpointPath({ view, session }: Readonly<{ view: TrailView; session: StudySession }>) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  return (
    <>
      <div className="relative mx-auto flex w-full max-w-sm flex-col gap-5 overflow-hidden px-2 py-2">
        <svg aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 text-[color:var(--journal-trail-muted)]">
          <line x1="16" x2="16" y1="0" y2="100%" stroke="currentColor" strokeWidth="3" strokeDasharray="8 8" />
        </svg>
        {view.concepts.map((concept, conceptIndex) => (
          <section key={concept.derivedNodeId} className="relative z-10 flex flex-col gap-3">
            <ConceptMarker concept={concept} session={session} />
            <div className="flex flex-col gap-3">
              {concept.stops.map((stop, stopIndex) => {
                const globalStopIndex = view.concepts
                  .slice(0, conceptIndex)
                  .reduce((count, priorConcept) => count + priorConcept.stops.length, stopIndex);
                const offset = WINDING_OFFSETS[globalStopIndex % WINDING_OFFSETS.length] * WINDING_STEP_PX;
                return (
                  <CheckpointStopRow
                    key={stop.stopId}
                    stop={stop}
                    offset={offset}
                    showFogBoundary={stop.stopId === view.fogBoundaryStopId}
                    onSelect={setSelectedStopId}
                  />
                );
              })}
            </div>
          </section>
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

function CheckpointStopRow({
  stop,
  offset,
  showFogBoundary,
  onSelect
}: Readonly<{ stop: TrailStop; offset: number; showFogBoundary: boolean; onSelect: (stopId: string) => void }>) {
  return (
    <div
      className={cn(
        "relative flex min-h-24 justify-center rounded-md py-1 transition",
        stop.isFogged ? "opacity-55 saturate-50" : null,
        showFogBoundary ? "before:absolute before:inset-x-0 before:top-1/2 before:h-16 before:-translate-y-1/2 before:bg-gradient-to-b before:from-transparent before:via-[color:var(--journal-fog)] before:to-transparent" : null
      )}
    >
      {showFogBoundary ? (
        <motion.div
          layout
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[color:var(--journal-line)]"
        />
      ) : null}
      <div className="relative z-10" style={{ transform: `translateX(${offset}px)` }}>
        <CheckpointCircle stop={stop} onSelect={onSelect} />
      </div>
    </div>
  );
}
