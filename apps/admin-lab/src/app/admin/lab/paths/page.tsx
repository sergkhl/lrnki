import Link from "next/link";
import { DatabaseZapIcon, RouteIcon } from "lucide-react";
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
import { listLearnerPaths } from "@/lib/learnerPaths";

export const dynamic = "force-dynamic";

export default async function LearnerPathListPage() {
  const paths = await listLearnerPaths();
  return (
    <AdminShell active="paths">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Learner paths</CardTitle>
          <CardDescription>
            Read-only projection output: difficulty-ordered prerequisite chains over a published
            graph&apos;s inferred prerequisite DAG (ADR-0019). Computed by the CLI; never in the UI.
          </CardDescription>
          <CardAction>
            <Badge variant={paths ? "outline" : "destructive"}>
              {paths ? `${paths.length} paths` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!paths ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Database unavailable</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">DATABASE_URL</code> to inspect learner paths.
              </AlertDescription>
            </Alert>
          ) : paths.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><RouteIcon /></EmptyMedia>
                <EmptyTitle>No learner paths</EmptyTitle>
                <EmptyDescription>
                  Run <code className="font-mono">worker:kg enrich-graph-version</code> then{" "}
                  <code className="font-mono">worker:kg compute-learner-path &lt;enrichmentId&gt; &lt;target&gt;</code>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target concept</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Learner state</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paths.map((path) => (
                  <TableRow key={path.learnerPathId}>
                    <TableCell className="min-w-56 whitespace-normal">
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/lab/paths/${path.learnerPathId}`}>
                        {path.targetLabel}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="outline">{path.declaredDomain}</Badge></TableCell>
                    <TableCell>{path.stepCount}</TableCell>
                    <TableCell><Badge variant="secondary">{path.learnerStateRef}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{path.createdAt.slice(0, 19).replace("T", " ")}</TableCell>
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
