"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CrystalGlyph } from "./CrystalGlyph";
import { learnerTerm } from "./vocabulary";
import {
  completeSectionIndexes,
  placeFormation,
  VISTA_CRYSTAL_SIZE,
  type CrystalFormation,
  type PlacedFormation
} from "./crystalVistaView";

// The Crystal Vista (view-only, ADR-0032): the learner's knowledge as one growing
// crystal formation. Nothing to do here but admire — no navigation, no goals, no
// per-crystal interaction — so it rewards mastery without becoming a parallel
// objective. Opened on demand from the header tally, and auto-opened once as a
// celebration when a trail section becomes fully mastered.
export function CrystalVista({ formations }: Readonly<{ formations: CrystalFormation[] }>) {
  const [open, setOpen] = useState(false);
  const [celebratedSections, setCelebratedSections] = useState<number[] | null>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const placed = useMemo(() => formations.map(placeFormation), [formations]);

  const current = formations[0];
  const masteredCount = current ? current.nodes.filter((node) => node.state === "mastered").length : 0;
  const totalCount = current ? current.nodes.length : 0;

  // Celebration: when the current expedition gains a fully-mastered section, open the
  // vista once with that section's crystals assembling. The landing render never
  // celebrates — only a transition observed within this visit does.
  const complete = useMemo(() => (current ? completeSectionIndexes(current) : []), [current]);
  const previousComplete = useRef<number[] | null>(null);
  useEffect(() => {
    const previous = previousComplete.current;
    previousComplete.current = complete;
    if (previous === null) return;
    const fresh = complete.filter((sectionIndex) => !previous.includes(sectionIndex));
    if (fresh.length === 0) return;
    setCelebratedSections(fresh);
    setOpen(true);
  }, [complete]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setCelebratedSections(null);
      }}
    >
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <CrystalGlyph
              derivedNodeId={current?.title ?? "expedition"}
              difficulty={0.5}
              growthFraction={totalCount === 0 ? 0 : masteredCount / totalCount}
              state={totalCount > 0 && masteredCount === totalCount ? "mastered" : "frontier"}
              size={16}
              ariaLabel={learnerTerm("gems")}
            />
            <span>
              {masteredCount}/{totalCount}
            </span>
          </Button>
        }
      />
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-0">
        <SheetHeader className="border-b border-[color:var(--journal-line)] px-4 py-3">
          <SheetTitle>{learnerTerm("vistaTitle")}</SheetTitle>
          <SheetDescription>{learnerTerm("vistaHint")}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {celebratedSections?.length ? (
            <p className="mb-3 rounded-md bg-[color:var(--journal-gem-soft)] px-3 py-2 text-sm font-medium text-[color:var(--journal-ink)]">
              {learnerTerm("section")} {celebratedSections.map((sectionIndex) => sectionIndex + 1).join(", ")} crystallized ✦
            </p>
          ) : null}
          {placed.map((formation) => (
            <FormationCanvas
              key={formation.title}
              formation={formation}
              showTitle={placed.length > 1}
              celebratedSections={celebratedSections}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FormationCanvas({
  formation,
  showTitle,
  celebratedSections,
  reducedMotion
}: Readonly<{
  formation: PlacedFormation;
  showTitle: boolean;
  celebratedSections: number[] | null;
  reducedMotion: boolean;
}>) {
  if (formation.crystals.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has crystallized here yet.</p>;
  }
  const { viewBox } = formation;
  const canvas = (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      // Keep crystals admirable on a phone: never scale the formation below ~58% of
      // layout scale — a wide formation pans horizontally instead of shrinking.
      style={{ width: `max(100%, ${Math.round(viewBox.width * 0.58)}px)` }}
      role="img"
      aria-label={formation.title}
    >
      {/* Prerequisite veins run beneath the crystals: the lattice the formation grew
          along. Uncertain edges stay visibly tentative (dashed). */}
      {formation.veins.map((vein) => (
        <polyline
          key={vein.key}
          points={vein.points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="var(--journal-trail-muted)"
          strokeWidth={3}
          strokeDasharray={vein.uncertain ? "6 6" : undefined}
          opacity={0.55}
        />
      ))}
      {formation.crystals.map((crystal) => (
        <g
          key={crystal.derivedNodeId}
          // Land the glyph's bedrock anchor (CRYSTAL_BASE at 50%,95% of its box) on the
          // layout position, so veins meet crystals exactly where they root.
          transform={`translate(${crystal.x - VISTA_CRYSTAL_SIZE * 0.5} ${crystal.y - VISTA_CRYSTAL_SIZE * 0.95})`}
        >
          <CrystalGlyph
            derivedNodeId={crystal.derivedNodeId}
            difficulty={crystal.difficulty}
            growthFraction={crystal.growthFraction}
            state={crystal.state}
            size={VISTA_CRYSTAL_SIZE}
            assemble={celebratedSections?.includes(crystal.sectionIndex) === true && crystal.state === "mastered"}
            ariaLabel={crystal.label}
          />
        </g>
      ))}
    </svg>
  );
  return (
    <section className="flex flex-col gap-1">
      {showTitle ? <h3 className="text-sm font-semibold">{formation.title}</h3> : null}
      <div className="overflow-x-auto">
        {reducedMotion ? (
          canvas
        ) : (
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
            {canvas}
          </motion.div>
        )}
      </div>
    </section>
  );
}
