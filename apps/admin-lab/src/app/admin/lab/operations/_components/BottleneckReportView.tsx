import type { BottleneckReport } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatUsd(usd: number | null): string {
  return usd === null ? "—" : `$${usd.toFixed(4)}`;
}

export function BottleneckReportView({ report }: { report: BottleneckReport }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{report.scope}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{report.anchorId}</span>
        {!report.costAvailable ? <Badge variant="destructive">cost unavailable</Badge> : null}
      </div>
      {report.operations.map((operation) => (
        <section className="flex flex-col gap-2" key={`${operation.operationType}:${operation.operationId}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{operation.operationType}</Badge>
            <Badge variant="outline">{operation.status}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{operation.operationId}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Wall-clock</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost (USD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operation.stages.map((row) => (
                <TableRow key={row.stage}>
                  <TableCell className="font-medium">{row.stage}</TableCell>
                  <TableCell><Badge variant="outline">{row.isLlmStage ? "LLM" : "non-LLM"}</Badge></TableCell>
                  <TableCell className="text-right">{formatMs(row.wallClockMs)}</TableCell>
                  <TableCell className="text-right">{row.calls ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.tokens ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.costUsd)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium" colSpan={2}>Subtotal</TableCell>
                <TableCell className="text-right">{formatMs(operation.subtotal.wallClockMs)}</TableCell>
                <TableCell className="text-right">{operation.subtotal.calls ?? "—"}</TableCell>
                <TableCell className="text-right">{operation.subtotal.tokens ?? "—"}</TableCell>
                <TableCell className="text-right">{formatUsd(operation.subtotal.costUsd)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      ))}
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium" colSpan={2}>{report.scope === "journey" ? "Journey total" : "Operation total"}</TableCell>
            <TableCell className="text-right">{formatMs(report.total.wallClockMs)}</TableCell>
            <TableCell className="text-right">{report.total.calls ?? "—"} calls</TableCell>
            <TableCell className="text-right">{report.total.tokens ?? "—"} tokens</TableCell>
            <TableCell className="text-right">{formatUsd(report.total.costUsd)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
