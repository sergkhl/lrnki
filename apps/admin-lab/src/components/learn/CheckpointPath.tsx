"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { StudySession } from "@lrnki/application";
import { ActivitySheet } from "./ActivitySheet";
import { CheckpointCircle } from "./CheckpointCircle";
import { ConceptMarker } from "./ConceptMarker";
import type { TrailStop, TrailView } from "./trailView";

const WINDING_OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1] as const;
const WINDING_STEP_PX = 28;

export function CheckpointPath({ view, session }: Readonly<{ view: TrailView; session: StudySession }>) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  let globalStopIndex = 0;
  return (
    <>
      <div className="relative mx-auto flex w-full max-w-sm flex-col gap-5 overflow-hidden px-2 py-2">
        <svg aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 text-[color:var(--journal-trail-muted)]">
          <line x1="16" x2="16" y1="0" y2="100%" stroke="currentColor" strokeWidth="3" strokeDasharray="8 8" />
        </svg>
        {view.concepts.map((concept) => (
          <section key={concept.derivedNodeId} className="relative z-10 flex flex-col gap-3">
            <ConceptMarker concept={concept} session={session} />
            <div className="flex flex-col gap-3">
              {concept.stops.map((stop) => {
                const offset = WINDING_OFFSETS[globalStopIndex % WINDING_OFFSETS.length] * WINDING_STEP_PX;
                globalStopIndex += 1;
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
    <div className="relative flex min-h-24 justify-center">
      {showFogBoundary ? (
        <motion.div
          layout
          aria-hidden
          className="absolute left-1/2 top-0 h-10 w-20 -translate-x-1/2 rounded-full bg-[color:var(--journal-fog)] shadow-inner"
        />
      ) : null}
      <div style={{ transform: `translateX(${offset}px)` }}>
        <CheckpointCircle stop={stop} onSelect={onSelect} />
      </div>
    </div>
  );
}
