import Link from "next/link";
import { FileQuestionIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { LocalDateTime } from "@/components/LocalDateTime";
import { getSourceInspection } from "@/lib/inspection";

function runStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

export const dynamic = "force-dynamic";

export default async function SourceExplorerPage({ params }: { params: Promise<{ sourceResourceId: string }> }) {
  const { sourceResourceId } = await params;
  const inspection = await getSourceInspection(sourceResourceId);
  if (!inspection) {
    return (
      <AdminShell active="sources">
        <Empty className="min-h-[28rem] border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
            <EmptyTitle>Source not found</EmptyTitle>
            <EmptyDescription>No registered source exists for <code className="font-mono">{sourceResourceId}</code>.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className="text-sm font-medium underline underline-offset-4" href="/admin/lab/sources">Back to sources</Link>
          </EmptyContent>
        </Empty>
      </AdminShell>
    );
  }

  const { source, blocks } = inspection;
  return (
    <AdminShell active="sources">
      <div className="flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink render={<Link href="/admin/lab/sources" />}>Sources</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{source.title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{source.title}</CardTitle>
            <CardDescription className="font-mono">{source.sourceResourceId}</CardDescription>
            <CardAction className="flex flex-wrap gap-2">
              <Badge variant="outline">{source.declaredDomain}</Badge>
              <Badge variant="secondary">{source.contentType}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Content hash</dt><dd className="break-all font-mono text-xs">{source.contentHash}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Parser</dt><dd>{inspection.parserName} {inspection.parserVersion}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Parsed blocks</dt><dd>{source.blockCount}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Extraction runs</dt><dd>{source.runCount}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Extraction runs</CardTitle>
            <CardDescription>Concept discovery, admission, and Concept Evidence Profiles extracted from this source.</CardDescription>
            <CardAction><Badge variant="outline">{inspection.runs.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {inspection.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No extraction runs for this source yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Status</TableHead><TableHead>Latency</TableHead><TableHead>Started</TableHead></TableRow></TableHeader>
                <TableBody>
                  {inspection.runs.map((run) => (
                    <TableRow key={run.runId}>
                      <TableCell className="font-mono text-xs">
                        <Link className="underline-offset-4 hover:underline" href={`/admin/lab/runs/${run.runId}`}>{run.runId}</Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                          {run.degraded ? <Badge variant="destructive">degraded</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs"><LocalDateTime iso={run.startedAt} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Parsed blocks</CardTitle>
            <CardDescription>Stable block identities and text used to verify claim evidence.</CardDescription>
            <CardAction><Badge variant="outline">{blocks.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Block</TableHead><TableHead>Type</TableHead><TableHead>Heading path</TableHead><TableHead>Text</TableHead></TableRow></TableHeader>
              <TableBody>
                {blocks.map((block) => (
                  <TableRow key={block.blockId}>
                    <TableCell className="font-mono text-xs">{block.blockId}</TableCell>
                    <TableCell><Badge variant="outline">{block.blockType}</Badge></TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{block.headingPath.join(" / ") || "—"}</TableCell>
                    <TableCell className="min-w-96 max-w-4xl whitespace-normal text-muted-foreground">{block.text}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
