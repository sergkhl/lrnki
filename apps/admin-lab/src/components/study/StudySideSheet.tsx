"use client";

import { LockIcon } from "lucide-react";
import type { SelfAssessmentOutcome } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RecallCard } from "@/components/study/RecallCard";
import type { SheetContent as SheetContentPayload } from "@/components/study/studyView";

// Transfer-ready, state-gated study side sheet (U4, R9/R13/R15). It keeps the graph visible
// (a right-side sheet) and renders content gated by the clicked node's learner state: a
// frontier node opens its recall card; a cardless frontier node is flagged, never dropped
// (R13); a locked node names its unmet prerequisites with NO card; a mastered node opens a
// read-only review. All data and the `onAssess` callback are injected props — no loader or
// server action is imported (R15).
export function StudySideSheet({
  open,
  onOpenChange,
  nodeLabel,
  content,
  onAssess,
  pending = false
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeLabel: string | null;
  content: SheetContentPayload | null;
  onAssess: (outcome: SelfAssessmentOutcome) => void;
  pending?: boolean;
}>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-4 p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2">
            {nodeLabel ?? "Node"}
            {content ? <StateBadge content={content} /> : null}
          </SheetTitle>
          <SheetDescription>{content ? descriptionFor(content) : null}</SheetDescription>
        </SheetHeader>

        {content?.kind === "frontier_card" ? (
          <RecallCard key={content.card.cardId} card={content.card} onAssess={onAssess} pending={pending} />
        ) : null}

        {content?.kind === "mastered_review" && content.card ? (
          <RecallCard key={content.card.cardId} card={content.card} readOnly />
        ) : null}

        {content?.kind === "mastered_review" && !content.card ? (
          <p className="text-sm text-muted-foreground">Mastered — no recall card exists for this node.</p>
        ) : null}

        {content?.kind === "cardless" ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            No recall card exists for this node, so it can&apos;t be self-assessed. It stays on the graph, flagged — never dropped.
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
    </Sheet>
  );
}

function StateBadge({ content }: Readonly<{ content: SheetContentPayload }>) {
  switch (content.kind) {
    case "frontier_card":
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
    case "frontier_card":
      return "Ready to study — reveal the answer, then self-assess your recall.";
    case "cardless":
      return "On the frontier, but not recall-testable.";
    case "mastered_review":
      return "Already mastered — review only.";
    case "locked":
      return "Not ready yet — a prerequisite is still unmet.";
  }
}
