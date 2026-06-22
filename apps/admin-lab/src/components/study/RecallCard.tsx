"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { StudyCardView } from "@/components/study/studyView";

// Transfer-ready study item (U4, R6/R15). Shows the question, a Reveal control, then the
// answer + "Got it" / "Missed it" — the assess controls stay disabled until the answer is
// revealed, so a self-assessment always follows an actual recall attempt. It calls the
// INJECTED `onAssess` prop; no server action and no Admin-Lab loader is imported, so the
// module transfers unchanged (R15). In `readOnly` mode (a mastered node's review) the answer
// is shown outright with no assess controls.
export function RecallCard({
  card
}: Readonly<{
  card: StudyCardView;
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{card.groundingProvenance}</Badge>
        <Badge variant="secondary">review</Badge>
      </div>
      <p className="text-sm font-medium">{card.question}</p>
      <Separator />
      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Answer: </span>
        {card.answerKey}
      </div>
    </div>
  );
}
