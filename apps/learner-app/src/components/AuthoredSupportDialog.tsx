import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { GitBranchPlus } from "lucide-react-native";
import type { ExpeditionView } from "@/lib/queries";
import { useLearnerCommand } from "@/lib/useLearnerCommand";
import { useFocusedFlow } from "@/learn/useFocusedFlow";
import type { LearningStep } from "@/learn/focusedFlow";
import { Button, FullScreenDialog, OverlayHeader, Text, colors } from "@/ui";
import { FocusedLearningFlow } from "./FocusedLearningFlow";
import type { SourceCredit } from "./SourceCredits";

export type AuthoredSupportPath = ExpeditionView["supportPaths"][number];

export function AuthoredSupportDialog(props: Readonly<{
  open: boolean;
  path: AuthoredSupportPath | null;
  sourceCredits: readonly SourceCredit[];
  expeditionKey: string;
  expectedStateVersion: string;
  learnerRef: string;
  contentRevision: string;
  onOpenChange: (open: boolean) => void;
}>) {
  return props.open && props.path ? <SupportSession key={props.path.supportPathKey} {...props} path={props.path} /> : null;
}

function SupportSession({ path, sourceCredits, expeditionKey, expectedStateVersion, learnerRef, contentRevision, onOpenChange }: Readonly<{
  path: AuthoredSupportPath;
  sourceCredits: readonly SourceCredit[];
  expeditionKey: string;
  expectedStateVersion: string;
  learnerRef: string;
  contentRevision: string;
  onOpenChange: (open: boolean) => void;
}>) {
  const [flowBusy, setFlowBusy] = useState(false);
  const flowPending = useRef(false);
  const steps = useMemo<LearningStep[]>(() => path.steps.map((step, index) => ({
    key: `${index}:${step.stopKey}:${step.activityKey}`, stopKey: step.stopKey, label: step.stopLabel,
    lesson: step.lesson, activities: [step.activity], locked: false, settled: false, lessonRead: true,
    correctActivityKeys: [], source: { kind: "support", supportPathKey: path.supportPathKey }
  })), [path]);
  const flow = useFocusedFlow(steps, { learnerRef, expeditionKey, contentRevision, supportPathKey: path.supportPathKey });
  const action = useLearnerCommand(expectedStateVersion);
  const busy = flowBusy || action.busy;
  const close = () => { if (!flowPending.current && !action.isPending()) onOpenChange(false); };
  const hide = async () => {
    if (flowPending.current) return;
    const result = await action.run({ kind: "hide_support_path", expeditionKey, supportPathKey: path.supportPathKey });
    if (result?.status === "applied") onOpenChange(false);
  };
  return <FullScreenDialog open onOpenChange={next => { if (!next) close(); }} dismissBlocked={busy}>
    <OverlayHeader icon={<GitBranchPlus size={20} color={colors.ink} />} title="Support Path"
      description={`${path.term} · Step ${Math.max(0, steps.findIndex(step => step.key === flow.step?.key)) + 1} of ${steps.length}`}
      onClose={close} closeLabel="Back to lesson" closeDisabled={busy} />
    <View className="mx-auto min-h-0 w-full max-w-2xl flex-1 gap-2 p-3">
      {action.error ? <Text color="destructive" accessibilityLiveRegion="polite">{action.error}</Text> : null}
      <FocusedLearningFlow flow={flow} expeditionKey={expeditionKey} stateVersion={expectedStateVersion}
        sourceCredits={sourceCredits} disabled={action.busy}
        onBusyChange={value => { flowPending.current = value; setFlowBusy(value); }} onFinished={close} />
      <Button variant="outline" size="compact" label="Hide path" disabled={busy} busy={action.busy} onPress={() => void hide()} />
    </View>
  </FullScreenDialog>;
}
