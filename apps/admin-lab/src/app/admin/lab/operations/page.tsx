import { Fragment } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  ChevronDownIcon,
  CoinsIcon,
  DatabaseZapIcon,
  ExternalLinkIcon
} from "lucide-react";
import {
  isStaleOperation,
  mergeOperationStageRows,
  type OperationJourney
} from "@lrnki/application";
import type { OperationTimelineDetail, StageErrorDetail } from "@lrnki/ports";
import { AdminShell } from "@/components/AdminShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { listOperationJourneys, preloadOperationSpend } from "@/lib/operationTimeline";
import {
  journeyCost,
  operationCost,
  operationIdsForSpend,
  parseJourneySortParams,
  windowJourneys,
  type JourneySortDir,
  type JourneySortKey,
  type OperationCost,
  type OperationSpend
} from "./operationJourneyView";

// Live operator progress view (ADR-0027/ADR-0029): one card per Processing Journey,
// grouped read-only from lineage, with per-step stage timelines and live LiteLLM spend.
export const dynamic = "force-dynamic";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

function journeyTitle(journey: OperationJourney): string {
  return journey.display.title?.trim() || shortId(journey.enrichmentId);
}

function isStale(status: string, lastProgressAt: string | null): boolean {
  return isStaleOperation(status, lastProgressAt);
}

function operationIsOpen(operation: OperationTimelineDetail, expand: string | undefined): boolean {
  return operation.summary.status === "running" || operation.summary.operationId === expand;
}

function CostChips({ cost }: Readonly<{ cost: OperationCost | null }>) {
  if (!cost) return null;
  return (
    <>
      <Badge variant="outline" className="gap-1"><CoinsIcon data-icon="inline-start" /> {formatUsd(cost.costUsd)}</Badge>
      <Badge variant="outline">{cost.tokens.toLocaleString()} tok</Badge>
      <Badge variant="outline">{cost.calls} calls</Badge>
    </>
  );
}

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
        <div key={attempt.attempt} className="rounded-md border border-dashed px-2 py-1">
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
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-1.5 font-mono text-[11px]">
              {attempt.redactedSnippet}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function OperationStepRows({
  operations,
  spend,
  expand
}: Readonly<{
  operations: OperationTimelineDetail[];
  spend: OperationSpend;
  expand?: string;
}>) {
  return (
    <div className="rounded-md border">
        {operations.map((operation) => (
          <div key={operation.summary.operationRunId} className="border-b last:border-b-0">
            <OperationStepRow operation={operation} spend={spend} open={operationIsOpen(operation, expand)} />
            {operationIsOpen(operation, expand) ? <StageTable operation={operation} spend={spend} /> : null}
          </div>
        ))}
    </div>
  );
}

function OperationStepRow({
  operation,
  spend,
  open
}: Readonly<{
  operation: OperationTimelineDetail;
  spend: OperationSpend;
  open: boolean;
}>) {
  const { summary } = operation;
  const cost = operationCost(summary.operationId, summary.operationType, spend);
  const stale = isStale(summary.status, summary.lastProgressAt);
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <Badge variant="outline">{summary.operationType}</Badge>
      <span className="font-mono text-xs text-muted-foreground">{shortId(summary.operationId)}</span>
      <Badge variant={statusVariant(summary.status)}>{summary.status}</Badge>
      {summary.status === "running" && summary.currentStage ? <Badge variant="secondary">{summary.currentStage}</Badge> : null}
      {stale ? <Badge variant="destructive">stalled?</Badge> : null}
      {summary.progressTotal !== null ? <span>{summary.progressDone ?? 0} / {summary.progressTotal}</span> : null}
      <span>{formatDuration(summary.elapsedMs)}</span>
      {cost ? (
        <>
          <span>{cost.calls.toLocaleString()} calls</span>
          <span>{cost.tokens.toLocaleString()} tok</span>
          <span>{formatUsd(cost.costUsd)}</span>
        </>
      ) : null}
      <span className="flex-1" />
      {summary.operationType === "enrichment" || summary.operationType === "study_items" ? (
        <Link
          className={buttonVariants({ variant: "ghost", size: "xs" })}
          href={`/admin/lab/enrichments/${summary.operationId}`}
        >
          <ExternalLinkIcon data-icon="inline-start" /> DAG
        </Link>
      ) : null}
        {open ? (
          <Badge variant="outline">stages</Badge>
        ) : (
          <Link
            className={buttonVariants({ variant: "ghost", size: "xs" })}
            href={{ pathname: "/admin/lab/operations", query: { expand: summary.operationId } }}
          >
            <ChevronDownIcon data-icon="inline-start" /> stages
          </Link>
        )}
    </div>
  );
}

function StageTable({
  operation,
  spend
}: Readonly<{
  operation: OperationTimelineDetail;
  spend: OperationSpend;
}>) {
  const rows = mergeOperationStageRows(operation, spend.costAvailable ? spend.rows : null).stages;
  const timelineByStage = new Map(operation.stages.map((stage) => [stage.stage, stage]));
  return (
    <div className="bg-muted/30 p-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stage rows yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>started <LocalDateTime iso={operation.summary.startedAt} /></span>
              <span>last progress {operation.summary.lastProgressAt ? <LocalDateTime iso={operation.summary.lastProgressAt} /> : "-"}</span>
              <span>{operation.summary.completedAt ? <>completed <LocalDateTime iso={operation.summary.completedAt} /></> : "in flight"}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Wall</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const timeline = timelineByStage.get(row.stage);
                  return (
                    <Fragment key={row.stage}>
                      <TableRow>
                        <TableCell className="font-medium">{row.stage}</TableCell>
                        <TableCell>
                          {!timeline ? "-" : timeline.endedAt === null ? (
                            <Badge variant="secondary">running</Badge>
                          ) : (
                            <Badge variant={timeline.ok ? "default" : "destructive"}>{timeline.ok ? "ok" : "failed"}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{timeline?.progressTotal !== null && timeline?.progressTotal !== undefined ? `${timeline.progressDone ?? 0} / ${timeline.progressTotal}` : "-"}</TableCell>
                        <TableCell>{formatDuration(row.wallClockMs)}</TableCell>
                        <TableCell>{row.calls === null ? "-" : row.calls.toLocaleString()}</TableCell>
                        <TableCell>{row.tokens === null ? "-" : row.tokens.toLocaleString()}</TableCell>
                        <TableCell>{row.costUsd === null ? "-" : formatUsd(row.costUsd)}</TableCell>
                      </TableRow>
                      {timeline?.errorDetail ? (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-destructive/5">
                            <StageErrorDetailView detail={timeline.errorDetail} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
}

function JourneyCard({
  journey,
  spend,
  expand
}: Readonly<{
  journey: OperationJourney;
  spend: OperationSpend;
  expand?: string;
}>) {
  const total = journeyCost(journey, spend);
  const stale = journey.members.some((member) => isStale(member.summary.status, member.summary.lastProgressAt));
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="break-words">{journeyTitle(journey)}</span>
          <Badge variant="outline">{journey.display.kind}</Badge>
          <Badge variant={statusVariant(journey.status)}>{journey.status}</Badge>
          {stale ? <Badge variant="destructive">stalled?</Badge> : null}
        </CardTitle>
        <CardDescription>
          {journey.members.length} step(s) · started <LocalDateTime iso={journey.startedAt} />
        </CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">{formatDuration(journey.elapsedMs)}</Badge>
          <CostChips cost={total} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <OperationStepRows operations={journey.members} spend={spend} expand={expand} />
      </CardContent>
    </Card>
  );
}

function UngroupedOperationCard({
  operation,
  spend,
  expand
}: Readonly<{
  operation: OperationTimelineDetail;
  spend: OperationSpend;
  expand?: string;
}>) {
  const { summary } = operation;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{summary.operationId}</span>
          <Badge variant="outline">{summary.operationType}</Badge>
          <Badge variant={statusVariant(summary.status)}>{summary.status}</Badge>
        </CardTitle>
        <CardDescription>Ungrouped operation timeline</CardDescription>
        <CardAction>
          <Badge variant="outline">{formatDuration(summary.elapsedMs)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <OperationStepRows operations={[operation]} spend={spend} expand={expand} />
      </CardContent>
    </Card>
  );
}

function SortLink({
  label,
  sort,
  currentSort,
  currentDir,
  limit
}: Readonly<{
  label: string;
  sort: JourneySortKey;
  currentSort: JourneySortKey;
  currentDir: JourneySortDir;
  limit: number;
}>) {
  const active = sort === currentSort;
  const nextDir: JourneySortDir = active && currentDir === "desc" ? "asc" : "desc";
  return (
    <Link
      className={buttonVariants({ variant: active ? "secondary" : "outline", size: "sm" })}
      href={{ pathname: "/admin/lab/operations", query: { sort, dir: nextDir, limit } }}
    >
      {label}
    </Link>
  );
}

export default async function OperationsPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ sort?: string; dir?: string; limit?: string; expand?: string }> }>) {
  const params = await searchParams;
  const sortParams = parseJourneySortParams(params);
  const operationJourneys = await listOperationJourneys();
  const spend = operationJourneys
    ? await preloadOperationSpend(operationIdsForSpend(operationJourneys.journeys, operationJourneys.ungrouped))
    : { rows: [], costAvailable: false };

  const window = operationJourneys ? windowJourneys(operationJourneys.journeys, spend, sortParams) : null;
  const runningCount = operationJourneys
    ? operationJourneys.journeys.filter((journey) => journey.status === "running").length +
      operationJourneys.ungrouped.filter((operation) => operation.summary.status === "running").length
    : 0;
  const failedCount = operationJourneys
    ? operationJourneys.journeys.filter((journey) => journey.status === "failed").length +
      operationJourneys.ungrouped.filter((operation) => operation.summary.status === "failed").length
    : 0;
  const stalledCount = operationJourneys
    ? [
        ...operationJourneys.journeys.flatMap((journey) => journey.members),
        ...operationJourneys.ungrouped
      ].filter((operation) => isStale(operation.summary.status, operation.summary.lastProgressAt)).length
    : 0;

  return (
    <AdminShell active="operations">
      <AutoRefresh active={runningCount > 0} />
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-normal">Operations</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Processing Journey timelines for extraction, graph-version build, Graph Enrichment, and Study Item Bank generation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {operationJourneys ? (
              <>
                <Badge variant={runningCount > 0 ? "secondary" : "outline"}>{runningCount} running</Badge>
                <Badge variant={stalledCount > 0 ? "destructive" : "outline"}>{stalledCount} stalled</Badge>
                <Badge variant={failedCount > 0 ? "destructive" : "outline"}>{failedCount} failed</Badge>
              </>
            ) : (
              <Badge variant="destructive">Database unavailable</Badge>
            )}
          </div>
        </header>

        {!operationJourneys ? (
          <Alert variant="destructive">
            <DatabaseZapIcon />
            <AlertTitle>Database unavailable</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono">DATABASE_URL</code> to inspect operation timelines.
            </AlertDescription>
          </Alert>
        ) : operationJourneys.journeys.length === 0 && operationJourneys.ungrouped.length === 0 ? (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ActivityIcon /></EmptyMedia>
              <EmptyTitle>No operations</EmptyTitle>
              <EmptyDescription>No triggered operations have reported a timeline yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort</span>
              <SortLink label="started" sort="started" currentSort={sortParams.sort} currentDir={sortParams.dir} limit={sortParams.limit} />
              <SortLink label="duration" sort="duration" currentSort={sortParams.sort} currentDir={sortParams.dir} limit={sortParams.limit} />
              <SortLink label="cost" sort="cost" currentSort={sortParams.sort} currentDir={sortParams.dir} limit={sortParams.limit} />
              {!spend.costAvailable ? <Badge variant="outline">cost unavailable</Badge> : null}
            </div>

            {window && window.active.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold">Active journeys ({window.active.length})</h2>
                {window.active.map((journey) => (
                  <JourneyCard key={journey.enrichmentId} journey={journey} spend={spend} expand={params.expand} />
                ))}
              </section>
            ) : null}

            {window && window.finished.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Finished journeys</h2>
                {window.finished.map((journey) => (
                  <JourneyCard key={journey.enrichmentId} journey={journey} spend={spend} expand={params.expand} />
                ))}
                {window.hiddenFinishedCount > 0 ? (
                  <Link
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={{
                      pathname: "/admin/lab/operations",
                      query: { sort: sortParams.sort, dir: sortParams.dir, limit: sortParams.limit + 20 }
                    }}
                  >
                    Show older ({window.hiddenFinishedCount} finished journeys hidden)
                  </Link>
                ) : null}
              </section>
            ) : null}

            {operationJourneys.ungrouped.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Ungrouped operations ({operationJourneys.ungrouped.length})</h2>
                {operationJourneys.ungrouped.map((operation) => (
                  <UngroupedOperationCard
                    key={operation.summary.operationRunId}
                    operation={operation}
                    spend={spend}
                    expand={params.expand}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
