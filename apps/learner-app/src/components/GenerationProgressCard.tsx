import { useState } from "react";
import { View } from "react-native";
import { isStaleOperation } from "@lrnki/application/projection";
import type { LearnerExpedition, OperationTimelineDetail } from "@lrnki/ports";
import { retryTopicExpedition } from "@/lib/actions";
import { Badge, Button, Card, Progress, Text } from "@/ui";
import { generationProgress, isQueuedExpedition } from "@/learn/generationProgress";
import { stageCopy } from "@/learn/stageCopy";
import { expeditionStatusLabel, learnerTerm } from "@/learn/vocabulary";

// Pure progress card: the timeline arrives with the journal read and Query polling
// replaces the old SSR auto-refresh, so this component only renders and retries.
export function GenerationProgressCard({
  expedition,
  timeline
}: Readonly<{ expedition: LearnerExpedition; timeline: OperationTimelineDetail | null | undefined }>) {
  const [pending, setPending] = useState(false);
  if (isQueuedExpedition(expedition)) {
    return (
      <Card className="gap-3">
        <Text variant="title">{expedition.title}</Text>
        <Text variant="caption" color="muted">{learnerTerm("queuedDescription")}</Text>
        <Text variant="label">{learnerTerm("queued")}</Text>
        <Progress fraction={null} accessibilityLabel={learnerTerm("queued")} />
      </Card>
    );
  }
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "queued";
  const stalled = isStaleOperation(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  const progress = generationProgress(timeline ?? undefined);
  return (
    <Card className="gap-3">
      <Text variant="title">{expedition.title}</Text>
      <Text variant="caption" color="muted">
        {expedition.status === "failed" ? expedition.failureMessage ?? learnerTerm("generatingFailedDescription") : stalled ? learnerTerm("generatingStoppedDescription") : stageCopy(currentStage)}
      </Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="label">{progress.indeterminate ? learnerTerm("generating") : learnerTerm("generatingProgress")}</Text>
        <Text variant="label" color="muted" className="tabular-nums">{progress.completed} / {progress.total}</Text>
      </View>
      <Progress fraction={progress.fraction} accessibilityLabel={learnerTerm("generatingProgress")} />
      {expedition.status === "failed" || stalled ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge className="border-destructive bg-destructive" textClassName="text-on-accent">
            {stalled ? learnerTerm("generatingStopped") : expeditionStatusLabel(expedition.status)}
          </Badge>
          <Button
            variant="outline"
            size="compact"
            busy={pending}
            label={learnerTerm("retryGeneration")}
            onPress={() => {
              if (pending) return;
              setPending(true);
              void retryTopicExpedition({ learnerExpeditionId: expedition.learnerExpeditionId }).finally(() => setPending(false));
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
