import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, Sparkles } from "lucide-react-native";
import type { ConceptLessonView, ScaffoldStepView, StudyOptionSelectView } from "@lrnki/application/projection";
import type { LearnerGradingResult } from "@/lib/api";
import { markScaffoldLessonRead, submitScaffoldOptionSelect } from "@/lib/actions";
import { Button, Badge, FullScreenDialog, OverlayHeader, Text, colors, triggerHaptic } from "@/ui";
import { OptionSelectBody } from "./ActivityCards";
import { LessonSections } from "./LessonSections";
import { learnerTerm } from "@/learn/vocabulary";

type GeneratedStep = Extract<ScaffoldStepView, { kind: "generated" }>;

// The generated Support Step study sheet (plan 2026-07-12-002 U6, R11-R12, KTD11). Reuses the SAME
// Activity Sheet bodies as neutral study (LessonSections + OptionSelectBody) so a generated step
// looks and grades like the rest of the trail, but every surface is labeled generated (R11) and
// grading is SCAFFOLD-scoped (`submitScaffoldOptionSelect`, keyed on the step id) so it never
// touches base mastery (R19). Completion is lesson-read AND item-correct: the sheet reads the
// micro-lesson first, then reveals the question, mirroring the neutral theory→question flow.
export function ScaffoldStepSheet({
  enrichmentId,
  step,
  open,
  onOpenChange
}: Readonly<{
  enrichmentId: string;
  step: GeneratedStep | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(false);
  return (
    <FullScreenDialog open={open} onOpenChange={onOpenChange} dismissBlocked={pending}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {step ? (
          <ScaffoldStepController key={step.scaffoldStepId} enrichmentId={enrichmentId} step={step} onClose={() => onOpenChange(false)} onPendingChange={setPending} />
        ) : null}
      </View>
    </FullScreenDialog>
  );
}

function ScaffoldStepController({
  enrichmentId,
  step,
  onClose,
  onPendingChange
}: Readonly<{ enrichmentId: string; step: GeneratedStep; onClose: () => void; onPendingChange: (pending: boolean) => void }>) {
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
      if (outcome.graded) triggerHaptic(outcome.correct ? "success" : "warning");
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
      <OverlayHeader
        icon={<Sparkles size={20} color={colors.ink} />}
        iconTone="soft"
        title={step.label}
        description={learnerTerm("supportSectionLabel")}
        onClose={onClose}
        closeDisabled={pending}
      />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 p-4">
          <View className="flex-row">
            {/* Generated content is labeled generated end to end (R11). */}
            <Badge>{learnerTerm("supportGeneratedBadge")}</Badge>
          </View>
          {step.complete ? (
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
            <Button busy={pending} onPress={onClose} label={learnerTerm("returnToTrail")} />
          ) : null}
        </View>
      </View>
    </>
  );
}
