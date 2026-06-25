import Link from "next/link";
import { DatabaseZapIcon, GaugeIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
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
import { getBottleneckReport } from "@/lib/operationTimeline";

// Admin Lab renderer of the bottleneck report (R5, R6). Renders the SAME use-case
// output the worker CLI prints (KTD5) — per-stage wall-clock joined with live LiteLLM
// cost. Read-only; no published graph state is mutated (rule 12).
export const dynamic = "force-dynamic";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default async function BottleneckPage({ searchParams }: { searchParams: Promise<{ operationId?: string }> }) {
  const { operationId } = await searchParams;
  const report = operationId ? await getBottleneckReport(operationId) : undefined;

  return (
    <AdminShell active="operations">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Bottleneck report</CardTitle>
          <CardDescription>
            Per-stage wall-clock (from the durable timeline) joined with live LiteLLM per-stage cost. Cost is the standing aggregate per stage tag; the application stores no cost figure.
          </CardDescription>
          <CardAction>
            <Link className="text-sm underline underline-offset-4" href="/admin/lab/operations">← operations</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!operationId ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GaugeIcon /></EmptyMedia>
                <EmptyTitle>No operation selected</EmptyTitle>
                <EmptyDescription>Open an operation from the Operations view to see its per-stage bottleneck breakdown.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : report === undefined ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Operation not found</AlertTitle>
              <AlertDescription>
                No timeline exists for <code className="font-mono">{operationId}</code> (or <code className="font-mono">DATABASE_URL</code> is unset).
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{report.operationType}</Badge>
                <Badge variant="outline">{report.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{report.operationId}</span>
                {!report.costAvailable ? <Badge variant="destructive">cost unavailable</Badge> : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Wall-clock</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.stages.map((row) => (
                    <TableRow key={row.stage}>
                      <TableCell className="font-medium">{row.stage}</TableCell>
                      <TableCell><Badge variant="outline">{row.isLlmStage ? "LLM" : "non-LLM"}</Badge></TableCell>
                      <TableCell className="text-right">{formatMs(row.wallClockMs)}</TableCell>
                      <TableCell className="text-right">{row.calls ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.costUsd === null ? "—" : `$${row.costUsd.toFixed(4)}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
