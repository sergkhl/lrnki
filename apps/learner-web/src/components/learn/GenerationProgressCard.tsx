import { useTransition } from "react";
import { isStaleOperation } from "@lrnki/application/projection";
import type { LearnerExpedition, OperationTimelineDetail } from "@lrnki/ports";
import { retryTopicExpedition } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { generationProgress, isQueuedExpedition } from "./generationProgress";
import { stageCopy } from "./stageCopy";
import { expeditionStatusLabel, learnerTerm } from "./vocabulary";

// Pure progress card: the timeline arrives with the journal read and Query polling
// replaces the old SSR auto-refresh, so this component only renders and retries.
export function GenerationProgressCard({
  expedition,
  timeline
}: Readonly<{ expedition: LearnerExpedition; timeline: OperationTimelineDetail | null | undefined }>) {
  const [pending, startTransition] = useTransition();
  if (isQueuedExpedition(expedition)) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{expedition.title}</CardTitle>
          <CardDescription>{learnerTerm("queuedDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{learnerTerm("queued")}</span>
          </div>
          <Progress value={null} />
        </CardContent>
      </Card>
    );
  }
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "queued";
  const stalled = isStaleOperation(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  const progress = generationProgress(timeline ?? undefined);
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>{expedition.title}</CardTitle>
        <CardDescription>{expedition.status === "failed" ? expedition.failureMessage ?? learnerTerm("generatingFailedDescription") : stalled ? learnerTerm("generatingStoppedDescription") : stageCopy(currentStage)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{progress.indeterminate ? learnerTerm("generating") : learnerTerm("generatingProgress")}</span>
          <span className="tabular-nums text-muted-foreground">{progress.completed} / {progress.total}</span>
        </div>
        <Progress value={progress.fraction === null ? null : Math.round(progress.fraction * 100)} />
        {expedition.status === "failed" || stalled ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{stalled ? learnerTerm("generatingStopped") : expeditionStatusLabel(expedition.status)}</Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await retryTopicExpedition({ learnerExpeditionId: expedition.learnerExpeditionId });
                });
              }}
            >
              {learnerTerm("retryGeneration")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
