"use client";

import { CheckIcon, XIcon } from "lucide-react";
import type { StudyImpostorView, StudyOptionSelectView } from "@lrnki/application";
import type { LearnerGradingResult } from "@/app/learn/[learnerStateRef]/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroundedBadge } from "./GroundedBadge";
import { useShuffledLookup } from "./useShuffledLookup";

type ActivityResult = LearnerGradingResult | null;

export function OptionSelectBody({
  item,
  selectedId,
  result,
  disabled,
  onSelect
}: Readonly<{
  item: StudyOptionSelectView;
  selectedId: string | null;
  result: ActivityResult;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}>) {
  const { orderedIds, byId: optionById } = useShuffledLookup(item.options, (option) => option.optionId);
  return (
    <section className="flex flex-col gap-4 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold leading-7">{item.question}</h2>
        <GroundedBadge provenance={item.groundingProvenance} />
      </div>
      <div className="flex flex-col gap-2">
        {orderedIds.map((optionId) => {
          const option = optionById.get(optionId);
          if (!option) return null;
          const graded = result?.graded === true;
          const isChosen = graded ? option.optionId === result.chosenId : option.optionId === selectedId;
          const isCorrect = graded && option.optionId === result.keyedCorrectId;
          const variant = !graded ? isChosen ? "secondary" : "outline" : isCorrect ? "default" : isChosen ? "destructive" : "outline";
          return (
            <Button
              key={option.optionId}
              type="button"
              variant={variant}
              disabled={disabled || graded}
              className={cn(
                "h-auto min-h-9 w-full justify-start whitespace-normal text-left",
                isChosen && !graded ? "ring-2 ring-[color:var(--journal-frontier)]" : null
              )}
              onClick={() => onSelect(option.optionId)}
            >
              <span className="flex items-start gap-2">
                {graded && isCorrect ? <CheckIcon className="mt-0.5" /> : null}
                {graded && isChosen && !isCorrect ? <XIcon className="mt-0.5" /> : null}
                <span>{option.text}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {result?.graded ? (
        <div className="rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-3 text-sm">
          <p className="font-medium">{result.correct ? "Correct." : "Not quite."}</p>
          <p className="mt-1 text-muted-foreground">{item.explanation}</p>
        </div>
      ) : null}
    </section>
  );
}

export function ImpostorBody({
  item,
  selectedId,
  result,
  disabled,
  onSelect
}: Readonly<{
  item: StudyImpostorView;
  selectedId: string | null;
  result: ActivityResult;
  disabled: boolean;
  onSelect: (statementId: string) => void;
}>) {
  const { orderedIds, byId: statementById } = useShuffledLookup(item.statements, (statement) => statement.statementId);
  return (
    <section className="flex flex-col gap-4 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold leading-7">{item.question}</h2>
        <GroundedBadge provenance={item.groundingProvenance} />
      </div>
      <div className="flex flex-col gap-2">
        {orderedIds.map((statementId) => {
          const statement = statementById.get(statementId);
          if (!statement) return null;
          const graded = result?.graded === true;
          const isChosen = graded ? statement.statementId === result.chosenId : statement.statementId === selectedId;
          const isImpostor = graded && statement.statementId === result.keyedCorrectId;
          const variant = !graded ? isChosen ? "secondary" : "outline" : isImpostor ? "default" : isChosen ? "destructive" : "outline";
          return (
            <Button
              key={statement.statementId}
              type="button"
              variant={variant}
              disabled={disabled || graded}
              className={cn(
                "h-auto min-h-9 w-full justify-start whitespace-normal text-left",
                isChosen && !graded ? "ring-2 ring-[color:var(--journal-frontier)]" : null
              )}
              onClick={() => onSelect(statement.statementId)}
            >
              <span className="flex items-start gap-2">
                {graded && isChosen && isImpostor ? <CheckIcon className="mt-0.5" /> : null}
                {graded && isChosen && !isImpostor ? <XIcon className="mt-0.5" /> : null}
                {graded && isImpostor && !isChosen ? <XIcon className="mt-0.5" /> : null}
                <span>{statement.text}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {result?.graded ? (
        <div className="rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-3 text-sm">
          <p className="font-medium">{result.correct ? "Correct. You spotted the fake." : "Not quite. That statement is true."}</p>
          <p className="mt-1 text-muted-foreground">{item.reveal}</p>
          {item.lieSource === "sibling" && item.siblingLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Actually true of <span className="font-medium text-foreground">{item.siblingLabel}</span>.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
