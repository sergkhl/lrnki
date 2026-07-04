import type { LearnerExpedition } from "@lrnki/ports";
import { getOperationTimeline } from "@/lib/operationTimeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartingAutoRefresh } from "./ChartingAutoRefresh";

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;

function isStalled(status: string, lastProgressAt: string | null | undefined): boolean {
  return status === "running" && lastProgressAt !== null && lastProgressAt !== undefined && Date.now() - new Date(lastProgressAt).getTime() > STALE_HEARTBEAT_MS;
}

export async function ChartingProgress({ expedition }: Readonly<{ expedition: LearnerExpedition }>) {
  const timeline = expedition.currentOperationId
    ? await getOperationTimeline(expedition.currentOperationId, expedition.currentOperationType ?? undefined)
    : undefined;
  const currentStage = timeline?.stages.find((stage) => !stage.endedAt)?.stage ?? timeline?.stages.at(-1)?.stage ?? "Queued";
  const stalled = isStalled(timeline?.summary.status ?? expedition.status, timeline?.summary.lastProgressAt);
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <ChartingAutoRefresh active={expedition.status === "charting"} />
      <CardHeader>
        <CardTitle>{expedition.title}</CardTitle>
        <CardDescription>{expedition.status === "failed" ? expedition.failureMessage ?? "Charting failed." : stalled ? "Charting has stopped reporting progress." : currentStage}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant={expedition.status === "failed" || stalled ? "destructive" : "secondary"}>{stalled ? "stalled" : expedition.status}</Badge>
        {expedition.currentOperationType ? <Badge variant="outline">{expedition.currentOperationType}</Badge> : null}
      </CardContent>
    </Card>
  );
}
