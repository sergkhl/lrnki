"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, RotateCwIcon, XIcon } from "lucide-react";
import type { StudyImpostorView, StudyOptionSelectView, StudySession } from "@lrnki/application";
import type { LearnerGradingResult } from "@/app/learn/[learnerStateRef]/actions";
import { refreshLearnerExpedition, submitLearnerImpostor, submitLearnerOptionSelect } from "@/app/learn/[learnerStateRef]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AnswerState = LearnerGradingResult | null;

export function OptionSelectActivity({ session, item }: Readonly<{ session: StudySession; item: StudyOptionSelectView }>) {
  const router = useRouter();
  const [answer, setAnswer] = useState<AnswerState>(null);
  const [pending, startTransition] = useTransition();
  const disabled = pending || answer !== null;

  const choose = (optionId: string) => {
    if (disabled) return;
    startTransition(async () => {
      setAnswer(await submitLearnerOptionSelect({
        learnerStateRef: session.learnerStateRef,
        enrichmentId: session.enrichmentId,
        studyItemId: item.studyItemId,
        chosenOptionId: optionId
      }));
    });
  };

  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <CardTitle>{item.question}</CardTitle>
        <CardDescription>{item.groundingProvenance}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {item.options.map((option) => {
          const isChosen = answer?.graded && option.optionId === answer.chosenId;
          const isCorrect = answer?.graded && option.optionId === answer.keyedCorrectId;
          const variant = !answer?.graded ? "outline" : isCorrect ? "default" : isChosen ? "destructive" : "outline";
          return (
            <Button
              key={option.optionId}
              type="button"
              variant={variant}
              className="h-auto min-h-9 w-full justify-start text-wrap"
              disabled={disabled}
              onClick={() => choose(option.optionId)}
            >
              <span className="flex items-start gap-2">
                {answer?.graded && isCorrect ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : null}
                {answer?.graded && isChosen && !isCorrect ? <XIcon className="mt-0.5 size-4 shrink-0" /> : null}
                <span>{option.text}</span>
              </span>
            </Button>
          );
        })}
        <AnswerFooter answer={answer} session={session} onContinue={() => router.refresh()} />
      </CardContent>
    </Card>
  );
}

export function ImpostorActivity({ session, item }: Readonly<{ session: StudySession; item: StudyImpostorView }>) {
  const router = useRouter();
  const [answer, setAnswer] = useState<AnswerState>(null);
  const [pending, startTransition] = useTransition();
  const disabled = pending || answer !== null;

  const choose = (statementId: string) => {
    if (disabled) return;
    startTransition(async () => {
      setAnswer(await submitLearnerImpostor({
        learnerStateRef: session.learnerStateRef,
        enrichmentId: session.enrichmentId,
        studyItemId: item.studyItemId,
        chosenStatementId: statementId
      }));
    });
  };

  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <CardTitle>{item.question}</CardTitle>
        <CardDescription>{item.lieSource === "sibling" && item.siblingLabel ? `Confusable with ${item.siblingLabel}` : item.groundingProvenance}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {item.statements.map((statement) => {
          const isChosen = answer?.graded && statement.statementId === answer.chosenId;
          const isImpostor = answer?.graded && statement.statementId === answer.keyedCorrectId;
          const variant = !answer?.graded ? "outline" : isImpostor ? "default" : isChosen ? "destructive" : "outline";
          return (
            <Button
              key={statement.statementId}
              type="button"
              variant={variant}
              className="h-auto min-h-9 w-full justify-start text-wrap"
              disabled={disabled}
              onClick={() => choose(statement.statementId)}
            >
              <span className="flex items-start gap-2">
                {answer?.graded && isChosen && isImpostor ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : null}
                {answer?.graded && isImpostor && !isChosen ? <XIcon className="mt-0.5 size-4 shrink-0" /> : null}
                {answer?.graded && isChosen && !isImpostor ? <XIcon className="mt-0.5 size-4 shrink-0" /> : null}
                <span>{statement.text}</span>
              </span>
            </Button>
          );
        })}
        {answer?.graded ? (
          <div className="rounded-md border border-[color:var(--journal-line)] bg-background/60 p-3 text-sm">
            <p className="font-medium">{answer.correct ? "Correct. You spotted the lie." : "Not quite. That statement is true."}</p>
            <p className="mt-1 text-muted-foreground">{item.reveal}</p>
            {item.lieSource === "sibling" && item.siblingLabel ? (
              <p className="mt-1 text-xs text-muted-foreground">Actually true of <span className="font-medium text-foreground">{item.siblingLabel}</span>.</p>
            ) : null}
          </div>
        ) : null}
        <AnswerFooter answer={answer} session={session} onContinue={() => router.refresh()} />
      </CardContent>
    </Card>
  );
}

function AnswerFooter({ answer, session, onContinue }: Readonly<{ answer: AnswerState; session: StudySession; onContinue: () => void }>) {
  const [pending, startTransition] = useTransition();
  if (!answer) return null;
  if (!answer.graded) return <p className="text-sm text-destructive">{answer.message}</p>;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--journal-line)] bg-background/60 p-3">
      <p className="text-sm text-muted-foreground">{answer.correct ? "Recorded as correct." : "Recorded for practice."}</p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
            onContinue();
          });
        }}
      >
        <RotateCwIcon data-icon="inline-start" />
        Continue
      </Button>
    </div>
  );
}
