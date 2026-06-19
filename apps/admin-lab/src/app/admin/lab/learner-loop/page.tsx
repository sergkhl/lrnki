import Link from "next/link";
import { GraduationCapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLearnerStates } from "@/lib/learnerLoop";

export const dynamic = "force-dynamic";

export default async function LearnerLoopListPage() {
  const learners = await listLearnerStates();
  return (
    <AdminShell active="learner-loop">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Learner loop</CardTitle>
          <CardDescription>
            The downstream recall loop over the published graph: synthetic self-report and graded responses in the
            append-only Response Log. Review, edit, and resubmit answers — learner state only, never a published graph.
          </CardDescription>
          <CardAction>
            <Badge variant={learners ? "outline" : "destructive"}>
              {learners ? `${learners.length} learners` : "Database unavailable"}
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
                <EmptyTitle>No learner responses yet</EmptyTitle>
                <EmptyDescription>
                  Run <code>worker:kg synthesize-responses</code> to seed the loop, then refresh.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead className="text-right">Self-report</TableHead>
                  <TableHead className="text-right">Graded</TableHead>
                  <TableHead className="text-right">Conflicts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learners.map((learner) => (
                  <TableRow key={learner.learnerStateRef}>
                    <TableCell>
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/lab/learner-loop/${encodeURIComponent(learner.learnerStateRef)}`}>
                        {learner.learnerStateRef}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{learner.selfReportCount}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
