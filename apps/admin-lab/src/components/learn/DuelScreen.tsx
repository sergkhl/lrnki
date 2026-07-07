"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { StudyItemView } from "@lrnki/application";
import { gradeDuelAnswerAction, recordDuelWinAction } from "@/app/learn/duel/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { duelReduce, type DuelState } from "./duelMachine";
import { rivalDuelAnswer, rivalSeed } from "./rivalSimulation";
import { learnerTerm } from "./vocabulary";

const QUESTION_SECONDS = 15;
const QUESTION_MS = QUESTION_SECONDS * 1000;

export type DuelQuestion = { view: StudyItemView; band: number };

// The Crystal Duel surface (R7, R9). It is a THIN driver over the pure `duelReduce` machine: the
// timer, the async grade call, and the seeded rival simulation are edge effects that feed events
// in. Grading goes through the grade-only action (no persistence, KTD3); a win records a durable
// crest, a loss records nothing (AE4). Losing costs the learner nothing but time.
export function DuelScreen({ learnerStateRef, duelId, rivalName, questions }: { learnerStateRef: string; duelId: string; rivalName: string; questions: DuelQuestion[] }) {
  // Kick off the duel at first render (pure, no effect): the question count is known from props.
  const [state, setState] = useState<DuelState>(() => duelReduce({ status: "idle" }, { type: "START", questionCount: questions.length }));
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [busy, setBusy] = useState(false);
  const answeredRef = useRef(false);
  const winRecordedRef = useRef(false);

  const index = state.status === "question" || state.status === "reveal" ? state.index : 0;
  const learnerLead = state.status === "question" ? state.learnerCorrect - state.rivalCorrect : 0;

  // Resolve the rival's answer for the current question (seeded, deterministic within the duel).
  const rivalFor = useCallback(
    (band: number, lead: number) => rivalDuelAnswer({ seed: rivalSeed(duelId, index), band, learnerLead: lead, questionMs: QUESTION_MS }),
    [duelId, index]
  );

  const submit = useCallback(
    async (studyItemId: string, submission: { itemType: "option_select"; chosenOptionId: string } | { itemType: "impostor"; chosenStatementId: string }, band: number, lead: number) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      setBusy(true);
      const elapsedMs = (QUESTION_SECONDS - secondsLeft) * 1000;
      const graded = await gradeDuelAnswerAction({ studyItemId, submission });
      const correct = graded.graded ? graded.correct : false;
      const rival = rivalFor(band, lead);
      setState((current) => duelReduce(current, { type: "ANSWER", correct, elapsedMs, rivalCorrect: rival.correct, rivalElapsedMs: rival.elapsedMs }));
      setBusy(false);
    },
    [rivalFor, secondsLeft]
  );

  const timeUp = useCallback(
    (band: number, lead: number) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      const rival = rivalFor(band, lead);
      setState((current) => duelReduce(current, { type: "TIME_UP", elapsedMs: QUESTION_MS, rivalCorrect: rival.correct, rivalElapsedMs: rival.elapsedMs }));
    },
    [rivalFor]
  );

  // Per-question countdown. The per-question RESET happens in the transition handlers (event
  // context), so this effect only subscribes the ticking interval — no synchronous setState here.
  // A hit of zero fires TIME_UP once. `setSecondsLeft` inside the interval callback is async, not
  // an in-effect synchronous set.
  const currentBand = questions[index]?.band ?? 1;
  useEffect(() => {
    if (state.status !== "question") return;
    const timer = setInterval(() => {
      setSecondsLeft((left) => {
        if (left <= 1) {
          clearInterval(timer);
          timeUp(currentBand, learnerLead);
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, index]);

  // Record the durable win crest exactly once on a winning finish.
  useEffect(() => {
    if (state.status === "complete" && state.outcome === "win" && !winRecordedRef.current) {
      winRecordedRef.current = true;
      void recordDuelWinAction({ learnerStateRef, duelId });
    }
  }, [state, learnerStateRef, duelId]);

  // Advance to the next question, resetting the per-question timer/answer guard here (event
  // context) rather than in the countdown effect.
  const next = () => {
    answeredRef.current = false;
    setSecondsLeft(QUESTION_SECONDS);
    setState((current) => duelReduce(current, { type: "NEXT" }));
  };

  if (state.status === "idle") return null;

  const scoreLine = (
    <div className="flex items-center justify-center gap-4 text-sm">
      <span className="font-medium">
        {learnerTerm("duelYouLabel")}: {state.learnerCorrect}
      </span>
      <span className="text-muted-foreground">{learnerTerm("duelVersus")}</span>
      <span className="font-medium">
        {rivalName}: {state.rivalCorrect}
      </span>
    </div>
  );

  if (state.status === "complete") {
    const title = state.outcome === "win" ? learnerTerm("duelWinTitle") : state.outcome === "loss" ? learnerTerm("duelLossTitle") : learnerTerm("duelDrawTitle");
    const body = state.outcome === "win" ? learnerTerm("duelWinBody") : state.outcome === "loss" ? learnerTerm("duelLossBody") : learnerTerm("duelDrawBody");
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {scoreLine}
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
        <Link href="/learn" className={buttonVariants({})}>
          {learnerTerm("duelAgain")}
        </Link>
      </div>
    );
  }

  const question = questions[index];
  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{learnerTerm("duelQuestionProgress").replace("{index}", String(index + 1)).replace("{total}", String(questions.length))}</span>
        <span className="tabular-nums font-medium text-foreground">
          {state.status === "question" ? secondsLeft : 0}
          {learnerTerm("duelTimeLeft")}
        </span>
      </div>
      {scoreLine}
    </div>
  );

  if (state.status === "reveal") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        {header}
        <div className="flex flex-col items-center gap-2 py-4">
          <p className={`text-lg font-semibold ${state.lastLearnerCorrect ? "text-emerald-500" : "text-rose-500"}`}>
            {state.lastLearnerCorrect ? learnerTerm("duelCorrect") : learnerTerm("duelIncorrect")}
          </p>
          <p className="text-sm text-muted-foreground">{state.lastRivalCorrect ? learnerTerm("duelRivalCorrect") : learnerTerm("duelRivalMissed")}</p>
        </div>
        <Button onClick={next} className="self-center">
          {learnerTerm("duelNext")}
        </Button>
      </div>
    );
  }

  // status === "question": render the item and accept one answer.
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      {header}
      <QuestionBody question={question} disabled={busy} onOptionSelect={(id) => void submit(question.view.item.studyItemId, { itemType: "option_select", chosenOptionId: id }, question.band, learnerLead)} onImpostorSelect={(id) => void submit(question.view.item.studyItemId, { itemType: "impostor", chosenStatementId: id }, question.band, learnerLead)} />
    </div>
  );
}

function QuestionBody({ question, disabled, onOptionSelect, onImpostorSelect }: { question: DuelQuestion; disabled: boolean; onOptionSelect: (optionId: string) => void; onImpostorSelect: (statementId: string) => void }) {
  const view = question.view;
  if (view.kind === "option_select") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base font-medium">{view.item.question}</p>
        <div className="flex flex-col gap-2">
          {view.item.options.map((option) => (
            <Button key={option.optionId} variant="outline" disabled={disabled} className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => onOptionSelect(option.optionId)}>
              {option.text}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  if (view.kind !== "impostor") return null; // matching is excluded from the duel pool (R7)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-medium">{view.item.question}</p>
      <div className="flex flex-col gap-2">
        {view.item.statements.map((statement) => (
          <Button key={statement.statementId} variant="outline" disabled={disabled} className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => onImpostorSelect(statement.statementId)}>
            {statement.text}
          </Button>
        ))}
      </div>
    </div>
  );
}
