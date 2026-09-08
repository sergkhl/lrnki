import { useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Map as MapIcon, Shield } from "lucide-react-native";
import { AuthoredSupportDialog, type AuthoredSupportPath } from "@/components/AuthoredSupportDialog";
import { FocusedLearningFlow } from "@/components/FocusedLearningFlow";
import { expeditionQuery, meQuery, LearnerReadError, type ExpeditionView } from "@/lib/queries";
import { useLearnerCommand } from "@/lib/useLearnerCommand";
import { useFocusedFlow } from "@/learn/useFocusedFlow";
import type { LearningStep } from "@/learn/focusedFlow";
import { learnerTerm, stopStateLabel } from "@/learn/vocabulary";
import { Badge, Button, Card, Dialog, DialogBody, IconButton, OverlayHeader, RouteStatus, Screen, SideSheet, Text, colors } from "@/ui";

export default function ExpeditionPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { expeditionKey } = useLocalSearchParams<{ expeditionKey: string }>();
  const me = useQuery(meQuery);
  const expedition = useQuery(expeditionQuery(expeditionKey));
  const view = expedition.data?.view;
  const action = useLearnerCommand(expedition.data?.stateVersion ?? "0");
  const [flowBusy, setFlowBusy] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const steps = useMemo<LearningStep[]>(() => view ? view.expedition.legs.flatMap(leg => leg.stops.map(stop => {
    const progress = view.progress.find(candidate => candidate.stopKey === stop.key);
    return {
      key: stop.key, stopKey: stop.key, label: stop.label, lesson: stop.lesson, activities: stop.activities,
      locked: !progress || progress.state === "locked", settled: progress?.state === "mastered" || progress?.state === "known",
      lessonRead: progress?.lessonReadAt != null,
      correctActivityKeys: progress?.latestActivityOutcomes.filter(outcome => outcome.correct).map(outcome => outcome.activityKey) ?? [],
      source: { kind: "trail" }
    };
  })) : [], [view]);
  const flow = useFocusedFlow(steps, {
    learnerRef: me.data?.learnerStateRef ?? "", expeditionKey,
    contentRevision: view?.expedition.contentRevision ?? ""
  }, view?.supportPaths.filter(path => path.status === "open").map(path => path.supportPathKey));
  const goHome = () => router.replace("/");
  if (expedition.isPending || me.isPending) return <RouteStatus tone="loading" title="Opening your expedition…" />;
  if (expedition.isError || !view || !expedition.data || me.isError || !me.data) return <RouteStatus
    tone="error" title="This expedition is unavailable" message={expedition.error instanceof LearnerReadError && expedition.error.result.status === "content_changed"
      ? learnerTerm("contentChanged") : "Check your connection or return to your journal."}
    actions={[{ label: "Try again", onPress: () => { void expedition.refetch(); void me.refetch(); } },
      { label: "Back to journal", variant: "outline", onPress: goHome }]} />;

  const busy = action.busy || flowBusy;
  const selectedSupport = view.supportPaths.find(path => path.supportPathKey === flow.supportPathKey) ?? null;
  const supportOpen = selectedSupport !== null;
  const currentLeg = view.expedition.legs.find(leg => leg.stops.some(stop => stop.key === flow.step?.stopKey));
  const currentStop = currentLeg?.stops.find(stop => stop.key === flow.step?.stopKey);
  const currentSection = currentStop?.lesson.sections.find(section => section.key === flow.cursor?.itemKey);
  const sectionPaths = view.supportPaths.filter(path => currentSection?.explorableTerms.some(term => term.supportPathKey === path.supportPathKey));
  const stopNames = new Map(steps.map(step => [step.key, step.label]));
  const settled = view.progress.filter(progress => progress.state === "mastered" || progress.state === "known").length;
  const openSupport = async (path?: AuthoredSupportPath) => {
    if (busy) return;
    if (!path) { setHelpOpen(true); return; }
    if (path.status !== "open") {
      const result = await action.run({ kind: "open_support_path", expeditionKey, stopKey: path.parentStopKey, supportPathKey: path.supportPathKey });
      if (result?.status !== "applied") return;
    }
    setHelpOpen(false);
    flow.setSupportPathKey(path.supportPathKey);
  };
  const enterGuardian = async (guardian: ExpeditionView["guardians"][number]) => {
    if (busy) return;
    if (guardian.activeChallengeId) {
      setOverviewOpen(false);
      router.push(`/guardian/${expeditionKey}/${guardian.activeChallengeId}`);
      return;
    }
    const result = await action.run({ kind: "create_guardian", expeditionKey, scope: guardian.scope });
    if (result?.status === "applied" && result.effect.challengeId) {
      setOverviewOpen(false);
      router.push(`/guardian/${expeditionKey}/${result.effect.challengeId}`);
    }
  };
  const legGuardian = view.guardians.find(guardian => guardian.scope.kind === "leg" && guardian.scope.legKey === currentLeg?.key);
  const atLegEnd = currentLeg?.stops.at(-1)?.key === flow.step?.stopKey;

  return <Screen edges={["top", "bottom"]}>
    <View className="min-h-0 flex-1" accessibilityElementsHidden={supportOpen} importantForAccessibility={supportOpen ? "no-hide-descendants" : "auto"} aria-hidden={supportOpen}>
      <View className="flex-row items-center gap-[8px] border-b border-line bg-card px-[12px] py-[8px]">
        {width < 480 ? <IconButton icon={<ArrowLeft size={18} color={colors.ink} />} accessibilityLabel="Expedition journal" disabled={busy} onPress={goHome} />
          : <Button variant="outline" size="compact" label="Journal" accessibilityLabel="Expedition journal" disabled={busy}
            icon={<ArrowLeft size={14} color={colors.ink} />} onPress={goHome} />}
        <Text variant="label" className="min-w-0 flex-1" numberOfLines={2}>{view.expedition.title}</Text>
        <Button variant="outline" size="compact" label="Trail" disabled={busy} icon={<MapIcon size={14} color={colors.ink} />}
          onPress={() => setOverviewOpen(true)} testID="open-trail" />
      </View>
      <View className="mx-auto min-h-0 w-full max-w-2xl flex-1 gap-[8px] p-[12px]">
        <View className="flex-row items-center gap-[8px]">
          <Text variant="caption" color="muted" className="min-w-0 flex-1" numberOfLines={1}>{currentLeg?.title ?? "Your trail"}</Text>
          <Text variant="caption" color="muted">{settled}/{steps.length} complete</Text>
        </View>
        {action.error ? <Text color="destructive" accessibilityLiveRegion="polite">{action.error}</Text> : null}
        <FocusedLearningFlow flow={flow} expeditionKey={expeditionKey} stateVersion={expedition.data.stateVersion}
          sourceCredits={view.expedition.sourceCredits} disabled={action.busy} onBusyChange={setFlowBusy}
          onHelp={pathKey => void openSupport(sectionPaths.find(path => path.supportPathKey === pathKey))}
          onFinished={() => setOverviewOpen(true)} finishedLabel="Open Trail"
          completionActions={atLegEnd && legGuardian && canEnterGuardian(legGuardian) ?
            <GuardianGate guardian={legGuardian} busy={busy} onEnter={() => void enterGuardian(legGuardian)} /> : null} />
      </View>
    </View>
    <SideSheet open={overviewOpen} onOpenChange={setOverviewOpen} dismissBlocked={busy}>
      <OverlayHeader icon={<MapIcon size={20} color={colors.ink} />} title="Trail" description={view.expedition.title}
        onClose={() => setOverviewOpen(false)} closeDisabled={busy} closeLabel="Close Trail" />
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-5 p-4" testID="trail-overview">
        {action.error ? <Text color="destructive" accessibilityLiveRegion="polite">{action.error}</Text> : null}
        {view.expedition.legs.map(leg => <View key={leg.key} className="gap-3">
          <Text variant="heading">{leg.title}</Text>
          {leg.stops.map(stop => {
            const progress = view.progress.find(candidate => candidate.stopKey === stop.key);
            if (!progress) return null;
            return <View key={stop.key} className="gap-2 border-b border-line pb-3" testID={`stop-${stop.key}`}>
              <Button variant={flow.step?.key === stop.key ? "secondary" : "outline"} label={stop.label}
                disabled={busy || progress.state === "locked"} onPress={() => { flow.select(stop.key); setOverviewOpen(false); }} />
              <Badge>{stopStateLabel(progress.state)}</Badge>
              {progress.state === "locked" ? <Text variant="caption">First complete: {stop.requires.map(key => stopNames.get(key)).join(", ")}</Text> : null}
              {progress.restorationStopKeys.length > 0 ? <Text variant="caption">Review {progress.restorationStopKeys.map(key => stopNames.get(key)).join(", ")} to continue.</Text> : null}
              {progress.state !== "locked" && progress.state !== "mastered" ? <Button variant="outline" size="compact"
                label={progress.state === "known" ? "Clear known" : "I already know this"} disabled={busy}
                onPress={() => void action.run({ kind: progress.state === "known" ? "clear_calibration_known" : "set_calibration_known", expeditionKey, stopKey: stop.key })} /> : null}
            </View>;
          })}
          {view.guardians.filter(guardian => guardian.scope.kind === "leg" && guardian.scope.legKey === leg.key).map(guardian =>
            <GuardianGate key={leg.key} testID={`guardian-leg-${leg.key}`} guardian={guardian} busy={busy} onEnter={() => void enterGuardian(guardian)} />)}
        </View>)}
        {view.guardians.filter(guardian => guardian.scope.kind === "expedition").map(guardian =>
          <GuardianGate key="summit" testID="guardian-expedition" guardian={guardian} busy={busy} onEnter={() => void enterGuardian(guardian)} />)}
      </ScrollView>
    </SideSheet>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen} dismissBlocked={busy}>
      <OverlayHeader icon={<MapIcon size={20} color={colors.ink} />} title="Help with this idea" onClose={() => setHelpOpen(false)} closeDisabled={busy} />
      <DialogBody>
        {action.error ? <Text color="destructive">{action.error}</Text> : null}
        {sectionPaths.map(path => <Button key={path.supportPathKey} label={path.term} disabled={busy}
          onPress={() => void openSupport(path)} />)}
      </DialogBody>
    </Dialog>
    <AuthoredSupportDialog open={supportOpen} onOpenChange={open => { if (!open) flow.setSupportPathKey(null); }} path={selectedSupport}
      expeditionKey={expeditionKey} expectedStateVersion={expedition.data.stateVersion}
      sourceCredits={view.expedition.sourceCredits} learnerRef={me.data.learnerStateRef} contentRevision={view.expedition.contentRevision} />
  </Screen>;
}

function canEnterGuardian(guardian: ExpeditionView["guardians"][number]) {
  return guardian.activeChallengeId !== null || guardian.state === "available" || guardian.state === "won";
}
function GuardianGate({ guardian, busy, onEnter, testID }: Readonly<{
  guardian: ExpeditionView["guardians"][number]; busy: boolean; onEnter: () => void; testID?: string;
}>) {
  const label = guardian.activeChallengeId ? "Resume Guardian" : guardian.state === "won" ? "Rematch Guardian"
    : guardian.state === "available" ? "Challenge Guardian" : "Guardian locked";
  return <Card className="gap-2" testID={testID}>
    <View className="flex-row items-center gap-2">
      <Shield size={18} color={colors.trail} />
      <Text variant="title">{guardian.scope.kind === "leg" ? "Leg Guardian" : "Expedition Guardian"}</Text>
    </View>
    {!canEnterGuardian(guardian) ? <Text variant="caption">{guardian.state === "unavailable"
      ? "Practise the questions in this part of the trail to prepare."
      : guardian.scope.kind === "leg" ? "Complete this Leg to unlock its challenge." : "Complete the trail and win each available Leg Guardian."}</Text> : null}
    <Button variant="outline" label={label} disabled={busy || !canEnterGuardian(guardian)} onPress={onEnter} />
  </Card>;
}
