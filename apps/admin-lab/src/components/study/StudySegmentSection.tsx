"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

// One collapsible study-segment card (Theory, option-select, impostor). It owns the bordered
// card chrome and the collapse toggle so every segment in the stacked sheet reads the same and
// can be folded away to declutter — the studying flow stays visible by default (`defaultOpen`).
// base-ui's `Collapsible.Panel` keeps children mounted when collapsed, so a card's in-progress
// answer state (a selected option / statement) survives a collapse → expand. This is the durable
// segment-card shape the Learner App can reuse (AGENTS rule 18, rule 22).
//
// Distinct from `CollapsibleSection` in `DerivedGraphExplorer.tsx`: that is an unbordered,
// default-collapsed inspector panel; this is a bordered, default-open study card.
export function StudySegmentSection({
  title,
  icon,
  meta,
  defaultOpen = true,
  children
}: Readonly<{
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}>) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <CollapsibleTrigger className="group flex items-center gap-2 rounded-sm text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        {icon}
        {title}
        {meta ? <span className="ml-auto">{meta}</span> : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
