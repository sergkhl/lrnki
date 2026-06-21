"use client";

import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OptionSelectCard } from "@/components/study/OptionSelectCard";
import { RecallCard } from "@/components/study/RecallCard";
import type { SheetContent as SheetContentPayload } from "@/components/study/studyView";

// Transfer-ready, state-gated study side sheet (U4, R9/R13/R15). It keeps the graph visible
// (a right-side sheet) and renders content gated by the clicked node's learner state: a
// frontier node opens its study item; a cardless frontier node is flagged, never dropped
// (R13); a locked node names its unmet prerequisites with NO card; a mastered node opens a
// read-only review. All data and the `onAssess` callback are injected props — no loader or
// server action is imported (R15).
export function StudySideSheet({
  open,
  onOpenChange,
  nodeLabel,
  content,
  onSelect,
  pending = false
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeLabel: string | null;
  content: SheetContentPayload | null;
  onSelect: (optionId: string) => void;
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

        {content?.kind === "option_select" ? (
          <OptionSelectCard key={content.item.studyItemId} item={content.item} onSelect={onSelect} pending={pending} />
        ) : null}

        {content?.kind === "mastered_review" && content.card ? (
          <RecallCard key={content.card.studyItemId} card={content.card} />
        ) : null}

        {content?.kind === "mastered_review" && !content.card ? (
          <p className="text-sm text-muted-foreground">Mastered — no study item exists for this node.</p>
        ) : null}

        {content?.kind === "cardless" ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            No option-select study item exists for this node. Self-assessment is calibration-only, so this frontier is flagged for studying and kept visible.
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
      return "Ready to study — choose one option.";
    case "cardless":
      return "On the frontier, but no auto-graded study item exists.";
    case "mastered_review":
      return "Already mastered — review only.";
    case "locked":
      return "Not ready yet — a prerequisite is still unmet.";
  }
}
