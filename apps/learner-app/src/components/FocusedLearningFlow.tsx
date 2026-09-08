import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { CircleHelp } from "lucide-react-native";
import { cursorKey, stepCards } from "@/learn/focusedFlow";
import type { FocusedFlow } from "@/learn/useFocusedFlow";
import { useLearnerCommand } from "@/lib/useLearnerCommand";
import { Button, Card, Text, colors } from "@/ui";
import { AuthoredActivityCard } from "./AuthoredActivityCard";
import { ExplorableTheoryText } from "./ExplorableTheoryText";
import { SourceCreditsButton, type SourceCredit } from "./SourceCredits";

export function FocusedLearningFlow({ flow, expeditionKey, stateVersion, sourceCredits, disabled = false,
  onBusyChange, onHelp, completionActions, onFinished, finishedLabel = "Back to lesson"
}: Readonly<{
  flow: FocusedFlow;
  expeditionKey: string;
  stateVersion: string;
  sourceCredits: readonly SourceCredit[];
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onHelp?: (pathKey?: string) => void;
  completionActions?: ReactNode;
  onFinished?: () => void;
  finishedLabel?: string;
}>) {
  const action = useLearnerCommand(stateVersion, onBusyChange);
  const [answerBusy, setAnswerBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<View>(null);
  const { cursor, step } = flow;
  const identity = cursor ? cursorKey(cursor) : null;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (Platform.OS === "web") heading.current?.focus();
  }, [identity]);
  if (!flow.ready) return <View className="flex-1 justify-center p-4"><Text>Finding your place…</Text></View>;
  if (!cursor || !step) return <View className="p-4"><Text>Open the Trail to choose a Stop.</Text></View>;

  const section = cursor.kind === "theory" ? step.lesson.sections.find(candidate => candidate.key === cursor.itemKey) : undefined;
  const activity = cursor.kind === "question" ? flow.grade?.activity ?? step.activities.find(candidate => candidate.key === cursor.itemKey) : undefined;
  const sectionIndex = step.lesson.sections.findIndex(candidate => candidate.key === cursor.itemKey);
  const questionIndex = step.activities.findIndex(candidate => candidate.key === cursor.itemKey);
  const savedCorrect = !!activity && !flow.grade && !flow.retrying && step.correctActivityKeys.includes(activity.key);
  const busy = disabled || action.busy || answerBusy;
  const sources = section?.sourceCreditKeys ?? flow.grade?.effect.feedbackSourceCreditKeys ?? [];
  const position = section ? `Theory ${sectionIndex + 1} of ${step.lesson.sections.length}`
    : activity ? `Question ${questionIndex + 1} of ${step.activities.length}` : step.source.kind === "support" ? "Step complete" : "Stop complete";
  const first = cursorKey(stepCards(step)[0]) === identity;
  const finalTheory = sectionIndex === step.lesson.sections.length - 1;
  const advance = async () => {
    if (busy) return;
    if (section && finalTheory && !step.lessonRead && step.source.kind === "trail") {
      const result = await action.run({ kind: "record_lesson_read", expeditionKey, stopKey: step.stopKey });
      if (result?.status !== "applied") return;
    }
    flow.next();
  };

  return <Card padding="none" className="min-h-0 flex-1" testID="focused-learning-card">
    <View className="flex-row items-center gap-[8px] border-b border-line px-[16px] py-[8px]">
      <View ref={heading} tabIndex={-1} accessibilityRole="header" accessibilityLabel={`${position}. ${step.label}`} className="min-w-0 flex-1 web:focus:outline-none">
        <Text variant="caption" color="muted" testID="learning-position">{position}</Text>
      </View>
      {sources.length > 0 ? <SourceCreditsButton key={identity} sourceCredits={sourceCredits} sourceCreditKeys={sources}
        contextLabel={section ? `“${section.title}”` : "this answer’s explanation"} /> : null}
    </View>
    <ScrollView ref={scroll} className="min-h-0 flex-1" contentContainerClassName="gap-[16px] p-[16px]" keyboardShouldPersistTaps="handled" testID="learning-body">
      <Text variant="title">{step.label}</Text>
      {section ? <View className="gap-3" testID={`theory-${section.key}`}>
        <Text variant="heading">{section.title}</Text>
        <ExplorableTheoryText text={section.body} terms={onHelp ? section.explorableTerms.map(term => term.term) : []}
          onPressTerm={term => {
            if (!busy) onHelp?.(section.explorableTerms.find(candidate => candidate.term === term)?.supportPathKey);
          }} />
        {onHelp && section.explorableTerms.length > 0 ? <Button variant="outline" size="compact" label="Help with this idea"
          testID="learning-help" className="self-start" icon={<CircleHelp size={14} color={colors.ink} />}
          disabled={busy} onPress={() => onHelp(section.explorableTerms.length === 1 ? section.explorableTerms[0].supportPathKey : undefined)} /> : null}
      </View> : null}
      {activity ? savedCorrect ? <View className="gap-3" testID={`activity-${activity.key}`}>
        <Text variant="heading">{activity.prompt}</Text>
        <Text>Previously answered correctly.</Text>
        <Button variant="outline" label="Try again" disabled={busy} onPress={flow.retry} />
      </View> : <AuthoredActivityCard key={`${identity}:${flow.attempt}`} activity={activity} expeditionKey={expeditionKey}
        stopKey={step.stopKey} source={step.source} expectedStateVersion={stateVersion} result={flow.grade}
        disabled={disabled || action.busy} onGraded={flow.setGrade} onBusyChange={value => { setAnswerBusy(value); onBusyChange(value); }} /> : null}
      {cursor.kind === "complete" ? <View className="gap-4" testID="learning-completion">
        <Text variant="heading">{step.source.kind === "support" ? flow.nextStep ? "Ready for the next idea" : "Ready to return to your lesson" : step.settled ? "Stop complete" : "Keep building your understanding"}</Text>
        <Text>{step.source.kind === "support" ? "You’ve reviewed this idea and practised applying it."
          : step.settled ? "Your progress is saved. You can revisit the theory whenever you need it." : "Answer the remaining questions to master this Stop."}</Text>
        <Button variant="outline" label="Review theory" disabled={busy} onPress={flow.reviewStep} />
        {completionActions}
      </View> : null}
      {action.error ? <Text color="destructive" accessibilityLiveRegion="polite">{action.error}</Text> : null}
    </ScrollView>
    <View className="shrink-0 gap-[8px] border-t border-line p-[12px]" testID="learning-footer">
      {flow.grade?.effect.correct === false ? <Button variant="outline" label="Review theory" disabled={busy} onPress={flow.review} /> : null}
      <View className="flex-row gap-[8px]">
        <Button variant="outline" label="Back" disabled={busy || first} onPress={flow.back} />
        {section ? <Button className="min-w-0 flex-1" label={finalTheory ? flow.reviewing ? "Back to question" : "Start questions" : "Continue"}
          busy={action.busy} disabled={busy} onPress={() => void advance()} /> : null}
        {activity ? <Button className="min-w-0 flex-1" label={flow.grade?.effect.correct === false ? "Try again" : "Continue"}
          disabled={busy || (!flow.grade && !savedCorrect)} onPress={flow.grade?.effect.correct === false ? flow.retry : flow.next} /> : null}
        {cursor.kind === "complete" ? <Button className="min-w-0 flex-1" label={flow.nextStep ? "Continue" : onFinished ? finishedLabel : "Choose a Stop"}
          disabled={busy} onPress={() => flow.nextStep ? flow.select(flow.nextStep.key) : onFinished?.()} /> : null}
      </View>
    </View>
  </Card>;
}
