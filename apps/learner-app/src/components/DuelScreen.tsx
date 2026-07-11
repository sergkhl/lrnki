import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { StudySession } from "@lrnki/application/projection";
import { rivalDuelAnswer, rivalSeed } from "@lrnki/learner-api/rival-simulation";
import { gradeDuelAnswerAction, recordDuelWinAction } from "@/lib/actions";
import { duelReduce, type DuelState } from "@/learn/duelMachine";
import { learnerTerm } from "@/learn/vocabulary";
import { Button, Card, PressableSurface, Text } from "@/ui";

type StudyItemView = StudySession["studySegmentsByNode"][string][number];

const QUESTION_SECONDS = 15;
const QUESTION_MS = QUESTION_SECONDS * 1000;

export type DuelQuestion = { view: StudyItemView; band: number };

// The Crystal Duel surface re-ported to RN primitives (plan 2026-07-10-001 U4, R6). A THIN
// driver over the pure `duelReduce` machine: the timer, the async grade call, and the seeded
// rival simulation are edge effects that feed events in. Grading goes through the grade-only
// route (no persistence, KTD3); a win records one idempotent crest, a loss records nothing —
// losing costs the learner nothing but time.
export function DuelScreen({ duelId, rivalName, questions }: Readonly<{ duelId: string; rivalName: string; questions: DuelQuestion[] }>) {
  const router = useRouter();
  const [state, setState] = useState<DuelState>(() => duelReduce({ status: "idle" }, { type: "START", questionCount: questions.length }));
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [busy, setBusy] = useState(false);
  const answeredRef = useRef(false);
  const winRecordedRef = useRef(false);

  const index = state.status === "question" || state.status === "reveal" ? state.index : 0;
  const learnerLead = state.status === "question" ? state.learnerCorrect - state.rivalCorrect : 0;

  const rivalFor = useCallback(
    (band: number, lead: number) => rivalDuelAnswer({ seed: rivalSeed(duelId, index), band, learnerLead: lead, questionMs: QUESTION_MS }),
    [duelId, index]
  );

  const submit = useCallback(
    async (
      studyItemId: string,
      submission: { itemType: "option_select"; chosenOptionId: string } | { itemType: "impostor"; chosenStatementId: string },
      band: number,
      lead: number
    ) => {
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

  // Per-question countdown; the per-question reset happens in `next` (event context).
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

  // Record the durable win crest exactly once on a winning finish (idempotent server-side
  // via the duelId dedupe key).
  useEffect(() => {
    if (state.status === "complete" && state.outcome === "win" && !winRecordedRef.current) {
      winRecordedRef.current = true;
      void recordDuelWinAction({ duelId });
    }
  }, [state, duelId]);

  const next = () => {
    answeredRef.current = false;
    setSecondsLeft(QUESTION_SECONDS);
    setState((current) => duelReduce(current, { type: "NEXT" }));
  };

  if (state.status === "idle") return null;

  const scoreLine = (
    <View className="flex-row items-center justify-center gap-4">
      <Text variant="label">{learnerTerm("duelYouLabel")}: {state.learnerCorrect}</Text>
      <Text variant="label" color="muted" className="font-normal">{learnerTerm("duelVersus")}</Text>
      <Text variant="label">{rivalName}: {state.rivalCorrect}</Text>
    </View>
  );

  if (state.status === "complete") {
    const title = state.outcome === "win" ? learnerTerm("duelWinTitle") : state.outcome === "loss" ? learnerTerm("duelLossTitle") : learnerTerm("duelDrawTitle");
    const body = state.outcome === "win" ? learnerTerm("duelWinBody") : state.outcome === "loss" ? learnerTerm("duelLossBody") : learnerTerm("duelDrawBody");
    return (
      <Card className="items-center gap-4 p-8">
        <Text variant="heading">{title}</Text>
        {scoreLine}
        <Text variant="label" color="muted" className="max-w-sm text-center font-normal">{body}</Text>
        <Button onPress={() => router.replace("/")} label={learnerTerm("duelAgain")} />
      </Card>
    );
  }

  const question = questions[index];
  const header = (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" color="muted" className="font-normal">
          {learnerTerm("duelQuestionProgress").replace("{index}", String(index + 1)).replace("{total}", String(questions.length))}
        </Text>
        <Text variant="label" className="tabular-nums">
          {state.status === "question" ? secondsLeft : 0}
          {learnerTerm("duelTimeLeft")}
        </Text>
      </View>
      {scoreLine}
    </View>
  );

  if (state.status === "reveal") {
    return (
      <Card className="gap-4 p-5">
        {header}
        <View className="items-center gap-2 py-4">
          <Text variant="title" color={state.lastLearnerCorrect ? "trail" : "destructive"} className="text-lg">
            {state.lastLearnerCorrect ? learnerTerm("duelCorrect") : learnerTerm("duelIncorrect")}
          </Text>
          <Text variant="label" color="muted" className="font-normal">
            {state.lastRivalCorrect ? learnerTerm("duelRivalCorrect") : learnerTerm("duelRivalMissed")}
          </Text>
        </View>
        <Button onPress={next} label={learnerTerm("duelNext")} className="self-center" />
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-5">
      {header}
      <QuestionBody
        question={question}
        disabled={busy}
        onOptionSelect={(optionId) => void submit(question.view.item.studyItemId, { itemType: "option_select", chosenOptionId: optionId }, question.band, learnerLead)}
        onImpostorSelect={(statementId) => void submit(question.view.item.studyItemId, { itemType: "impostor", chosenStatementId: statementId }, question.band, learnerLead)}
      />
    </Card>
  );
}

function QuestionBody({
  question,
  disabled,
  onOptionSelect,
  onImpostorSelect
}: Readonly<{ question: DuelQuestion; disabled: boolean; onOptionSelect: (optionId: string) => void; onImpostorSelect: (statementId: string) => void }>) {
  const view = question.view;
  if (view.kind === "option_select") {
    return (
      <View className="gap-3">
        <Text variant="title">{view.item.question}</Text>
        <View className="gap-2">
          {view.item.options.map((option) => (
            <AnswerButton key={option.optionId} text={option.text} disabled={disabled} onPress={() => onOptionSelect(option.optionId)} />
          ))}
        </View>
      </View>
    );
  }
  if (view.kind !== "impostor") return null; // matching is excluded from the duel pool (R7)
  return (
    <View className="gap-3">
      <Text variant="title">{view.item.question}</Text>
      <View className="gap-2">
        {view.item.statements.map((statement) => (
          <AnswerButton key={statement.statementId} text={statement.text} disabled={disabled} onPress={() => onImpostorSelect(statement.statementId)} />
        ))}
      </View>
    </View>
  );
}

function AnswerButton({ text, disabled, onPress }: Readonly<{ text: string; disabled: boolean; onPress: () => void }>) {
  return (
    <PressableSurface
      accessibilityLabel={text}
      disabled={disabled}
      haptic="selection"
      onPress={onPress}
      className={`min-h-target justify-center rounded-control border border-line-strong bg-card px-4 py-3 ${disabled ? "opacity-50" : ""}`}
      pressedClassName="bg-muted-panel"
    >
      <Text variant="label" className="font-normal">{text}</Text>
    </PressableSurface>
  );
}
