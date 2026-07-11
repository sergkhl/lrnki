"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
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
import { LocalDateTime } from "@/components/LocalDateTime";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  initialExpandedOperationIds,
  journeyCost,
  operationCost,
  sortOperationSteps,
  type JourneySortDir,
  type JourneySortKey,
  type JourneyWindow,
  type OperationCost,
  type OperationSpend,
  type OperationStepSortDir,
  type OperationStepSortKey
} from "./operationJourneyView";

type OperationsPayload = {
  journeys: OperationJourney[];
  ungrouped: OperationTimelineDetail[];
};

type JourneySortParams = {
  sort: JourneySortKey;
  dir: JourneySortDir;
  limit: number;
};

export function OperationsTimelineView({
  operationJourneys,
  spend,
  window,
  sortParams,
  runningCount,
  failedCount,
  stalledCount
}: Readonly<{
  operationJourneys: OperationsPayload | null;
  spend: OperationSpend;
  window: JourneyWindow | null;
  sortParams: JourneySortParams;
  runningCount: number;
  failedCount: number;
  stalledCount: number;
}>) {
  const [expandedOperationRunIds, setExpandedOperationRunIds] = useState<Set<string>>(
    () => new Set(operationJourneys ? initialExpandedOperationIds(operationJourneys) : [])
  );

  function setOperationOpen(operationRunId: string, open: boolean) {
    setExpandedOperationRunIds((current) => {
      const next = new Set(current);
      if (open) {
        next.add(operationRunId);
      } else {
        next.delete(operationRunId);
      }
      return next;
    });
  }

  return (
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
            <EmptyMedia variant="icon"><DatabaseZapIcon /></EmptyMedia>
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
            {spend.costAvailable ? (
              <SortLink label="cost" sort="cost" currentSort={sortParams.sort} currentDir={sortParams.dir} limit={sortParams.limit} />
            ) : (
              <Badge variant="outline">cost unavailable</Badge>
            )}
          </div>

          {window && window.active.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold">Active journeys ({window.active.length})</h2>
              {window.active.map((journey) => (
                <JourneyCard
                  key={journey.enrichmentId}
                  journey={journey}
                  spend={spend}
                  expandedOperationRunIds={expandedOperationRunIds}
                  onOperationOpenChange={setOperationOpen}
                />
              ))}
            </section>
          ) : null}

          {window && window.finished.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Finished journeys</h2>
              {window.finished.map((journey) => (
                <JourneyCard
                  key={journey.enrichmentId}
                  journey={journey}
                  spend={spend}
                  expandedOperationRunIds={expandedOperationRunIds}
                  onOperationOpenChange={setOperationOpen}
                />
              ))}
              {window.hiddenFinishedCount > 0 ? (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={{
                    pathname: "/admin/lab/operations",
                    query: { sort: sortParams.sort, dir: sortParams.dir, limit: sortParams.limit + 10 }
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
                  expandedOperationRunIds={expandedOperationRunIds}
                  onOperationOpenChange={setOperationOpen}
                />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

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

function CostChips({ cost }: Readonly<{ cost: OperationCost | null }>) {
  if (!cost) return null;
  return (
    <>
      {/* "≈ … est." marks a figure with a usage-derived component (OpenRouter BYOK
          reports provider-billed cost 0.0); never presented as billed spend. */}
      <Badge variant="outline" className="gap-1"><CoinsIcon data-icon="inline-start" /> {cost.estimated ? `≈${formatUsd(cost.costUsd)} est.` : formatUsd(cost.costUsd)}</Badge>
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
          {detail.model ? <> {" / "} model <span className="font-mono">{detail.model}</span></> : null}
          {detail.attempts ? <> {" / "} {detail.attempts.length} attempt(s)</> : null}
        </p>
      ) : null}
      {detail.attempts?.map((attempt) => (
        <div key={attempt.attempt} className="rounded-md border border-dashed px-2 py-1">
          <p>
            attempt {attempt.attempt + 1}: <span className="font-mono">{attempt.kind}</span>
            {attempt.status !== undefined ? <> {" / "} HTTP {attempt.status}</> : null}
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

function JourneyCard({
  journey,
  spend,
  expandedOperationRunIds,
  onOperationOpenChange
}: Readonly<{
  journey: OperationJourney;
  spend: OperationSpend;
  expandedOperationRunIds: ReadonlySet<string>;
  onOperationOpenChange: (operationRunId: string, open: boolean) => void;
}>) {
  const [stepSort, setStepSort] = useState<{ sort: OperationStepSortKey; dir: OperationStepSortDir }>({
    sort: "lineage",
    dir: "asc"
  });
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
          {journey.members.length} step(s) / started <LocalDateTime iso={journey.startedAt} />
        </CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">{formatDuration(journey.elapsedMs)}</Badge>
          <CostChips cost={total} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <OperationStepsTable
          operations={journey.members}
          spend={spend}
          sortState={stepSort}
          onSortChange={setStepSort}
          expandedOperationRunIds={expandedOperationRunIds}
          onOperationOpenChange={onOperationOpenChange}
        />
      </CardContent>
    </Card>
  );
}

function UngroupedOperationCard({
  operation,
  spend,
  expandedOperationRunIds,
  onOperationOpenChange
}: Readonly<{
  operation: OperationTimelineDetail;
  spend: OperationSpend;
  expandedOperationRunIds: ReadonlySet<string>;
  onOperationOpenChange: (operationRunId: string, open: boolean) => void;
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
        <OperationStepsTable
          operations={[operation]}
          spend={spend}
          sortState={{ sort: "lineage", dir: "asc" }}
          onSortChange={() => undefined}
          expandedOperationRunIds={expandedOperationRunIds}
          onOperationOpenChange={onOperationOpenChange}
        />
      </CardContent>
    </Card>
  );
}

function OperationStepsTable({
  operations,
  spend,
  sortState,
  onSortChange,
  expandedOperationRunIds,
  onOperationOpenChange
}: Readonly<{
  operations: OperationTimelineDetail[];
  spend: OperationSpend;
  sortState: { sort: OperationStepSortKey; dir: OperationStepSortDir };
  onSortChange: (state: { sort: OperationStepSortKey; dir: OperationStepSortDir }) => void;
  expandedOperationRunIds: ReadonlySet<string>;
  onOperationOpenChange: (operationRunId: string, open: boolean) => void;
}>) {
  const sortedOperations = sortOperationSteps(operations, spend, sortState);
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"><span className="sr-only">Stages</span></TableHead>
            <SortableStepHead label="Operation" sortKey="operation" state={sortState} onChange={onSortChange} />
            <SortableStepHead label="Status" sortKey="status" state={sortState} onChange={onSortChange} />
            <SortableStepHead label="Started" sortKey="started" state={sortState} onChange={onSortChange} />
            <SortableStepHead label="Duration" sortKey="duration" state={sortState} onChange={onSortChange} />
            <SortableStepHead label="Calls" sortKey="calls" state={sortState} onChange={onSortChange} disabled={!spend.costAvailable} />
            <SortableStepHead label="Tokens" sortKey="tokens" state={sortState} onChange={onSortChange} disabled={!spend.costAvailable} />
            <SortableStepHead label="Cost" sortKey="cost" state={sortState} onChange={onSortChange} disabled={!spend.costAvailable} />
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOperations.map((operation) => {
            const open = expandedOperationRunIds.has(operation.summary.operationRunId);
            return (
              <Fragment key={operation.summary.operationRunId}>
                <OperationStepRow
                  operation={operation}
                  spend={spend}
                  open={open}
                  onOpenChange={(nextOpen) => onOperationOpenChange(operation.summary.operationRunId, nextOpen)}
                />
                {open ? (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/30 p-0">
                      <Collapsible open={open}>
                        <CollapsibleContent>
                          <StageTable operation={operation} spend={spend} />
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function OperationStepRow({
  operation,
  spend,
  open,
  onOpenChange
}: Readonly<{
  operation: OperationTimelineDetail;
  spend: OperationSpend;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { summary } = operation;
  const cost = operationCost(summary.operationId, summary.operationType, spend);
  const stale = isStale(summary.status, summary.lastProgressAt);
  return (
    <TableRow aria-expanded={open}>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${open ? "Hide" : "Show"} stages for ${summary.operationType}`}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-fit">{summary.operationType}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{shortId(summary.operationId)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant={statusVariant(summary.status)}>{summary.status}</Badge>
          {summary.status === "running" && summary.currentStage ? <Badge variant="secondary">{summary.currentStage}</Badge> : null}
          {stale ? <Badge variant="destructive">stalled?</Badge> : null}
          {summary.progressTotal !== null ? <Badge variant="outline">{summary.progressDone ?? 0} / {summary.progressTotal}</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs"><LocalDateTime iso={summary.startedAt} /></TableCell>
      <TableCell>{formatDuration(summary.elapsedMs)}</TableCell>
      <TableCell>{cost ? cost.calls.toLocaleString() : "-"}</TableCell>
      <TableCell>{cost ? cost.tokens.toLocaleString() : "-"}</TableCell>
      <TableCell>{cost ? (cost.estimated ? `≈${formatUsd(cost.costUsd)} est.` : formatUsd(cost.costUsd)) : "-"}</TableCell>
      <TableCell className="text-right">
        {summary.operationType === "enrichment" || summary.operationType === "study_items" ? (
          <Link
            className={buttonVariants({ variant: "ghost", size: "xs" })}
            href={`/admin/lab/enrichments/${summary.operationId}`}
          >
            <ExternalLinkIcon data-icon="inline-start" /> DAG
          </Link>
        ) : null}
      </TableCell>
    </TableRow>
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
    <div className="p-3">
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
                      <TableCell>{row.costUsd === null ? "-" : row.costEstimated ? `≈${formatUsd(row.costUsd)} est.` : formatUsd(row.costUsd)}</TableCell>
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

function SortableStepHead({
  label,
  sortKey,
  state,
  onChange,
  disabled = false
}: Readonly<{
  label: string;
  sortKey: OperationStepSortKey;
  state: { sort: OperationStepSortKey; dir: OperationStepSortDir };
  onChange: (state: { sort: OperationStepSortKey; dir: OperationStepSortDir }) => void;
  disabled?: boolean;
}>) {
  const active = state.sort === sortKey;
  const nextDir: OperationStepSortDir = active && state.dir === "desc" ? "asc" : "desc";
  const Icon = !active ? ChevronsUpDownIcon : state.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead>
      <Button
        type="button"
        variant={active ? "secondary" : "ghost"}
        size="xs"
        disabled={disabled}
        aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : "none"}
        onClick={() => onChange({ sort: sortKey, dir: nextDir })}
      >
        {label}
        <Icon data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}
