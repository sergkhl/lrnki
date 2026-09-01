import { View } from "react-native";
import { GitBranchPlus, RefreshCw } from "lucide-react-native";

import { dispatchLearnerCommand } from "@/lib/actions";
import type { ExpeditionView } from "@/lib/queries";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  OverlayHeader,
  Text,
  colors
} from "@/ui";
import { AuthoredActivityCard } from "./AuthoredActivityCard";
import {
  SourceCreditsExpander,
  type SourceCredit
} from "./SourceCredits";

export type AuthoredSupportPath = ExpeditionView["supportPaths"][number];

export function AuthoredSupportDialog({
  open,
  path,
  sourceCredits,
  expeditionKey,
  expectedStateVersion,
  onOpenChange,
  onSettled,
  onRefresh
}: Readonly<{
  open: boolean;
  path: AuthoredSupportPath | null;
  sourceCredits: readonly SourceCredit[];
  expeditionKey: string;
  expectedStateVersion: string;
  onOpenChange: (open: boolean) => void;
  onSettled: () => Promise<unknown> | unknown;
  onRefresh: () => Promise<unknown> | unknown;
}>) {
  if (!path) return null;

  const hide = async () => {
    const result = await dispatchLearnerCommand({
      expectedStateVersion,
      command: {
        kind: "hide_support_path",
        expeditionKey,
        supportPathKey: path.supportPathKey
      }
    });
    await onSettled();
    if (result.status === "applied") onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OverlayHeader
        icon={<GitBranchPlus size={20} color={colors.ink} />}
        title="Support Path"
        description={`“${path.term}” · exact authored references`}
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <Text color="muted">
          This branch reuses ordinary acquisition evidence. It cannot award progress to the parent Stop.
        </Text>
        {path.steps.map((step, index) => (
          <View key={`${step.stopKey}-${step.activityKey}`} className="gap-3">
            <Text variant="heading">{index + 1}. {step.stopLabel}</Text>
            {step.lesson.sections.map((section) => (
              <View key={section.key} className="gap-1">
                <Text variant="title">{section.title}</Text>
                <Text>{section.body}</Text>
                <SourceCreditsExpander
                  sourceCredits={sourceCredits}
                  sourceCreditKeys={section.sourceCreditKeys}
                  contextLabel={`the Support Lesson section “${section.title}”`}
                />
              </View>
            ))}
            <AuthoredActivityCard
              expeditionKey={expeditionKey}
              stopKey={step.stopKey}
              activity={step.activity}
              sourceCredits={sourceCredits}
              source={{ kind: "support", supportPathKey: path.supportPathKey }}
              expectedStateVersion={expectedStateVersion}
              onSettled={onSettled}
            />
          </View>
        ))}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          label="Refresh path"
          icon={<RefreshCw size={14} color={colors.ink} />}
          onPress={() => void onRefresh()}
        />
        <Button variant="outline" label="Hide path" onPress={() => void hide()} />
        <Button label="Keep exploring" onPress={() => onOpenChange(false)} />
      </DialogFooter>
    </Dialog>
  );
}
