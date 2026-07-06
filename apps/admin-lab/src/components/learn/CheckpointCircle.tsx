"use client";

import { BookOpenIcon, LockIcon, MapPinIcon, Rows3Icon, SearchIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster, TrailStop } from "./trailView";
import { learnerTerm } from "./vocabulary";

export function CheckpointCircle({
  stop,
  concept,
  onSelect
}: Readonly<{ stop: TrailStop; concept: TrailCluster; onSelect: (stopId: string) => void }>) {
  const disabled = stop.state === "locked";
  const label = `${labelForStop(stop)}: ${stop.label}`;
  return (
    <div className="relative flex w-24 flex-col items-center gap-2">
      {stop.isNext ? (
        <motion.span
          aria-hidden
          className="absolute top-0 size-20 rounded-full bg-[color:var(--journal-halo)]"
          animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.18, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        data-state={stop.state}
        data-current={stop.isNext || undefined}
        className={cn(
          "relative z-10 flex size-16 items-center justify-center rounded-full border-2 text-[color:var(--journal-ink)] shadow-sm transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          stop.isNext ? "size-18 border-[color:var(--journal-frontier)] bg-[color:var(--journal-panel)] shadow-md" : null,
          // A complete capstone keeps a soft backdrop so the collected crystal itself
          // carries the color; other complete stops stay solid-filled.
          stop.state === "complete"
            ? stop.kind === "capstone"
              ? "border-[color:var(--journal-gem)] bg-[color:var(--journal-gem-soft)]"
              : "border-[color:var(--journal-gem)] bg-[color:var(--journal-gem)] text-white"
            : null,
          stop.state === "available" && !stop.isNext ? "border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]" : null,
          stop.state === "locked" ? "cursor-not-allowed border-[color:var(--journal-fog)] bg-[color:var(--journal-fog)] text-white opacity-75" : "cursor-pointer active:-translate-y-0.5"
        )}
        onClick={() => {
          if (!disabled) onSelect(stop.stopId);
        }}
      >
        {iconForStop(stop, concept)}
      </button>
      {stop.isNext ? (
        <span className="max-w-24 text-center text-xs font-medium leading-tight text-[color:var(--journal-ink)]">
          {labelForStop(stop)}
        </span>
      ) : null}
    </div>
  );
}

function iconForStop(stop: TrailStop, concept: TrailCluster) {
  if (stop.state === "locked") return <LockIcon />;
  if (stop.kind === "theory") return <BookOpenIcon />;
  if (stop.kind === "option_select") return <MapPinIcon />;
  if (stop.kind === "matching") return <Rows3Icon />;
  if (stop.kind === "impostor") return <SearchIcon />;
  // The capstone is the concept's own crystal, mid-growth until the completion rule
  // masters the node — the same formation the marker, header, and vista show.
  return (
    <CrystalGlyph
      derivedNodeId={concept.derivedNodeId}
      difficulty={concept.difficulty}
      growthFraction={concept.growthFraction}
      state={stop.state === "complete" ? "mastered" : "frontier"}
      ghost={concept.isKnownSkipped && stop.state === "complete"}
      size={40}
    />
  );
}

function labelForStop(stop: TrailStop): string {
  if (stop.kind === "theory") return learnerTerm("theoryStop");
  if (stop.kind === "option_select") return learnerTerm("question");
  if (stop.kind === "matching") return learnerTerm("matching");
  if (stop.kind === "impostor") return learnerTerm("spotTheFake");
  return learnerTerm("capstone");
}
