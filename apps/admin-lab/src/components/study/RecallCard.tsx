"use client";

import { useState } from "react";
import type { SelfAssessmentOutcome } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { assessmentDisabled, type StudyCardView } from "@/components/study/studyView";

// Transfer-ready recall card (U4, R6/R15). Shows the question, a Reveal control, then the
// answer + "Got it" / "Missed it" — the assess controls stay disabled until the answer is
// revealed, so a self-assessment always follows an actual recall attempt. It calls the
// INJECTED `onAssess` prop; no server action and no Admin-Lab loader is imported, so the
// module transfers unchanged (R15). In `readOnly` mode (a mastered node's review) the answer
// is shown outright with no assess controls.
export function RecallCard({
  card,
  onAssess,
  readOnly = false,
  pending = false
}: Readonly<{
  card: StudyCardView;
  onAssess?: (outcome: SelfAssessmentOutcome) => void;
  readOnly?: boolean;
  pending?: boolean;
}>) {
  const [revealed, setRevealed] = useState(readOnly);
  const disabled = assessmentDisabled(revealed) || pending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{card.groundingProvenance}</Badge>
        {readOnly ? <Badge variant="secondary">review</Badge> : null}
      </div>
      <p className="text-sm font-medium">{card.question}</p>

      {revealed ? (
        <>
          <Separator />
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Answer: </span>
            {card.answerKey}
          </div>
        </>
      ) : (
        <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setRevealed(true)}>
          Reveal answer
        </Button>
      )}

      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={disabled} onClick={() => onAssess?.("got_it")}>
            Got it
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onAssess?.("missed_it")}>
            Missed it
          </Button>
          {!revealed ? <span className="text-xs text-muted-foreground">Reveal the answer to self-assess.</span> : null}
        </div>
      )}
    </div>
  );
}
