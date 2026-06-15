import Link from "next/link";
import { DatabaseZapIcon, GitForkIcon } from "lucide-react";
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
import { listEnrichments } from "@/lib/enrichments";

export const dynamic = "force-dynamic";

export default async function EnrichmentListPage() {
  const enrichments = await listEnrichments();
  return (
    <AdminShell active="enrichments">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Enrichment runs</CardTitle>
          <CardDescription>
            Read-only inspection of each immutable Derived Graph Layer (ADR-0019): the inferred
            prerequisite DAG over a published version. Computed by the CLI; never in the UI. The
            asserted layer it enriches has zero edges.
          </CardDescription>
          <CardAction>
            <Badge variant={enrichments ? "outline" : "destructive"}>
              {enrichments ? `${enrichments.length} enrichments` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!enrichments ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Database unavailable</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">DATABASE_URL</code> to inspect enrichment runs.
              </AlertDescription>
            </Alert>
          ) : enrichments.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GitForkIcon /></EmptyMedia>
                <EmptyTitle>No enrichment runs</EmptyTitle>
                <EmptyDescription>
                  Run <code className="font-mono">worker:kg enrich-graph-version &lt;graphVersionId&gt;</code> to derive a prerequisite DAG.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enrichment</TableHead>
                  <TableHead>Published version</TableHead>
                  <TableHead>Concepts</TableHead>
                  <TableHead>Edges (certain / uncertain)</TableHead>
                  <TableHead>Judge</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichments.map((enrichment) => (
                  <TableRow key={enrichment.enrichmentId}>
                    <TableCell className="min-w-56 whitespace-normal">
                      <Link className="font-mono text-xs underline-offset-4 hover:underline" href={`/admin/lab/enrichments/${enrichment.enrichmentId}`}>
                        {enrichment.enrichmentId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{enrichment.graphVersionId}</TableCell>
                    <TableCell>{enrichment.conceptCount}</TableCell>
                    <TableCell>{enrichment.certainEdgeCount} / {enrichment.uncertainEdgeCount}</TableCell>
                    <TableCell><Badge variant="secondary">{enrichment.judgeModel}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{enrichment.startedAt.slice(0, 19).replace("T", " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
