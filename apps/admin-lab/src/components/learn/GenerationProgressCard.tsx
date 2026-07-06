import type { LearnerExpedition } from "@lrnki/ports";
import { retryTopicExpedition } from "@/app/learn/actions";
import { getOperationTimeline } from "@/lib/operationTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AutoRefresh } from "@/components/AutoRefresh";
import { generationProgress, isQueuedExpedition } from "./generationProgress";
import { stageCopy } from "./stageCopy";
import { expeditionStatusLabel, learnerTerm } from "./vocabulary";

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;

function isStalled(status: string, lastProgressAt: string | null | undefined): boolean {
  return status === "running" && lastProgressAt !== null && lastProgressAt !== undefined && Date.now() - new Date(lastProgressAt).getTime() > STALE_HEARTBEAT_MS;
}

export async function GenerationProgressCard({ expedition }: Readonly<{ expedition: LearnerExpedition }>) {
  // Auto-refresh covers the queued → scouting transition.
  if (isQueuedExpedition(expedition)) {
    return (
      <Card className="border-border bg-card">
        <AutoRefresh active />
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
  const timeline = expedition.currentOperationId
    ? await getOperationTimeline(expedition.currentOperationId, expedition.currentOperationType ?? undefined)
    : undefined;
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "queued";
  const stalled = isStalled(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  const progress = generationProgress(timeline);
  return (
    <Card className="border-border bg-card">
      <AutoRefresh active={expedition.status === "generating"} />
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
            <form action={async () => {
              "use server";
              await retryTopicExpedition({
                learnerStateRef: expedition.learnerStateRef,
                learnerExpeditionId: expedition.learnerExpeditionId
              });
            }}>
              <Button type="submit" size="sm" variant="outline">{learnerTerm("retryGeneration")}</Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
