"use client";

import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster } from "./trailView";

// A section's crystals at a glance: one mini glyph per concept, growing exactly as its
// trail capstone does. Decorative (the counts beside it carry the accessible truth).
export function SectionCrystalStrip({ concepts, className }: Readonly<{ concepts: TrailCluster[]; className?: string }>) {
  return (
    <span aria-hidden className={className ? `flex flex-wrap items-center gap-0.5 ${className}` : "flex flex-wrap items-center gap-0.5"}>
      {concepts.map((concept) => (
        <CrystalGlyph
          key={concept.derivedNodeId}
          derivedNodeId={concept.derivedNodeId}
          difficulty={concept.difficulty}
          growthFraction={concept.growthFraction}
          state={concept.state}
          size={14}
        />
      ))}
    </span>
  );
}
