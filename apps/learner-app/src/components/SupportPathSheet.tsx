import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, ChevronRight, Circle, EyeOff, GitBranchPlus, MapPin } from "lucide-react-native";
import type { ConceptLessonView, ScaffoldDetourView, ScaffoldStepView, StudyOptionSelectView } from "@lrnki/application/projection";
import type { LearnerGradingResult } from "@/lib/api";
import { markScaffoldLessonRead, submitScaffoldOptionSelect } from "@/lib/actions";
import { Badge, Button, FullScreenDialog, OverlayHeader, PressableSurface, Text, colors, triggerHaptic } from "@/ui";
import { OptionSelectBody } from "./ActivityCards";
import { LessonSections } from "./LessonSections";
import { learnerTerm, supportStepsDoneCopy } from "@/learn/vocabulary";

type GeneratedStep = Extract<ScaffoldStepView, { kind: "generated" }>;
type ReferenceStep = Extract<ScaffoldStepView, { kind: "reference" }>;

// The full-screen Support Path flow (plan 2026-07-13-002 U5, R13-R16, KTD6). ONE sheet owns the
// whole ready path: an incomplete path opens at its projected first incomplete Support Step, a
// complete path opens at the step overview, and the fixed progress header can always reach that
// overview. Generated steps reuse the same lesson/option-select bodies and SCAFFOLD-scoped
// grading the retired ScaffoldStepSheet used (R17 — never neutral mastery); a reference step
// never renders copied neutral content — it routes back to the canonical trail stop (R15).
// Hide lives in the overview (F4).
export function SupportPathSheet({
  enrichmentId,
  detour,
  open,
  onOpenChange,
  onHide,
  onOpenReference,
  referenceLabelFor
}: Readonly<{
  enrichmentId: string;
  detour: ScaffoldDetourView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHide: (detourId: string) => void;
  // Reference routing (F3): the parent closes this sheet, focuses the referenced Concept
  // Marker, and opens its application-resolved ordinary stop.
  onOpenReference: (step: ReferenceStep) => void;
  referenceLabelFor: (derivedNodeId: string) => string;
}>) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(false);
  return (
    <FullScreenDialog open={open} onOpenChange={onOpenChange} dismissBlocked={pending}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {detour ? (
          <PathController
            key={detour.detourId}
            enrichmentId={enrichmentId}
            detour={detour}
            onClose={() => onOpenChange(false)}
            onHide={onHide}
            onOpenReference={onOpenReference}
            referenceLabelFor={referenceLabelFor}
            onPendingChange={setPending}
          />
        ) : null}
      </View>
    </FullScreenDialog>
  );
}

function PathController({
  enrichmentId,
  detour,
  onClose,
  onHide,
  onOpenReference,
  referenceLabelFor,
  onPendingChange
}: Readonly<{
  enrichmentId: string;
  detour: ScaffoldDetourView;
  onClose: () => void;
  onHide: (detourId: string) => void;
  onOpenReference: (step: ReferenceStep) => void;
  referenceLabelFor: (derivedNodeId: string) => string;
  onPendingChange: (pending: boolean) => void;
}>) {
  // Resume rule (R13): incomplete → the projection's first incomplete step; complete → overview.
  const [stepId, setStepId] = useState<string | null>(detour.complete ? null : detour.firstIncompleteStepId);
  // A step graded correct in THIS sheet counts as done immediately, so "next incomplete"
  // advances before the polled projection catches up. The projection stays authoritative.
  const [locallyDone, setLocallyDone] = useState<ReadonlySet<string>>(new Set());
  const steps = [...detour.steps].sort((a, b) => a.ordinal - b.ordinal);
  const isDone = (step: ScaffoldStepView) => step.complete || locallyDone.has(step.scaffoldStepId);
  const doneCount = steps.filter(isDone).length;
  const currentStep = stepId !== null ? steps.find((step) => step.scaffoldStepId === stepId) ?? null : null;
  const nextIncomplete = steps.find((step) => !isDone(step) && step.scaffoldStepId !== stepId) ?? null;

  return (
    <>
      <OverlayHeader
        icon={<GitBranchPlus size={20} color={colors.ink} />}
        iconTone="soft"
        title={detour.term}
        description={learnerTerm("supportSectionLabel")}
        onClose={onClose}
      />
      {/* The fixed progress header (R13): step dots + spelled-out progress, and the overview
          is always one tap away while studying a step. */}
      <View className="border-b border-line bg-card px-4 py-2">
        <View className="mx-auto w-full max-w-3xl flex-row items-center gap-3">
          <View className="flex-row gap-1.5" accessibilityLabel={supportStepsDoneCopy(doneCount, steps.length)}>
            {steps.map((step) => (
              <View
                key={step.scaffoldStepId}
                className={`h-2 w-2 rounded-full ${isDone(step) ? "bg-gem" : step.scaffoldStepId === stepId ? "bg-frontier" : "border border-line-strong bg-transparent"}`}
              />
            ))}
          </View>
          <Text variant="caption" color="muted" className="min-w-0 flex-1">{supportStepsDoneCopy(doneCount, steps.length)}</Text>
          {currentStep ? (
            <Button variant="outline" size="compact" onPress={() => setStepId(null)} label={learnerTerm("supportOverviewAction")} testID="support-path-overview" />
          ) : null}
        </View>
      </View>
      {currentStep === null ? (
        <PathOverview
          detour={detour}
          steps={steps}
          isDone={isDone}
          referenceLabelFor={referenceLabelFor}
          onOpenStep={(step) => (step.kind === "reference" ? onOpenReference(step) : setStepId(step.scaffoldStepId))}
          onHide={() => onHide(detour.detourId)}
        />
      ) : currentStep.kind === "reference" ? (
        <ReferenceStepBody
          referencedLabel={referenceLabelFor(currentStep.referencedDerivedNodeId)}
          complete={isDone(currentStep)}
          onGo={() => onOpenReference(currentStep)}
        />
      ) : (
        <GeneratedStepBody
          key={currentStep.scaffoldStepId}
          enrichmentId={enrichmentId}
          step={currentStep}
          complete={isDone(currentStep)}
          hasNext={nextIncomplete !== null}
          onCorrect={() => setLocallyDone((done) => new Set([...done, currentStep.scaffoldStepId]))}
          onContinue={() => (nextIncomplete ? setStepId(nextIncomplete.scaffoldStepId) : onClose())}
          onPendingChange={onPendingChange}
        />
      )}
    </>
  );
}

// The step overview (R13, F4): every ordered Support Step as a tappable row for selective
// review — completed steps stay revisitable without clearing their completion — plus the
// path-level Hide action.
function PathOverview({
  detour,
  steps,
  isDone,
  referenceLabelFor,
  onOpenStep,
  onHide
}: Readonly<{
  detour: ScaffoldDetourView;
  steps: ScaffoldStepView[];
  isDone: (step: ScaffoldStepView) => boolean;
  referenceLabelFor: (derivedNodeId: string) => string;
  onOpenStep: (step: ScaffoldStepView) => void;
  onHide: () => void;
}>) {
  return (
    <ScrollView className="flex-1">
      <View className="mx-auto w-full max-w-3xl gap-3 p-4">
        <Text variant="caption" color="muted">{learnerTerm("supportOverviewHint")}</Text>
        {steps.map((step) => {
          const label = step.kind === "reference" ? referenceLabelFor(step.referencedDerivedNodeId) : step.label;
          const done = isDone(step);
          return (
            <PressableSurface
              key={step.scaffoldStepId}
              accessibilityLabel={label}
              accessibilityHint={done ? learnerTerm("supportStepDone") : undefined}
              onPress={() => onOpenStep(step)}
              className="min-h-target flex-row items-center gap-2 rounded-control border border-line bg-card px-3 py-2"
              pressedClassName="bg-muted-panel"
              testID={`support-path-step-${step.scaffoldStepId}`}
            >
              {done ? <CheckCircle2 size={16} color={colors.gem} /> : <Circle size={16} color={colors.line} />}
              {step.kind === "reference" ? <MapPin size={14} color={colors.ink} /> : null}
              <Text variant="label" className="min-w-0 flex-1 font-normal" numberOfLines={2}>{label}</Text>
              <ChevronRight size={16} color={colors.ink} />
            </PressableSurface>
          );
        })}
        <View className="flex-row justify-end pt-1">
          <Button
            variant="outline"
            size="compact"
            onPress={onHide}
            icon={<EyeOff size={14} color={colors.ink} />}
            label={learnerTerm("supportHide")}
            testID={`support-path-hide-${detour.detourId}`}
          />
        </View>
      </View>
    </ScrollView>
  );
}

// A reference Support Step never duplicates neutral content inside the path (R15): a concise
// map-reference transition, then the parent routes to the referenced node's canonical stop.
function ReferenceStepBody({
  referencedLabel,
  complete,
  onGo
}: Readonly<{ referencedLabel: string; complete: boolean; onGo: () => void }>) {
  return (
    <ScrollView className="flex-1">
      <View className="mx-auto w-full max-w-3xl gap-4 p-4">
        <View className="gap-3 rounded-card border border-line bg-card p-4">
          <View className="flex-row items-center gap-2">
            <MapPin size={18} color={colors.ink} />
            <Text variant="title" className="min-w-0 flex-1 text-lg" numberOfLines={2}>{referencedLabel}</Text>
          </View>
          <Text variant="label" color="muted" className="font-normal">{learnerTerm("supportReferenceBody")}</Text>
          {complete ? (
            <View className="flex-row items-center gap-2 self-start rounded-card border border-line bg-gem-soft px-3 py-2">
              <CheckCircle2 size={16} color={colors.ink} />
              <Text variant="label">{learnerTerm("supportStepDone")}</Text>
            </View>
          ) : null}
          <View className="flex-row">
            <Button onPress={onGo} label={learnerTerm("supportReferenceAction")} testID="support-path-reference-go" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// A generated Support Step: the retired ScaffoldStepSheet's exact study behavior — read the
// generated micro-lesson, mark it read, reveal the key-free option-select, grade through the
// scaffold-scoped path — now advancing to the next incomplete step in the same flow (F2).
function GeneratedStepBody({
  enrichmentId,
  step,
  complete,
  hasNext,
  onCorrect,
  onContinue,
  onPendingChange
}: Readonly<{
  enrichmentId: string;
  step: GeneratedStep;
  complete: boolean;
  hasNext: boolean;
  onCorrect: () => void;
  onContinue: () => void;
  onPendingChange: (pending: boolean) => void;
}>) {
  // Start on the question when the lesson was already read (revisiting); otherwise read first.
  const [phase, setPhase] = useState<"lesson" | "question">(step.lessonRead ? "question" : "lesson");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<LearnerGradingResult | null>(null);
  const [pending, setPending] = useState(false);
  const graded = result?.graded === true;

  const run = (work: () => Promise<void>) => {
    setPending(true);
    onPendingChange(true);
    void work().finally(() => {
      setPending(false);
      onPendingChange(false);
    });
  };

  const advanceToQuestion = () => {
    run(async () => {
      await markScaffoldLessonRead({ enrichmentId, scaffoldStepId: step.scaffoldStepId });
      setPhase("question");
    });
  };

  const submit = (optionId: string) => {
    if (pending || graded) return;
    setSelectedId(optionId);
    run(async () => {
      const outcome = await submitScaffoldOptionSelect({ enrichmentId, scaffoldStepId: step.scaffoldStepId, chosenOptionId: optionId });
      setResult(outcome);
      if (outcome.graded) {
        triggerHaptic(outcome.correct ? "success" : "warning");
        if (outcome.correct) onCorrect();
      }
    });
  };

  const optionView: StudyOptionSelectView = {
    studyItemId: step.scaffoldStepId,
    derivedNodeId: "",
    question: step.item.question,
    explanation: step.item.explanation,
    groundingProvenance: "generated",
    options: step.item.options.map((option) => ({ optionId: option.optionId, text: option.text, provenance: "generated" as const })),
    explorableTerms: []
  };
  const lessonView: ConceptLessonView = { derivedNodeId: step.scaffoldStepId, canonicalLabel: step.label, sections: step.lesson, explorableTerms: [] };

  return (
    <>
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 p-4">
          <View className="flex-row">
            {/* Generated content stays labeled generated end to end (R14/ADR-0037). */}
            <Badge>{learnerTerm("supportGeneratedBadge")}</Badge>
          </View>
          {complete ? (
            <View className="flex-row items-center gap-2 self-start rounded-card border border-line bg-gem-soft px-3 py-2">
              <CheckCircle2 size={16} color={colors.ink} />
              <Text variant="label">{learnerTerm("supportStepDone")}</Text>
            </View>
          ) : null}
          {lessonView.sections.length ? <LessonSections lesson={lessonView} /> : null}
          {phase === "question" ? (
            <OptionSelectBody item={optionView} selectedId={selectedId} result={result} disabled={pending} onSelect={submit} />
          ) : null}
        </View>
      </ScrollView>
      <View className="border-t border-line bg-card p-4">
        <View className="mx-auto w-full max-w-3xl flex-row justify-end">
          {phase === "lesson" ? (
            <Button busy={pending} onPress={advanceToQuestion} label={learnerTerm("continueAction")} />
          ) : graded ? (
            <Button
              busy={pending}
              onPress={onContinue}
              label={hasNext ? learnerTerm("continueAction") : learnerTerm("returnToTrail")}
              testID="support-path-continue"
            />
          ) : null}
        </View>
      </View>
    </>
  );
}
