import Link from "next/link";
import { DatabaseZapIcon, SearchCodeIcon } from "lucide-react";
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
import { listRuns } from "@/lib/inspection";

export const dynamic = "force-dynamic";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

export default async function RunListPage() {
  const runs = await listRuns();
  return (
    <AdminShell active="runs">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Extraction runs</CardTitle>
          <CardDescription>Read-only inspection of concept discovery, admission, and Concept Evidence Profiles.</CardDescription>
          <CardAction>
            <Badge variant={runs ? "outline" : "destructive"}>
              {runs ? `${runs.length} runs` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!runs ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Database unavailable</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">DATABASE_URL</code> to inspect extraction runs.
              </AlertDescription>
            </Alert>
          ) : runs.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><SearchCodeIcon /></EmptyMedia>
                <EmptyTitle>No extraction runs</EmptyTitle>
                <EmptyDescription>No persisted extraction runs are available to inspect.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Core</TableHead>
                  <TableHead>Profiles complete / total</TableHead>
                  <TableHead>Def / mention / assert</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.runId}>
                    <TableCell className="min-w-56 whitespace-normal">
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/lab/runs/${run.runId}`}>
                        {run.sourceTitle}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="outline">{run.declaredDomain}</Badge></TableCell>
                    <TableCell><Badge variant={statusVariant(run.status)}>{run.status}</Badge></TableCell>
                    <TableCell>{run.candidateCount}</TableCell>
                    <TableCell>{run.coreCount}</TableCell>
                    <TableCell>{run.completeProfileCount} / {run.profileCount}</TableCell>
                    <TableCell>{run.definitionCount} / {run.mentionCount} / {run.assertionCount}</TableCell>
                    <TableCell>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{run.startedAt.slice(0, 19).replace("T", " ")}</TableCell>
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
