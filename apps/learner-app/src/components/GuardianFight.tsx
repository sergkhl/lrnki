import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { withSequence, withTiming } from "react-native-reanimated";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { ArrowLeft, RotateCcw, ShieldAlert, Swords, Trophy } from "lucide-react-native";
import type {
  RecallAnswerFeedback,
  RecallChallengeView,
  StudyItemView,
  StudyMatchingView
} from "@lrnki/application/projection";
import type { LearnerGradingResult } from "@/lib/api";
import {
  answerChallengeMatchingPairAction,
  answerChallengeSelectionAction,
  challengeLifecycleAction,
  createChallengeAction,
  refreshLearnerExpedition,
  type ChallengeAnswerResult
} from "@/lib/actions";
import { clientUuid } from "@/lib/uuid";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { CrystalGuardian } from "./CrystalGuardian";
import { TileButton } from "./MatchingBoard";
import { useShuffledLookup } from "@/learn/useShuffledLookup";
import { learnerTerm } from "@/learn/vocabulary";
import {
  AnimatedView,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  MOTION,
  OverlayHeader,
  Screen,
  Text,
  buttonIconColor,
  colors,
  triggerHaptic,
  useReducedMotion
} from "@/ui";

// The Crystal Guardian fight surface (plan 2026-07-13-003 U5, F2-F4). Driven ONLY by the
// server's discriminated challenge view: the client holds presentation state (which
// corrective reveal is showing, local match-tile locks, in-flight/error flags) and never
// derives combat state locally — a reload resumes exactly because nothing authoritative
// lives here. Answer submissions mint one attemptRef and lifecycle actions one operationRef,
// each held across retries (KTD2); response timing starts when the prompt renders and is
// untrusted reporting evidence only (KTD8).

// The corrective reveal held on screen until the learner continues: the ANSWERED item with
// its post-commit feedback (the view underneath has already advanced to the next ward).
type Reveal =
  | { kind: "selection"; item: StudyItemView; result: LearnerGradingResult; correct: boolean }
  | { kind: "matchingRound"; clean: boolean };

// A failed network submission: retrying re-invokes the SAME closure (same attemptRef /
// operationRef), so the server replays the committed event instead of double-counting.
type FailedAction = { retry: () => void };

const DURATION_CAP_MS = 3_600_000;

export function GuardianFight({
  view,
  onCommit,
  onExit
}: Readonly<{
  view: RecallChallengeView;
  // Writes the post-commit view into the route's query cache — the single view source.
  onCommit: (view: RecallChallengeView) => void;
  onExit: () => void;
}>) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FailedAction | null>(null);
  const [over, setOver] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  // Reshuffle key for the matching board: bumps when a dirty round completes or the current
  // item changes, so recovery presents a genuinely re-randomized, key-free board (KTD6).
  const [boardEpoch, setBoardEpoch] = useState(0);

  const fighting = view.state === "active" || view.state === "recovery";
  const currentItemId = fighting ? view.currentItem.item.studyItemId : null;

  // KTD8 prompt-visible timing: the clock starts when a new prompt (or a reveal dismissal)
  // puts the current item in front of the learner. The initial timestamp is set by the mount
  // effect below (reveal starts null), keeping render pure of the impure `Date.now()` read.
  const promptShownAtRef = useRef(0);
  useEffect(() => {
    if (reveal === null) promptShownAtRef.current = Date.now();
  }, [currentItemId, boardEpoch, reveal]);
  const durationNow = () => Math.max(0, Math.min(DURATION_CAP_MS, Math.round(Date.now() - promptShownAtRef.current)));

  // Retreat/resume/abandon each hold ONE operation UUID across retries.
  const resumeRefRef = useRef<string | null>(null);
  const retreatRefRef = useRef<string | null>(null);
  const abandonRefRef = useRef<string | null>(null);

  // Opening a retreated challenge is the resume state-edge (KTD2): fired once per mount;
  // repeating it while already engaged appends nothing server-side.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !fighting || !view.retreated) return;
    resumedRef.current = true;
    resumeRefRef.current ??= clientUuid();
    void challengeLifecycleAction("resume", { challengeId: view.challengeId, operationRef: resumeRefRef.current })
      .then((result) => {
        if ("applied" in result && result.applied) onCommit(result.view);
      })
      .catch(() => {
        // Best-effort: the fight still renders from the read view; the next write resumes.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One shared submission wrapper: busy gating, network-failure retry with the same
  // idempotency handle, and refusal handling (the durable state disagreed — the server's
  // committed view wins, so the caller reloads via onCommit of the next read).
  const submit = (run: () => Promise<void>) => {
    if (busy) return;
    setFailed(null);
    setBusy(true);
    void run()
      .catch(() => setFailed({ retry: () => submit(run) }))
      .finally(() => setBusy(false));
  };

  const handleAnswerResult = (result: ChallengeAnswerResult, answered: { item: StudyItemView } | null): RecallAnswerFeedback | null => {
    if (!("answered" in result) || result.answered === false) {
      // The server refused (stale turn, inactive, not found): the challenge moved on without
      // us. `not_found`/inactive ends the fight; `out_of_turn` means a concurrent commit —
      // rare enough that returning to the trail is the honest recovery.
      setOver(true);
      return null;
    }
    onCommit(result.view);
    if (result.feedback === null) {
      // Replayed duplicate: the committed view is authoritative; no second reveal.
      setReveal(null);
      return null;
    }
    const feedback = result.feedback;
    if (feedback.kind === "selection" && answered) {
      triggerHaptic(feedback.correct ? "success" : "warning");
      setReveal({
        kind: "selection",
        item: answered.item,
        correct: feedback.correct,
        result: { kind: "selection", graded: true, chosenId: feedback.chosenId, keyedCorrectId: feedback.keyedCorrectId, correct: feedback.correct }
      });
    }
    return feedback;
  };

  const answerSelection = (item: StudyItemView, chosenId: string) => {
    const attemptRef = clientUuid();
    const responseDurationMs = durationNow();
    submit(async () => {
      const result = await answerChallengeSelectionAction({
        challengeId: view.challengeId,
        attemptRef,
        studyItemId: item.item.studyItemId,
        chosenId,
        responseDurationMs
      });
      handleAnswerResult(result, { item });
    });
  };

  // Matching pairs post individually so the SERVER's append-only history — never a
  // client-composed trace — decides whether the round was clean (KTD6). Returns the pair
  // feedback for tile handling, or null when the submission failed/refused.
  const answerMatchingPair = (item: StudyMatchingView, promptId: string, matchId: string): Promise<RecallAnswerFeedback | null> => {
    if (busy) return Promise.resolve(null);
    setFailed(null);
    setBusy(true);
    const attemptRef = clientUuid();
    const responseDurationMs = durationNow();
    const run = async (): Promise<RecallAnswerFeedback | null> => {
      const result = await answerChallengeMatchingPairAction({
        challengeId: view.challengeId,
        attemptRef,
        studyItemId: item.studyItemId,
        promptId,
        chosenMatchId: matchId,
        responseDurationMs
      });
      const feedback = handleAnswerResult(result, null);
      if (feedback?.kind === "matching_pair" && feedback.roundComplete) {
        triggerHaptic(feedback.roundClean ? "success" : "warning");
        setBoardEpoch((epoch) => epoch + 1);
        setReveal({ kind: "matchingRound", clean: feedback.roundClean });
      } else if (feedback && !feedback.correct) {
        triggerHaptic("warning");
      }
      return feedback;
    };
    return run()
      .catch(() => {
        setFailed({ retry: () => submit(async () => { await run(); }) });
        return null;
      })
      .finally(() => setBusy(false));
  };

  const retreat = () => {
    retreatRefRef.current ??= clientUuid();
    const operationRef = retreatRefRef.current;
    // Fire-and-leave: retreat is a state-edge no-op on replay, and the trail read shows the
    // active scope either way — never hold the learner hostage to the write.
    void challengeLifecycleAction("retreat", { challengeId: view.challengeId, operationRef }).catch(() => {});
    void refreshLearnerExpedition({ enrichmentId: view.enrichmentId });
    onExit();
  };

  // Confirmed abandon then a fresh challenge on the same scope (KTD7): the only path that
  // replaces an active fight.
  const abandonAndRestart = () => {
    abandonRefRef.current ??= clientUuid();
    const operationRef = abandonRefRef.current;
    submit(async () => {
      const abandoned = await challengeLifecycleAction("abandon", { challengeId: view.challengeId, operationRef });
      if (!("applied" in abandoned) || !abandoned.applied) {
        setOver(true);
        return;
      }
      const created = await createChallengeAction({
        enrichmentId: view.enrichmentId,
        scopeKind: view.scopeKind,
        anchorDerivedNodeId: view.anchorDerivedNodeId
      });
      await refreshLearnerExpedition({ enrichmentId: view.enrichmentId });
      if (!("created" in created) || created.created !== true) {
        // Eligibility can have shifted since the first lineup — return honestly to the trail.
        setOver(true);
        return;
      }
      abandonRefRef.current = null;
      setAbandonOpen(false);
      setReveal(null);
      setBoardEpoch(0);
      onCommit(created.view);
    });
  };

  const finishVictory = () => {
    void refreshLearnerExpedition({ enrichmentId: view.enrichmentId });
    onExit();
  };

  if (over) {
    return (
      <Screen className="items-center justify-center gap-3 p-6">
        <Text variant="title">{learnerTerm("guardianOverTitle")}</Text>
        <Text variant="label" color="muted" className="text-center font-normal">{learnerTerm("guardianOverBody")}</Text>
        <Button variant="primary" onPress={() => { void refreshLearnerExpedition({ enrichmentId: view.enrichmentId }); onExit(); }} label={learnerTerm("returnToTrail")} />
      </Screen>
    );
  }

  const title = view.scopeKind === "enrichment" ? learnerTerm("guardianSummitTitle") : learnerTerm("guardianTitle");

  return (
    <Screen>
      <View className="flex-row items-center gap-2 border-b border-line bg-card px-4 py-2">
        <Button
          variant="outline"
          size="compact"
          onPress={retreat}
          icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
          label={learnerTerm("guardianRetreat")}
        />
        <View className="flex-1" />
        {view.state === "won" ? null : (
          <Button variant="secondary" size="compact" onPress={() => setAbandonOpen(true)} label={learnerTerm("guardianAbandonAction")} />
        )}
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg gap-4 p-4 pb-8">
        {view.state === "won" ? (
          <VictoryPanel scopeKind={view.scopeKind} anchorDerivedNodeId={view.anchorDerivedNodeId} wardTotal={view.wardTotal} onContinue={finishVictory} />
        ) : (
          <>
            <GuardianStage view={view} title={title} />
            {view.state === "recovery" && reveal === null ? <LastStandBanner /> : null}
            {failed ? (
              <Card className="gap-3 border-destructive">
                <Text variant="label">{learnerTerm("guardianAnswerError")}</Text>
                <View className="flex-row gap-2">
                  <Button variant="primary" size="compact" onPress={() => failed.retry()} label={learnerTerm("guardianRetry")} />
                  <Button variant="outline" size="compact" onPress={retreat} label={learnerTerm("returnToTrail")} />
                </View>
              </Card>
            ) : null}
            {reveal !== null ? (
              <RevealPanel reveal={reveal} nextView={view} onContinue={() => setReveal(null)} />
            ) : (
              <CurrentWard
                view={view}
                busy={busy}
                boardEpoch={boardEpoch}
                onSelect={answerSelection}
                onPair={answerMatchingPair}
              />
            )}
          </>
        )}
      </ScrollView>
      <Dialog open={abandonOpen} onOpenChange={setAbandonOpen} dismissBlocked={busy}>
        <OverlayHeader
          icon={<RotateCcw size={20} color={colors.ink} />}
          title={learnerTerm("guardianAbandonTitle")}
          onClose={() => setAbandonOpen(false)}
          closeDisabled={busy}
        />
        <DialogBody>
          <Text variant="label" color="muted" className="font-normal">{learnerTerm("guardianAbandonBody")}</Text>
        </DialogBody>
        <DialogFooter>
          <Button variant="destructive" onPress={abandonAndRestart} disabled={busy} busy={busy} label={learnerTerm("guardianAbandonConfirm")} />
          <Button variant="outline" onPress={() => setAbandonOpen(false)} disabled={busy} label={learnerTerm("guardianAbandonCancel")} />
        </DialogFooter>
      </Dialog>
    </Screen>
  );
}

// The Guardian figure plus the always-present textual status line (ward and shield counts
// are never conveyed by the drawing alone). A shield loss shakes the figure once; reduced
// motion keeps the static state change only.
function GuardianStage({ view, title }: Readonly<{ view: Extract<RecallChallengeView, { state: "active" | "recovery" }>; title: string }>) {
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);
  const prevShieldRef = useRef(view.remainingMissBuffer);
  useEffect(() => {
    const previous = prevShieldRef.current;
    prevShieldRef.current = view.remainingMissBuffer;
    if (reduceMotion || view.remainingMissBuffer >= previous) return;
    shake.set(
      withSequence(
        withTiming(-6, { duration: MOTION.nudge }),
        withTiming(6, { duration: MOTION.nudge }),
        withTiming(-3, { duration: MOTION.nudge }),
        withTiming(0, { duration: MOTION.nudge })
      )
    );
  }, [view.remainingMissBuffer, reduceMotion, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const wardsLine =
    view.unresolvedItemCount === 1
      ? learnerTerm("guardianWardsRemainingSingular")
      : learnerTerm("guardianWardsRemainingTemplate").replace("{count}", String(view.unresolvedItemCount));
  return (
    <View className="items-center gap-1">
      <View className="flex-row items-center gap-2">
        <Swords size={18} color={colors.ink} />
        <Text variant="title">{title}</Text>
      </View>
      <AnimatedView animatedStyle={shakeStyle}>
        <CrystalGuardian
          anchorDerivedNodeId={view.anchorDerivedNodeId}
          phase={view.state}
          wardTotal={view.wardTotal}
          wardsRemaining={view.unresolvedItemCount}
          shieldRemaining={view.remainingMissBuffer}
          shieldTotal={view.missBufferTotal}
          size={180}
        />
      </AnimatedView>
      <Text variant="caption" color="muted">
        {wardsLine} · {learnerTerm("guardianShield")} {view.remainingMissBuffer}/{view.missBufferTotal}
      </Text>
    </View>
  );
}

function LastStandBanner() {
  return (
    <Card className="gap-1 border-destructive">
      <View className="flex-row items-center gap-2">
        <ShieldAlert size={18} color={colors.destructive} />
        <Text variant="label" className="font-semibold">{learnerTerm("guardianLastStand")}</Text>
      </View>
      <Text variant="caption" color="muted">{learnerTerm("guardianLastStandBody")}</Text>
    </Card>
  );
}

// Post-commit corrective reveal (KTD7): the answered item with its keyed feedback, held
// until the learner continues to the next ward. The outcome banner names the combat
// consequence in Guardian language.
function RevealPanel({
  reveal,
  nextView,
  onContinue
}: Readonly<{ reveal: Reveal; nextView: RecallChallengeView; onContinue: () => void }>) {
  const won = nextView.state === "won";
  const broke = reveal.kind === "selection" ? reveal.correct : reveal.clean;
  return (
    <View className="gap-4">
      <Card className={`gap-1 ${broke ? "border-gem" : "border-destructive"}`}>
        <Text variant="label" className="font-semibold">
          {broke ? learnerTerm("guardianWardBroken") : learnerTerm("guardianWardHolds")}
        </Text>
        {reveal.kind === "matchingRound" && !reveal.clean ? (
          <Text variant="caption" color="muted">{learnerTerm("guardianRecoveryReshuffle")}</Text>
        ) : null}
      </Card>
      {reveal.kind === "selection" ? (
        reveal.item.kind === "option_select" ? (
          <OptionSelectBody item={reveal.item.item} selectedId={null} result={reveal.result} disabled onSelect={() => {}} />
        ) : reveal.item.kind === "impostor" ? (
          <ImpostorBody item={reveal.item.item} selectedId={null} result={reveal.result} disabled onSelect={() => {}} />
        ) : null
      ) : null}
      <Button variant="primary" onPress={onContinue} label={won ? learnerTerm("continueAction") : learnerTerm("guardianContinue")} />
    </View>
  );
}

// The current ward's item, rendered through the same activity bodies acquisition uses —
// but submitted through the challenge endpoints only (KTD4: separate write paths).
function CurrentWard({
  view,
  busy,
  boardEpoch,
  onSelect,
  onPair
}: Readonly<{
  view: Extract<RecallChallengeView, { state: "active" | "recovery" }>;
  busy: boolean;
  boardEpoch: number;
  onSelect: (item: StudyItemView, chosenId: string) => void;
  onPair: (item: StudyMatchingView, promptId: string, matchId: string) => Promise<RecallAnswerFeedback | null>;
}>) {
  const current = view.currentItem;
  if (current.kind === "option_select") {
    return <OptionSelectBody item={current.item} selectedId={null} result={null} disabled={busy} onSelect={(optionId) => onSelect(current, optionId)} />;
  }
  if (current.kind === "impostor") {
    return <ImpostorBody item={current.item} selectedId={null} result={null} disabled={busy} onSelect={(statementId) => onSelect(current, statementId)} />;
  }
  return (
    <GuardianMatchingBoard
      key={`${current.item.studyItemId}:${boardEpoch}`}
      item={current.item}
      matchedPromptIds={view.matchingProgress?.matchedPromptIds ?? []}
      busy={busy}
      onPair={(promptId, matchId) => onPair(current.item, promptId, matchId)}
    />
  );
}

// Server-driven matching board (KTD6): prompt locks come from the SERVER's mid-board
// progress, so retreat/reload resumes the exact board; match-tile locks accumulate from
// post-commit pair feedback within this mount (a resumed board honestly re-offers used
// matches as distractors rather than inventing key knowledge the view doesn't carry).
function GuardianMatchingBoard({
  item,
  matchedPromptIds,
  busy,
  onPair
}: Readonly<{
  item: StudyMatchingView;
  matchedPromptIds: string[];
  busy: boolean;
  onPair: (promptId: string, matchId: string) => Promise<RecallAnswerFeedback | null>;
}>) {
  const { orderedIds: promptIds, byId: promptById } = useShuffledLookup(item.prompts, (prompt) => prompt.promptId);
  const { orderedIds: matchIds, byId: matchById } = useShuffledLookup(item.matches, (match) => match.matchId);
  const [selected, setSelected] = useState<{ column: "prompt" | "match"; id: string } | null>(null);
  const [usedMatchIds, setUsedMatchIds] = useState<Set<string>>(() => new Set());
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  const wrongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (wrongTimeoutRef.current !== null) clearTimeout(wrongTimeoutRef.current); }, []);

  const lockedPrompts = new Set(matchedPromptIds);

  const tryPair = (promptId: string, matchId: string) => {
    if (busy || lockedPrompts.has(promptId) || usedMatchIds.has(matchId)) return;
    setSelected(null);
    void onPair(promptId, matchId).then((feedback) => {
      if (feedback?.kind !== "matching_pair") return;
      if (feedback.correct) {
        setUsedMatchIds((used) => new Set(used).add(feedback.keyedMatchId));
        return;
      }
      setWrong(new Set([promptId, matchId]));
      if (wrongTimeoutRef.current !== null) clearTimeout(wrongTimeoutRef.current);
      wrongTimeoutRef.current = setTimeout(() => setWrong(new Set()), 420);
    });
  };

  const choose = (column: "prompt" | "match", id: string) => {
    if (selected && selected.column !== column) {
      tryPair(column === "prompt" ? id : selected.id, column === "match" ? id : selected.id);
      return;
    }
    setSelected({ column, id });
  };

  return (
    <Card className="gap-4">
      <Text variant="heading" className="leading-7">{item.question}</Text>
      <Text variant="label" color="muted" className="font-normal">
        {matchedPromptIds.length} of {item.prompts.length} matched. Tap a clue on the left, then its match on the right.
      </Text>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Text variant="caption" color="muted" className="font-semibold uppercase tracking-wide">Clues</Text>
          {promptIds.map((id) => {
            const prompt = promptById.get(id);
            if (!prompt) return null;
            return (
              <TileButton
                key={id}
                text={prompt.text}
                selected={selected?.column === "prompt" && selected.id === id}
                locked={lockedPrompts.has(id)}
                wrong={wrong.has(id)}
                disabled={busy}
                onPress={() => choose("prompt", id)}
              />
            );
          })}
        </View>
        <View className="flex-1 gap-2">
          <Text variant="caption" color="muted" className="font-semibold uppercase tracking-wide">Matches</Text>
          {matchIds.map((id) => {
            const match = matchById.get(id);
            if (!match) return null;
            return (
              <TileButton
                key={id}
                text={match.text}
                selected={selected?.column === "match" && selected.id === id}
                locked={usedMatchIds.has(id)}
                wrong={wrong.has(id)}
                disabled={busy}
                onPress={() => choose("match", id)}
              />
            );
          })}
        </View>
      </View>
    </Card>
  );
}

// The victory state (F4, KTD3): the formation/keystone fact itself is server-owned — this
// panel only celebrates and returns; the trail projection renders the permanent reward.
function VictoryPanel({
  scopeKind,
  anchorDerivedNodeId,
  wardTotal,
  onContinue
}: Readonly<{ scopeKind: "section" | "enrichment"; anchorDerivedNodeId: string; wardTotal: number; onContinue: () => void }>) {
  return (
    <View className="gap-4">
      <View className="items-center gap-1">
        <View className="flex-row items-center gap-2">
          <Trophy size={20} color={colors.award} />
          <Text variant="title">{learnerTerm("guardianVictoryTitle")}</Text>
        </View>
        <CrystalGuardian
          anchorDerivedNodeId={anchorDerivedNodeId}
          phase="won"
          wardTotal={wardTotal}
          wardsRemaining={0}
          shieldRemaining={0}
          shieldTotal={0}
          size={180}
        />
        <Text variant="label" color="muted" className="text-center font-normal">
          {scopeKind === "enrichment" ? learnerTerm("guardianVictorySummitBody") : learnerTerm("guardianVictoryLegBody")}
        </Text>
      </View>
      <Button variant="primary" onPress={onContinue} label={learnerTerm("returnToTrail")} />
    </View>
  );
}
