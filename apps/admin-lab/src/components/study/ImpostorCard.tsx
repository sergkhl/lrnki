"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StudyImpostorView } from "@/components/study/studyView";

// The Impostor study item: the learner reads four statements (three true, one lie) and taps
// the lie. After an answer the card marks the REAL impostor and renders the reveal — ALWAYS,
// regardless of whether the guess was right (R6/AE5): a wrong guess must never leave the
// learner reinforcing the misconception. Mirrors OptionSelectCard's answered/pending state
// machine. `isImpostor` rides in the view only for this post-answer reveal — the keyed answer
// is re-derived server-side at submit (the renderer must not key on it before answering).
export function ImpostorCard({
  item,
  onSelect,
  pending = false
}: Readonly<{
  item: StudyImpostorView;
  onSelect: (statementId: string) => void;
  pending?: boolean;
}>) {
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const answered = selectedStatementId !== null;
  const disabled = pending || answered;
  const chosen = item.statements.find((statement) => statement.statementId === selectedStatementId) ?? null;

  const choose = (statementId: string) => {
    if (disabled) return;
    setSelectedStatementId(statementId);
    onSelect(statementId);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{item.question}</p>
      <Separator />
      <div className="flex flex-col gap-2">
        {item.statements.map((statement) => {
          const isChosen = statement.statementId === selectedStatementId;
          // After answering, mark the real impostor (the lie) and the wrong pick. Before
          // answering every statement reads neutrally — the lie is not pre-marked.
          const variant = !answered
            ? "outline"
            : statement.isImpostor
              ? "default" // the lie, revealed
              : isChosen
                ? "destructive" // the learner wrongly tapped this truth
                : "outline";
          return (
            <Button
              key={statement.statementId}
              type="button"
              variant={variant}
              className="h-auto justify-start whitespace-normal text-left"
              disabled={disabled}
              onClick={() => choose(statement.statementId)}
            >
              <span className="flex items-start gap-2">
                {answered && statement.isImpostor ? <XIcon className="mt-0.5 size-4 shrink-0" /> : null}
                {answered && isChosen && !statement.isImpostor ? <XIcon className="mt-0.5 size-4 shrink-0" /> : null}
                {answered && isChosen && statement.isImpostor ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : null}
                <span>{statement.text}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {answered ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {chosen?.isImpostor ? "Correct — you spotted the lie." : "Not quite — that statement is true."}
          </span>
          <span className="text-muted-foreground">{item.reveal}</span>
          {item.lieSource === "sibling" && item.siblingLabel ? (
            <span className="text-xs text-muted-foreground">
              The lie is actually true of <span className="font-medium text-foreground">{item.siblingLabel}</span>.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
