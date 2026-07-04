"use client";

import { motion } from "motion/react";
import type { TrailView } from "./trailView";
import { GemCapstone } from "./GemCapstone";
import { StopCard } from "./StopCard";
import { learnerTerm } from "./vocabulary";

export function Trail({ view }: Readonly<{ view: TrailView }>) {
  return (
    <div className="relative flex flex-col gap-5">
      <svg aria-hidden className="pointer-events-none absolute left-4 top-0 h-full w-8 text-[color:var(--journal-trail-muted)]">
        <line x1="16" x2="16" y1="0" y2="100%" stroke="currentColor" strokeWidth="3" strokeDasharray="8 8" />
      </svg>
      {view.camps.map((camp) => (
        <section key={camp.topologicalDepth} className="ml-10 flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-[color:var(--journal-muted)]">
            {learnerTerm("camp")} {camp.topologicalDepth + 1}
          </h2>
          {camp.clusters.map((cluster) => (
            <motion.article
              key={cluster.derivedNodeId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 rounded-lg border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-medium">{cluster.label}</h3>
                <GemCapstone collected={cluster.state === "mastered"} />
              </div>
              <div className="flex flex-col gap-2">
                {cluster.stops.map((stop) => <StopCard key={stop.stopId} stop={stop} />)}
              </div>
            </motion.article>
          ))}
        </section>
      ))}
    </div>
  );
}
