"use client";

import { useState } from "react";
import { CheckIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OptionSelectCard } from "@/components/study/OptionSelectCard";
import { ConceptLessonCard } from "@/components/study/ConceptLessonCard";
import type { ConceptLessonView, SheetContent as SheetContentPayload } from "@/components/study/studyView";

// Transfer-ready, state-gated study side sheet. It keeps the graph visible and renders
// content gated by the clicked node's learner state: a ready node opens an option-select
// item or a cardless skip affordance; a locked node names unmet prerequisites; a mastered
// node can clear a `known` verdict. All callbacks are injected props — no loader or server
// action is imported.
export function StudySideSheet({
  open,
  onOpenChange,
  nodeLabel,
  content,
  lesson = null,
  onSelect,
  onSkipAsKnown,
  onClear,
  pending = false
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeLabel: string | null;
  content: SheetContentPayload | null;
  lesson?: ConceptLessonView | null;
  onSelect: (optionId: string) => void;
  onSkipAsKnown: () => void;
  onClear: () => void;
  pending?: boolean;
}>) {
  const contentKey = content?.kind === "option_select" ? `option:${content.item.studyItemId}` : `${content?.kind ?? "none"}:${nodeLabel ?? ""}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <StudySideSheetContent
        key={`${open}:${contentKey}`}
        nodeLabel={nodeLabel}
        content={content}
        lesson={lesson}
        onSelect={onSelect}
        onSkipAsKnown={onSkipAsKnown}
        onClear={onClear}
        pending={pending}
      />
    </Sheet>
  );
}

function StudySideSheetContent({
  nodeLabel,
  content,
  lesson,
  onSelect,
  onSkipAsKnown,
  onClear,
  pending
}: Readonly<{
  nodeLabel: string | null;
  content: SheetContentPayload | null;
  lesson: ConceptLessonView | null;
  onSelect: (optionId: string) => void;
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

  // The lesson is shown ahead of the study item for a frontier node (R12) — read first, then
  // answer. A locked or mastered node does not surface the lesson; it is a teaching prelude to
  // studying, not a standalone reference here.
  const showLesson = lesson !== null && (content?.kind === "option_select" || content?.kind === "cardless");

  return (
    <SheetContent side="right" showOverlay={false} className="gap-4 overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2">
            {nodeLabel ?? "Node"}
            {content ? <StateBadge content={content} /> : null}
          </SheetTitle>
          <SheetDescription>{content ? descriptionFor(content) : null}</SheetDescription>
        </SheetHeader>

        {showLesson && lesson ? <ConceptLessonCard lesson={lesson} /> : null}

        {content?.kind === "option_select" ? (
          <div className="flex flex-col gap-4">
            <OptionSelectCard key={content.item.studyItemId} item={content.item} onSelect={(optionId) => startAction(() => onSelect(optionId))} pending={busy} />
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
      return "Ready to study, or mark as already known.";
    case "cardless":
      return "Ready, but no study item exists.";
    case "mastered_review":
      return "Already mastered.";
    case "locked":
      return "Not ready yet — a prerequisite is still unmet.";
  }
}
