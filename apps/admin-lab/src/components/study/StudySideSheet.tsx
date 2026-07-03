"use client";

import { useState } from "react";
import { BookOpenIcon, CheckIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OptionSelectCard } from "@/components/study/OptionSelectCard";
import { ImpostorCard } from "@/components/study/ImpostorCard";
import { ConceptLessonCard } from "@/components/study/ConceptLessonCard";
import { StudySegmentSection } from "@/components/study/StudySegmentSection";
import type { ConceptLessonView, SheetContent as SheetContentPayload, StudyItemView } from "@/components/study/studyView";

// Transfer-ready, state-gated study side sheet. It keeps the graph visible and renders content
// gated by the clicked node's learner state: a ready (frontier) node stacks its theory (the
// lesson) then its ordered study SEGMENTS (option-select, then impostor) — each independently
// answerable (R10, KTD7) — plus a cardless skip affordance; a locked node names unmet
// prerequisites; a mastered node can clear a `known` verdict. Gated one-at-a-time sequencing
// and the polished render are deferred to the Learner App; the Admin Lab just stacks the cards.
// All callbacks are injected props — no loader or server action is imported.
export function StudySideSheet({
  open,
  onOpenChange,
  nodeLabel,
  difficulty = null,
  content,
  segments = [],
  lesson = null,
  onSelectOption,
  onSelectImpostor,
  onSkipAsKnown,
  onClear,
  pending = false
}: Readonly<{
  open: boolean;
  // Base UI calls this with `(open, eventDetails)`; the caller inspects `eventDetails.reason`
  // to distinguish a real dismiss from the graph-tap outside-press it must ignore.
  onOpenChange: (open: boolean, eventDetails?: { reason?: string; event?: Event }) => void;
  nodeLabel: string | null;
  // Learner-neutral intrinsic difficulty for the open node (ADR-0024, EXPERIMENT_ONLY); null when
  // the node has no computed difficulty.
  difficulty?: number | null;
  content: SheetContentPayload | null;
  // The frontier node's ordered study segments; empty for a non-frontier or cardless node.
  segments?: StudyItemView[];
  lesson?: ConceptLessonView | null;
  onSelectOption: (studyItemId: string, optionId: string) => void;
  onSelectImpostor: (studyItemId: string, statementId: string) => void;
  onSkipAsKnown: () => void;
  onClear: () => void;
  pending?: boolean;
}>) {
  const contentKey = `${content?.kind ?? "none"}:${nodeLabel ?? ""}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <StudySideSheetContent
        key={`${open}:${contentKey}`}
        nodeLabel={nodeLabel}
        difficulty={difficulty}
        content={content}
        segments={segments}
        lesson={lesson}
        onSelectOption={onSelectOption}
        onSelectImpostor={onSelectImpostor}
        onSkipAsKnown={onSkipAsKnown}
        onClear={onClear}
        pending={pending}
      />
    </Sheet>
  );
}

function StudySideSheetContent({
  nodeLabel,
  difficulty,
  content,
  segments,
  lesson,
  onSelectOption,
  onSelectImpostor,
  onSkipAsKnown,
  onClear,
  pending
}: Readonly<{
  nodeLabel: string | null;
  difficulty: number | null;
  content: SheetContentPayload | null;
  segments: StudyItemView[];
  lesson: ConceptLessonView | null;
  onSelectOption: (studyItemId: string, optionId: string) => void;
  onSelectImpostor: (studyItemId: string, statementId: string) => void;
  onSkipAsKnown: () => void;
  onClear: () => void;
  pending: boolean;
}>) {
  const [actionStarted, setActionStarted] = useState(false);
  const busy = pending || actionStarted;

  const startAction = (fn: () => void) => {
    if (busy) return;
    setActionStarted(true);
    fn();
  };

  // A frontier node with study segments is the studying surface. The lesson is shown ahead of
  // the segments (R12) — read first, then answer. A locked or mastered node does not surface
  // the lesson; it is a teaching prelude to studying, not a standalone reference here.
  const isFrontierWithSegments = segments.length > 0;
  const showLesson = lesson !== null && (isFrontierWithSegments || content?.kind === "cardless");

  return (
    <SheetContent side="right" showOverlay={false} className="gap-4 overflow-y-auto p-6 sm:max-w-md data-[closed]:pointer-events-none">
        <SheetHeader className="p-0">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {nodeLabel ?? "Node"}
            {content ? <StateBadge content={content} /> : null}
            {difficulty !== null ? <Badge variant="outline">difficulty {difficulty.toFixed(2)}</Badge> : null}
          </SheetTitle>
          <SheetDescription>{content ? descriptionFor(content) : null}</SheetDescription>
        </SheetHeader>

        {showLesson && lesson ? (
          <StudySegmentSection title="Lesson" icon={<BookOpenIcon className="size-4 text-primary" />}>
            <ConceptLessonCard lesson={lesson} />
          </StudySegmentSection>
        ) : null}

        {isFrontierWithSegments ? (
          <div className="flex flex-col gap-4">
            {segments.map((segment) =>
              segment.kind === "option_select" ? (
                <StudySegmentSection
                  key={segment.item.studyItemId}
                  title="Question"
                  meta={<Badge variant="outline">{segment.item.groundingProvenance}</Badge>}
                >
                  <OptionSelectCard
                    item={segment.item}
                    onSelect={(optionId) => startAction(() => onSelectOption(segment.item.studyItemId, optionId))}
                    pending={busy}
                  />
                </StudySegmentSection>
              ) : (
                <StudySegmentSection
                  key={segment.item.studyItemId}
                  title="Spot the impostor"
                  meta={<Badge variant="outline">{segment.item.groundingProvenance}</Badge>}
                >
                  <ImpostorCard
                    item={segment.item}
                    onSelect={(statementId) => startAction(() => onSelectImpostor(segment.item.studyItemId, statementId))}
                    pending={busy}
                  />
                </StudySegmentSection>
              )
            )}
            <Button type="button" size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => startAction(onSkipAsKnown)}>
              <CheckIcon data-icon="inline-start" />
              Skip as known
            </Button>
          </div>
        ) : null}

        {content?.kind === "mastered_review" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Mastered for this learner.</p>
            {content.verdict === "known" ? (
              <Button type="button" size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => startAction(onClear)}>
                <RotateCcwIcon data-icon="inline-start" />
                Clear known mark
              </Button>
            ) : null}
          </div>
        ) : null}

        {content?.kind === "cardless" ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            <span>No study item exists for this ready node.</span>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startAction(onSkipAsKnown)}>
              <CheckIcon data-icon="inline-start" />
              Skip as known
            </Button>
          </div>
        ) : null}

        {content?.kind === "locked" ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <LockIcon className="size-4" /> Locked — master these prerequisites first:
            </p>
            {content.unmetPrerequisiteLabels.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {content.unmetPrerequisiteLabels.map((label) => (
                  <li key={label} className="rounded-md border px-2 py-1.5 text-sm font-medium">{label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No direct prerequisites recorded.</p>
            )}
          </div>
        ) : null}
    </SheetContent>
  );
}

function StateBadge({ content }: Readonly<{ content: SheetContentPayload }>) {
  switch (content.kind) {
    case "option_select":
    case "impostor":
    case "cardless":
      return <Badge variant="secondary">frontier</Badge>;
    case "mastered_review":
      return <Badge variant="default">mastered</Badge>;
    case "locked":
      return <Badge variant="outline">locked</Badge>;
  }
}

function descriptionFor(content: SheetContentPayload): string {
  switch (content.kind) {
    case "option_select":
    case "impostor":
      return "Ready to study, or mark as already known.";
    case "cardless":
      return "Ready, but no study item exists.";
    case "mastered_review":
      return "Already mastered.";
    case "locked":
      return "Not ready yet — a prerequisite is still unmet.";
  }
}
