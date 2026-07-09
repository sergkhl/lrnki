import { useState } from "react";
import { Text, View } from "react-native";
import { isStaleOperation } from "@lrnki/application/projection";
import type { LearnerExpedition, OperationTimelineDetail } from "@lrnki/ports";
import { retryTopicExpedition } from "@/lib/actions";
import { BadgeLabel, Btn, Card, CardDescription, CardTitle, ProgressBar } from "./ui";
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
        <CardTitle>{expedition.title}</CardTitle>
        <CardDescription>{learnerTerm("queuedDescription")}</CardDescription>
        <Text className="text-sm font-medium text-ink">{learnerTerm("queued")}</Text>
        <ProgressBar fraction={null} />
      </Card>
    );
  }
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "queued";
  const stalled = isStaleOperation(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  const progress = generationProgress(timeline ?? undefined);
  return (
    <Card className="gap-3">
      <CardTitle>{expedition.title}</CardTitle>
      <CardDescription>
        {expedition.status === "failed" ? expedition.failureMessage ?? learnerTerm("generatingFailedDescription") : stalled ? learnerTerm("generatingStoppedDescription") : stageCopy(currentStage)}
      </CardDescription>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-medium text-ink">{progress.indeterminate ? learnerTerm("generating") : learnerTerm("generatingProgress")}</Text>
        <Text className="text-sm tabular-nums text-muted">{progress.completed} / {progress.total}</Text>
      </View>
      <ProgressBar fraction={progress.fraction} />
      {expedition.status === "failed" || stalled ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <BadgeLabel className="border-destructive bg-destructive" textClassName="text-[#fdfaf2]">
            {stalled ? learnerTerm("generatingStopped") : expeditionStatusLabel(expedition.status)}
          </BadgeLabel>
          <Btn
            variant="outline"
            disabled={pending}
            label={learnerTerm("retryGeneration")}
            onPress={() => {
              setPending(true);
              void retryTopicExpedition({ learnerExpeditionId: expedition.learnerExpeditionId }).finally(() => setPending(false));
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
