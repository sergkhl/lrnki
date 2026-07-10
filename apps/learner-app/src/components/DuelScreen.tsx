import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { StudySession } from "@lrnki/application/projection";
import { rivalDuelAnswer, rivalSeed } from "@lrnki/learner-api/rival-simulation";
import { gradeDuelAnswerAction, recordDuelWinAction } from "@/lib/actions";
import { duelReduce, type DuelState } from "@/learn/duelMachine";
import { learnerTerm } from "@/learn/vocabulary";
import { Btn } from "./ui";

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
      <Text className="text-sm font-medium text-ink">{learnerTerm("duelYouLabel")}: {state.learnerCorrect}</Text>
      <Text className="text-sm text-muted">{learnerTerm("duelVersus")}</Text>
      <Text className="text-sm font-medium text-ink">{rivalName}: {state.rivalCorrect}</Text>
    </View>
  );

  if (state.status === "complete") {
    const title = state.outcome === "win" ? learnerTerm("duelWinTitle") : state.outcome === "loss" ? learnerTerm("duelLossTitle") : learnerTerm("duelDrawTitle");
    const body = state.outcome === "win" ? learnerTerm("duelWinBody") : state.outcome === "loss" ? learnerTerm("duelLossBody") : learnerTerm("duelDrawBody");
    return (
      <View className="items-center gap-4 rounded-xl border border-line bg-card p-8">
        <Text className="text-2xl font-semibold text-ink">{title}</Text>
        {scoreLine}
        <Text className="max-w-sm text-center text-sm text-muted">{body}</Text>
        <Btn onPress={() => router.replace("/")} label={learnerTerm("duelAgain")} />
      </View>
    );
  }

  const question = questions[index];
  const header = (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {learnerTerm("duelQuestionProgress").replace("{index}", String(index + 1)).replace("{total}", String(questions.length))}
        </Text>
        <Text className="text-sm font-medium tabular-nums text-ink">
          {state.status === "question" ? secondsLeft : 0}
          {learnerTerm("duelTimeLeft")}
        </Text>
      </View>
      {scoreLine}
    </View>
  );

  if (state.status === "reveal") {
    return (
      <View className="gap-4 rounded-xl border border-line bg-card p-5">
        {header}
        <View className="items-center gap-2 py-4">
          <Text className={`text-lg font-semibold ${state.lastLearnerCorrect ? "text-trail" : "text-destructive"}`}>
            {state.lastLearnerCorrect ? learnerTerm("duelCorrect") : learnerTerm("duelIncorrect")}
          </Text>
          <Text className="text-sm text-muted">
            {state.lastRivalCorrect ? learnerTerm("duelRivalCorrect") : learnerTerm("duelRivalMissed")}
          </Text>
        </View>
        <Btn onPress={next} label={learnerTerm("duelNext")} className="self-center" />
      </View>
    );
  }

  return (
    <View className="gap-4 rounded-xl border border-line bg-card p-5">
      {header}
      <QuestionBody
        question={question}
        disabled={busy}
        onOptionSelect={(optionId) => void submit(question.view.item.studyItemId, { itemType: "option_select", chosenOptionId: optionId }, question.band, learnerLead)}
        onImpostorSelect={(statementId) => void submit(question.view.item.studyItemId, { itemType: "impostor", chosenStatementId: statementId }, question.band, learnerLead)}
      />
    </View>
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
        <Text className="text-base font-medium text-ink">{view.item.question}</Text>
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
      <Text className="text-base font-medium text-ink">{view.item.question}</Text>
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
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl border border-line bg-card px-4 py-3 ${disabled ? "opacity-50" : "active:opacity-80"}`}
    >
      <Text className="text-sm text-ink">{text}</Text>
    </Pressable>
  );
}
