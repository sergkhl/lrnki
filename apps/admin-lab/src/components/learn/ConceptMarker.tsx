"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, Undo2Icon } from "lucide-react";
import type { StudySession } from "@lrnki/application";
import { clearLearnerVerdict, refreshLearnerExpedition, setLearnerVerdict } from "@/app/learn/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster } from "./trailView";
import { learnerTerm } from "./vocabulary";

export function ConceptMarker({ concept, session }: Readonly<{ concept: TrailCluster; session: StudySession }>) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isMastered = concept.state === "mastered";
  const isKnownVerdict = session.verdictByNode[concept.derivedNodeId] === "known";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left shadow-sm"
          />
        }
      >
        <span className="min-w-0 truncate text-sm font-semibold">{concept.label}</span>
        <CrystalGlyph
          derivedNodeId={concept.derivedNodeId}
          difficulty={concept.difficulty}
          growthFraction={concept.growthFraction}
          state={concept.state}
          ghost={concept.isKnownSkipped}
          size={26}
          className="shrink-0"
          ariaLabel={concept.isKnownSkipped ? learnerTerm("known") : isMastered ? "Collected" : "Not collected"}
        />
      </PopoverTrigger>
      <PopoverContent className="learn-theme flex flex-col gap-3 border-border bg-card">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{concept.label}</p>
          <p className="text-sm text-muted-foreground">
            {concept.isKnownSkipped ? learnerTerm("known") : stateLabel(concept.state)} · {concept.stops.length} stops · <DifficultyRating difficulty={concept.difficulty} />
          </p>
        </div>
        {isKnownVerdict ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await clearLearnerVerdict({
                  learnerStateRef: session.learnerStateRef,
                  enrichmentId: session.enrichmentId,
                  derivedNodeId: concept.derivedNodeId
                });
                await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
                setOpen(false);
              });
            }}
          >
            <Undo2Icon data-icon="inline-start" />
            {learnerTerm("unskipKnown")}
          </Button>
        ) : !isMastered ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await setLearnerVerdict({
                  learnerStateRef: session.learnerStateRef,
                  enrichmentId: session.enrichmentId,
                  derivedNodeId: concept.derivedNodeId,
                  verdict: "known"
                });
                await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
                setOpen(false);
              });
            }}
          >
            <CheckCircle2Icon data-icon="inline-start" />
            {learnerTerm("skipKnown")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function DifficultyRating({ difficulty }: Readonly<{ difficulty: number }>) {
  const rating = Math.min(5, Math.max(1, Math.round(difficulty * 4) + 1));
  return (
    <span aria-label={`Difficulty ${rating} of 5`} className="inline-flex align-[-0.08em] text-[color:var(--journal-frontier)]">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden>
          {index < rating ? "◆" : "◇"}
        </span>
      ))}
    </span>
  );
}

function stateLabel(state: TrailCluster["state"]): string {
  if (state === "mastered") return learnerTerm("mastered");
  if (state === "frontier") return learnerTerm("frontier");
  return learnerTerm("locked");
}
