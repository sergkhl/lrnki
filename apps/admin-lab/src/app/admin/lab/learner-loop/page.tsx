import Link from "next/link";
import { GraduationCapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLearnerAdminSummaries } from "@/lib/learnerLoop";

export const dynamic = "force-dynamic";

export default async function LearnerLoopListPage() {
  const registry = await listLearnerAdminSummaries();
  const learners = registry?.learners;
  return (
    <AdminShell active="learner-loop">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Learner registry</CardTitle>
          <CardDescription>
            Registered learners with their downstream recall-loop activity: calibration verdicts in the mutable verdict
            store and option-select responses in the append-only Response Log. Learner state only, never a published graph.
          </CardDescription>
          <CardAction>
            <Badge variant={learners ? "outline" : "destructive"}>
              {registry ? `${registry.stats.registeredLearnerCount} registered` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-4">
          {!learners || learners.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GraduationCapIcon />
                </EmptyMedia>
                <EmptyTitle>No registered learners yet</EmptyTitle>
                <EmptyDescription>
                  Create a learner from <code>/learn</code>, or run <code>worker:kg synthesize-responses</code> to seed the loop.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Registered learners</div>
                  <div className="text-2xl font-semibold tabular-nums">{registry.stats.registeredLearnerCount}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Learners with activity</div>
                  <div className="text-2xl font-semibold tabular-nums">{registry.stats.activeLearnerCount}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Graded responses</div>
                  <div className="text-2xl font-semibold tabular-nums">{registry.stats.gradedResponseCount}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Conflicts</div>
                  <div className="text-2xl font-semibold tabular-nums">{registry.stats.conflictCount}</div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display name</TableHead>
                    <TableHead>Learner ref</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Latest response</TableHead>
                    <TableHead className="text-right">Known verdicts</TableHead>
                    <TableHead className="text-right">Graded responses</TableHead>
                    <TableHead className="text-right">Conflicts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {learners.map((learner) => (
                    <TableRow key={learner.learnerRef}>
                      <TableCell className="font-medium">{learner.displayName}</TableCell>
                      <TableCell>
                        <Link className="font-mono text-xs underline-offset-4 hover:underline" href={`/admin/lab/learner-loop/${encodeURIComponent(learner.learnerRef)}`}>
                          {learner.learnerRef}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <LocalDateTime iso={learner.createdAt} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {learner.latestResponseAt ? <LocalDateTime iso={learner.latestResponseAt} /> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{learner.knownVerdictCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{learner.gradedCount}</TableCell>
                      <TableCell className="text-right">
                        {learner.conflictCount > 0 ? (
                          <Badge variant="destructive">{learner.conflictCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">0</span>
                        )}
                      </TableCell>
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
