import { Fragment } from "react";
import Link from "next/link";
import { ActivityIcon, ChevronDownIcon, CoinsIcon, DatabaseZapIcon, GaugeIcon, RouteIcon, XIcon } from "lucide-react";
import { isStaleOperation, spendStageBelongsToOperation, type CostTimingReport } from "@lrnki/application";
import type { OperationStageSpend, OperationType, StageErrorDetail } from "@lrnki/ports";
import { AdminShell } from "@/components/AdminShell";
import { AutoRefresh } from "@/components/AutoRefresh";
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
import { getCostTimingReport, getJourneyCostReport, listOperationsWithStages, preloadOperationSpend } from "@/lib/operationTimeline";
import { CostTimingReportView } from "./_components/CostTimingReportView";

// Live operator progress view (R4): for each triggered operation, "where is it, is it
// moving". Read-only — mutates no published graph state (rule 12). force-dynamic so a
// refresh reflects the latest incremental reporter writes (KTD3). Active operations
// group first and the page auto-refreshes while any is running (R1). Cost/timings and
// journey reports render inline on the matching card via search params; finished cards
// collapse to header + cost chips and expand their stage table on demand (R5/R6).
export const dynamic = "force-dynamic";

type OperationWithStages = NonNullable<Awaited<ReturnType<typeof listOperationsWithStages>>>[number];

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
  return isStaleOperation(status, lastProgressAt);
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

type OperationCost = { costUsd: number; tokens: number; calls: number };

// Fold the preloaded LiteLLM spend rows down to one (cost, tokens, calls) total for a single
// operation, using the SAME catalog ownership filter the report uses (KTD4). Returns null when
// cost is unavailable, so the card degrades to its wall-clock elapsed chip only (AE6).
function operationCost(
  operationId: string,
  operationType: OperationType,
  spend: { rows: OperationStageSpend[]; costAvailable: boolean }
): OperationCost | null {
  if (!spend.costAvailable) return null;
  const owned = spend.rows.filter(
    (row) => row.operationId === operationId && spendStageBelongsToOperation(row.stage, operationType)
  );
  return owned.reduce<OperationCost>(
    (total, row) => ({ costUsd: total.costUsd + row.totalSpend, tokens: total.tokens + row.totalTokens, calls: total.calls + row.logCount }),
    { costUsd: 0, tokens: 0, calls: 0 }
  );
}

function isOperationType(value: string | undefined): value is OperationType {
  return value === "extraction" || value === "minting" || value === "enrichment" || value === "study_items";
}

function operationEnrichmentId(operationType: OperationType, operationId: string): string | null {
  return operationType === "enrichment" || operationType === "study_items" ? operationId : null;
}

// The redacted reason a failed stage carries (ADR-0006 fail-closed, made inspectable): the
// forced-tool exhaustion trail (per-attempt deviation kind, HTTP status, violated schema
// PATHS, and a bounded redacted arguments snippet) or a bounded `other` message. Read-only —
// the snippet was already redacted at the transport boundary; this only renders it.
function StageErrorDetailView({ detail }: Readonly<{ detail: StageErrorDetail }>) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <p className="font-medium text-destructive">{detail.message}</p>
      {detail.kind === "forced_tool_exhaustion" ? (
        <p className="text-muted-foreground">
          tool <span className="font-mono">{detail.toolName}</span>
          {detail.model ? <> · model <span className="font-mono">{detail.model}</span></> : null}
          {detail.attempts ? <> · {detail.attempts.length} attempt(s)</> : null}
        </p>
      ) : null}
      {detail.attempts?.map((attempt) => (
        <div key={attempt.attempt} className="rounded border border-dashed px-2 py-1">
          <p>
            attempt {attempt.attempt + 1}: <span className="font-mono">{attempt.kind}</span>
            {attempt.status !== undefined ? <> · HTTP {attempt.status}</> : null}
          </p>
          {attempt.schemaIssuePaths && attempt.schemaIssuePaths.length > 0 ? (
            <p className="text-muted-foreground">
              schema issues: <span className="font-mono">{attempt.schemaIssuePaths.join(", ")}</span>
            </p>
          ) : null}
          {attempt.redactedSnippet ? (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-1.5 font-mono text-[11px]">
              {attempt.redactedSnippet}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// One inline report panel on its owning operation card: either the operation's
// cost & timings breakdown or (for enrichments) the whole-journey cost rollup.
function InlineReport({
  title,
  report
}: Readonly<{ title: string; report: CostTimingReport | undefined }>) {
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" href="/admin/lab/operations">
          <XIcon className="size-4" /> close
        </Link>
      </div>
      {report === undefined ? (
        <Alert variant="destructive">
          <DatabaseZapIcon />
          <AlertTitle>Report unavailable</AlertTitle>
          <AlertDescription>No timeline data exists for this operation, or the application database is unavailable.</AlertDescription>
        </Alert>
      ) : (
        <CostTimingReportView report={report} />
      )}
    </div>
  );
}

// The at-a-glance cost/tokens/calls chips on a card, next to the wall-clock elapsed chip (R5).
// Rendered only when cost is available; otherwise the card shows elapsed alone (AE6).
function CostChips({ cost }: Readonly<{ cost: OperationCost | null }>) {
  if (!cost) return null;
  return (
    <>
      <Badge variant="outline" className="gap-1"><CoinsIcon className="size-3" /> {formatUsd(cost.costUsd)}</Badge>
      <Badge variant="outline">{cost.tokens.toLocaleString()} tok</Badge>
      <Badge variant="outline">{cost.calls} calls</Badge>
    </>
  );
}

function OperationCard({
  operation,
  cost,
  open,
  costTimingReport,
  journeyReport
}: Readonly<{
  operation: OperationWithStages;
  cost: OperationCost | null;
  // Finished cards render collapsed by default (R6): the header + chips only, no stage table,
  // so the page HTML stays small (AE7). `open` is true for active cards and any card the
  // operator expanded or opened a report on — those server-render their full stage table.
  open: boolean;
  costTimingReport: { report: CostTimingReport | undefined } | null;
  journeyReport: { report: CostTimingReport | undefined } | null;
}>) {
  const { summary, stages } = operation;
  const stale = isStale(summary.status, summary.lastProgressAt);
  const enrichmentId = operationEnrichmentId(summary.operationType, summary.operationId);
  return (
    <Card key={summary.operationRunId}>
      <CardHeader className={open ? "border-b" : undefined}>
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
        <CardAction className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">elapsed {formatDuration(summary.elapsedMs)}</Badge>
          <CostChips cost={cost} />
          <Link
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
            href={{
              pathname: "/admin/lab/operations",
              query: { report: summary.operationId, type: summary.operationType }
            }}
          >
            <GaugeIcon className="size-4" /> cost &amp; timings
          </Link>
          {summary.operationType === "enrichment" ? (
            <Link
              className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
              href={{
                pathname: "/admin/lab/operations",
                query: { journey: summary.operationId }
              }}
            >
              <RouteIcon className="size-4" /> journey
            </Link>
          ) : null}
          {enrichmentId ? (
            <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" href={`/admin/lab/enrichments/${enrichmentId}`}>
              <RouteIcon className="size-4" /> View DAG
            </Link>
          ) : null}
          {open ? null : (
            <Link
              className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
              href={{ pathname: "/admin/lab/operations", query: { expand: summary.operationId } }}
            >
              <ChevronDownIcon className="size-4" /> stage table
            </Link>
          )}
        </CardAction>
      </CardHeader>
      {open ? (
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
                  <Fragment key={`${stage.stage}-${index}`}>
                    <TableRow>
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
                    {stage.errorDetail ? (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-destructive/5">
                          <StageErrorDetailView detail={stage.errorDetail} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
          {costTimingReport ? <InlineReport title="Cost & timings" report={costTimingReport.report} /> : null}
          {journeyReport ? <InlineReport title="Journey cost report" report={journeyReport.report} /> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default async function OperationsPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ report?: string; type?: string; journey?: string; expand?: string }> }>) {
  const { report, type, journey, expand } = await searchParams;
  const operations = await listOperationsWithStages();
  // Report reads stay lazy: each query runs only when its param is present.
  const costTiming = report
    ? { report: await getCostTimingReport(report, isOperationType(type) ? type : undefined) }
    : null;
  const journeyCost = journey ? { report: await getJourneyCostReport(journey) } : null;

  const active = (operations ?? []).filter((operation) => operation.summary.status === "running");
  const finished = (operations ?? []).filter((operation) => operation.summary.status !== "running");
  const stalledCount = active.filter((operation) => isStale(operation.summary.status, operation.summary.lastProgressAt)).length;
  const failedCount = finished.filter((operation) => operation.summary.status === "failed").length;

  // ONE live spend read across every listed operation feeds the cost chips on all cards (KTD4).
  const spend = await preloadOperationSpend((operations ?? []).map((operation) => operation.summary.operationId));

  // A card renders its full stage table only when it is active, explicitly expanded, or the
  // target of an open report — so finished cards collapse to header + chips and the page stays
  // small (R6/AE7).
  const isOpen = (operation: OperationWithStages): boolean => {
    const id = operation.summary.operationId;
    return operation.summary.status === "running" || id === expand || id === report || id === journey;
  };

  const cardFor = (operation: OperationWithStages) => (
    <OperationCard
      key={operation.summary.operationRunId}
      operation={operation}
      cost={operationCost(operation.summary.operationId, operation.summary.operationType, spend)}
      open={isOpen(operation)}
      costTimingReport={operation.summary.operationId === report ? costTiming : null}
      journeyReport={operation.summary.operationId === journey ? journeyCost : null}
    />
  );

  return (
    <AdminShell active="operations">
      <AutoRefresh active={active.length > 0} />
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Operations</CardTitle>
          <CardDescription>
            Live run-stage timeline for extraction, minting, enrichment, and study-item generation — current sub-stage, heartbeat, and per-stage wall-clock.
          </CardDescription>
          <CardAction className="flex flex-wrap items-center gap-2">
            {operations ? (
              <>
                <Badge variant={active.length > 0 ? "secondary" : "outline"}>{active.length} running</Badge>
                <Badge variant={stalledCount > 0 ? "destructive" : "outline"}>{stalledCount} stalled</Badge>
                <Badge variant={failedCount > 0 ? "destructive" : "outline"}>{failedCount} failed</Badge>
              </>
            ) : (
              <Badge variant="destructive">Database unavailable</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <>
              {active.length > 0 ? (
                <section className="flex flex-col gap-4">
                  <h2 className="text-sm font-semibold">Active ({active.length})</h2>
                  {active.map(cardFor)}
                </section>
              ) : null}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Finished ({finished.length})</h2>
                {finished.map(cardFor)}
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
