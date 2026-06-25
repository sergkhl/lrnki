import { ActivityIcon, DatabaseZapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { listOperationsWithStages } from "@/lib/operationTimeline";

// Live operator progress view (R4): for each triggered operation, "where is it, is it
// moving". Read-only — mutates no published graph state (rule 12). force-dynamic so a
// refresh reflects the latest incremental reporter writes (KTD3).
export const dynamic = "force-dynamic";

// A `running` operation whose last heartbeat is older than this is suspect — the
// "hung run" signal (KTD3 risk note), not healthy progress.
const STALE_HEARTBEAT_MS = 2 * 60 * 1000;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function isStale(status: string, lastProgressAt: string | null): boolean {
  if (status !== "running" || !lastProgressAt) return false;
  return Date.now() - new Date(lastProgressAt).getTime() > STALE_HEARTBEAT_MS;
}

export default async function OperationsPage() {
  const operations = await listOperationsWithStages();
  return (
    <AdminShell active="operations">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Operations</CardTitle>
          <CardDescription>
            Live run-stage timeline for extraction, minting, enrichment, and study-item generation — current sub-stage, heartbeat, and per-stage wall-clock.
          </CardDescription>
          <CardAction>
            <Badge variant={operations ? "outline" : "destructive"}>
              {operations ? `${operations.length} operations` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {!operations ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Database unavailable</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">DATABASE_URL</code> to inspect operation timelines.
              </AlertDescription>
            </Alert>
          ) : operations.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ActivityIcon /></EmptyMedia>
                <EmptyTitle>No operations</EmptyTitle>
                <EmptyDescription>No triggered operations have reported a timeline yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            operations.map((operation) => {
              const { summary, stages } = operation;
              const stale = isStale(summary.status, summary.lastProgressAt);
              return (
                <Card key={summary.operationRunId}>
                  <CardHeader className="border-b">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <Badge variant="outline">{summary.operationType}</Badge>
                      <Badge variant={statusVariant(summary.status)}>{summary.status}</Badge>
                      {summary.status === "running" && summary.currentStage ? (
                        <Badge variant="secondary">{summary.currentStage}</Badge>
                      ) : null}
                      {stale ? <Badge variant="destructive">stalled?</Badge> : null}
                      {summary.progressTotal !== null ? (
                        <Badge variant="outline">{summary.progressDone ?? 0} / {summary.progressTotal}</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">{summary.operationId}</CardDescription>
                    <CardAction>
                      <Badge variant="outline">elapsed {formatDuration(summary.elapsedMs)}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>started <LocalDateTime iso={summary.startedAt} /></span>
                      <span>last progress {summary.lastProgressAt ? <LocalDateTime iso={summary.lastProgressAt} /> : "—"}</span>
                      <span>{summary.completedAt ? <>completed <LocalDateTime iso={summary.completedAt} /></> : "in flight"}</span>
                    </div>
                    {stages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No stage rows yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Stage</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Started</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stages.map((stage, index) => (
                            <TableRow key={`${stage.stage}-${index}`}>
                              <TableCell className="font-medium">{stage.stage}</TableCell>
                              <TableCell>
                                {stage.endedAt === null ? (
                                  <Badge variant="secondary">running</Badge>
                                ) : (
                                  <Badge variant={stage.ok ? "default" : "destructive"}>{stage.ok ? "ok" : "failed"}</Badge>
                                )}
                              </TableCell>
                              <TableCell>{stage.progressTotal !== null ? `${stage.progressDone ?? 0} / ${stage.progressTotal}` : "—"}</TableCell>
                              <TableCell>{formatDuration(stage.durationMs)}</TableCell>
                              <TableCell className="font-mono text-xs"><LocalDateTime iso={stage.startedAt} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
