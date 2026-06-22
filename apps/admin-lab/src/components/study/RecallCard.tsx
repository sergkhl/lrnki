"use client";

import { useState } from "react";
import type { Verdict } from "@lrnki/domain-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StudyCardView } from "@/components/study/studyView";

// Transfer-ready reveal-then-binary-choice calibration card (U5, R5/R6/R7/R15). It shows
// the question and a Reveal control; the "I knew it" / "I forgot" buttons stay disabled
// until the answer is revealed (R6), so a verdict always follows an actual recall attempt.
// The current verdict (if any) is shown, and re-choosing or clearing is allowed (R7
// reversal). All callbacks are INJECTED props; no server action and no Admin-Lab loader is
// imported, so the module transfers unchanged (R15). In `readOnly` mode (a mastered node's
// review) the answer is shown outright with no verdict buttons — only a "clear" affordance
// when a `known` verdict can be reversed back to the gap.
export function RecallCard({
  card,
  verdict = null,
  onVerdict,
  onClear,
  pending = false,
  readOnly = false
}: Readonly<{
  card: StudyCardView;
  verdict?: Verdict | null;
  onVerdict?: (verdict: Verdict) => void;
  onClear?: () => void;
  pending?: boolean;
  readOnly?: boolean;
}>) {
  // Review mode reveals the answer outright; calibration mode gates it behind Reveal (R6).
  const [revealed, setRevealed] = useState(readOnly);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{card.groundingProvenance}</Badge>
        <Badge variant={readOnly ? "default" : "secondary"}>{readOnly ? "review" : "calibrate"}</Badge>
        {verdict ? <Badge variant={verdict === "known" ? "default" : "secondary"}>{verdict === "known" ? "I knew it" : "I forgot"}</Badge> : null}
      </div>
      <p className="text-sm font-medium">{card.question}</p>
      <Separator />

      {revealed ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Answer: </span>
          {card.answerKey}
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setRevealed(true)}>
          Reveal answer
        </Button>
      )}

      {!readOnly ? (
        <>
          <p className="text-xs text-muted-foreground">
            {revealed
              ? "Did you recall it before revealing? “I knew it” skips it and everything it builds on; “I forgot” keeps it in your study gap."
              : "Reveal the answer first, then say whether you knew it."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={verdict === "known" ? "default" : "outline"}
              disabled={!revealed || pending}
              onClick={() => onVerdict?.("known")}
            >
              I knew it
            </Button>
            <Button
              type="button"
              size="sm"
              variant={verdict === "learn" ? "secondary" : "outline"}
              disabled={!revealed || pending}
              onClick={() => onVerdict?.("learn")}
            >
              I forgot
            </Button>
            {verdict ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onClear?.()}>
                Clear
              </Button>
            ) : null}
          </div>
        </>
      ) : verdict === "known" && onClear ? (
        <Button type="button" size="sm" variant="outline" className="self-start" disabled={pending} onClick={() => onClear()}>
          Clear &ldquo;I knew it&rdquo; — return to study gap
        </Button>
      ) : null}
    </div>
  );
}
