import type { LearnerExpedition } from "@lrnki/ports";
import { getOperationTimeline } from "@/lib/operationTimeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChartingAutoRefresh } from "./ChartingAutoRefresh";
import { chartingProgress } from "./chartingProgress";
import { stageCopy } from "./stageCopy";

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;

function isStalled(status: string, lastProgressAt: string | null | undefined): boolean {
  return status === "running" && lastProgressAt !== null && lastProgressAt !== undefined && Date.now() - new Date(lastProgressAt).getTime() > STALE_HEARTBEAT_MS;
}

export async function ChartingProgress({ expedition }: Readonly<{ expedition: LearnerExpedition }>) {
  const timeline = expedition.currentOperationId
    ? await getOperationTimeline(expedition.currentOperationId, expedition.currentOperationType ?? undefined)
    : undefined;
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "queued";
  const stalled = isStalled(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  const progress = chartingProgress(timeline);
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <ChartingAutoRefresh active={expedition.status === "charting"} />
      <CardHeader>
        <CardTitle>{expedition.title}</CardTitle>
        <CardDescription>{expedition.status === "failed" ? expedition.failureMessage ?? "Surveying failed." : stalled ? "Surveying has stopped reporting progress." : stageCopy(currentStage)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{progress.indeterminate ? "Surveying" : "Surveying progress"}</span>
          <span className="tabular-nums text-muted-foreground">{progress.completed} / {progress.total}</span>
        </div>
        <Progress value={progress.fraction === null ? null : Math.round(progress.fraction * 100)} />
        <div className="flex flex-wrap gap-2">
          <Badge variant={expedition.status === "failed" || stalled ? "destructive" : "secondary"}>
            {stalled ? "Stalled" : expeditionStatusLabel(expedition.status)}
          </Badge>
          {expedition.currentOperationType ? <Badge variant="outline">Surveying run</Badge> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function expeditionStatusLabel(status: LearnerExpedition["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "charting") return "Surveying";
  if (status === "failed") return "Surveying stopped";
  return "Archived";
}
