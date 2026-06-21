"use client";

import { useState } from "react";
import type { SelfReportRating } from "@lrnki/domain-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calibrationRatingFor, type CalibrationChoice } from "@/components/study/studyView";

export type CalibrationSweepItem = {
  derivedNodeId: string;
  cardId: string;
  label: string;
  question: string;
};

export type CalibrationRating = { derivedNodeId: string; cardId: string; rating: SelfReportRating };

// Transfer-ready calibration sweep (U4, R2/R15). Renders the goal's prerequisite-ancestor
// cards in the order received — the loader sorts them hardest-first (buildCalibrationSet) —
// with an "I know it" / "Not sure" choice per item. On submit it emits the rated rows via
// the INJECTED `onSubmit` prop; unrated items are omitted. No server action or loader is
// imported (R15). Surfaced only when the learner opts to calibrate (KTD5).
export function CalibrationSweep({
  items,
  onSubmit,
  pending = false
}: Readonly<{
  items: CalibrationSweepItem[];
  onSubmit: (ratings: CalibrationRating[]) => void;
  pending?: boolean;
}>) {
  const [choiceByNode, setChoiceByNode] = useState<Record<string, CalibrationChoice>>({});

  const submit = () => {
    const ratings: CalibrationRating[] = items
      .filter((item) => choiceByNode[item.derivedNodeId])
      .map((item) => ({ derivedNodeId: item.derivedNodeId, cardId: item.cardId, rating: calibrationRatingFor(choiceByNode[item.derivedNodeId]) }));
    if (ratings.length > 0) onSubmit(ratings);
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Calibrate — what do you already know?</CardTitle>
        <CardDescription>
          Hardest prerequisites first. Marking &ldquo;I know it&rdquo; seeds prior mastery and skips it (and what it
          builds on) in the study gap.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">This goal has no prerequisite cards to calibrate — study it directly.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const choice = choiceByNode[item.derivedNodeId];
              return (
                <li key={item.derivedNodeId} className="flex flex-col gap-2 rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.question}</span>
                    </span>
                    {choice ? <Badge variant={choice === "know_it" ? "default" : "secondary"}>{choice === "know_it" ? "I know it" : "Not sure"}</Badge> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={choice === "know_it" ? "default" : "outline"}
                      onClick={() => setChoiceByNode((prev) => ({ ...prev, [item.derivedNodeId]: "know_it" }))}
                    >
                      I know it
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={choice === "not_sure" ? "secondary" : "outline"}
                      onClick={() => setChoiceByNode((prev) => ({ ...prev, [item.derivedNodeId]: "not_sure" }))}
                    >
                      Not sure
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Button type="button" size="sm" className="self-start" disabled={pending || Object.keys(choiceByNode).length === 0} onClick={submit}>
          Submit calibration
        </Button>
      </CardContent>
    </Card>
  );
}
