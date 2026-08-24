import { useState } from "react";
import { View } from "react-native";
import type { SyntheticTopicGenerationAvailability } from "@lrnki/application";
import { retryTopicExpedition } from "@/lib/actions";
import type { JournalView } from "@/lib/queries";
import { Badge, Button, Card, Progress, Text } from "@/ui";
import { stageCopy } from "@/learn/stageCopy";
import { expeditionStatusLabel, learnerTerm } from "@/learn/vocabulary";

type GeneratingRow = Exclude<JournalView["yours"][number], { status: "ready" }>;

// Pure progress card: queued/stalled/stage facts arrive finished from the Expedition
// Journal projection (plan 2026-07-12-001 KTD3), so this component only maps plain
// stage tags through themed copy, renders, and retries.
export function GenerationProgressCard({
  expedition,
  topicGenerationAvailability
}: Readonly<{
  expedition: GeneratingRow;
  topicGenerationAvailability: SyntheticTopicGenerationAvailability;
}>) {
  const [pending, setPending] = useState(false);
  const { generation } = expedition;
  if (topicGenerationAvailability.status === "paused") {
    return (
      <Card className="gap-3">
        <Text variant="title">{expedition.title}</Text>
        <Text variant="caption" color="muted">{topicGenerationAvailability.message}</Text>
        <Badge>{learnerTerm("topicGenerationPausedBadge")}</Badge>
      </Card>
    );
  }
  if (generation.queued) {
    return (
      <Card className="gap-3">
        <Text variant="title">{expedition.title}</Text>
        <Text variant="caption" color="muted">{learnerTerm("queuedDescription")}</Text>
        <Text variant="label">{learnerTerm("queued")}</Text>
        <Progress fraction={null} accessibilityLabel={learnerTerm("queued")} />
      </Card>
    );
  }
  return (
    <Card className="gap-3">
      <Text variant="title">{expedition.title}</Text>
      <Text variant="caption" color="muted">
        {expedition.status === "failed" ? expedition.failureMessage ?? learnerTerm("generatingFailedDescription") : generation.stalled ? learnerTerm("generatingStoppedDescription") : stageCopy(generation.currentStage ?? "queued")}
      </Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="label">{generation.indeterminate ? learnerTerm("generating") : learnerTerm("generatingProgress")}</Text>
        <Text variant="label" color="muted" className="tabular-nums">{generation.completed} / {generation.total}</Text>
      </View>
      <Progress fraction={generation.fraction} accessibilityLabel={learnerTerm("generatingProgress")} />
      {expedition.status === "failed" || generation.stalled ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge className="border-destructive bg-destructive" textClassName="text-on-accent">
            {generation.stalled ? learnerTerm("generatingStopped") : expeditionStatusLabel(expedition.status)}
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
