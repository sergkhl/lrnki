import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import type { ConceptConflict, LearnerLoopDetail, ResponseSourceSummary } from "@/lib/learnerLoop";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CONFLICT_COPY: Record<ConceptConflict["kind"], string> = {
  claimed_known_but_failed: "Verdict known, graded incorrect",
  claimed_unknown_but_passed: "Verdict learn, graded correct"
};

function sourceBadgeCopy(summary: ResponseSourceSummary): string {
  if (summary.total === 0) return "no responses";
  if (summary.synthetic > 0 && summary.human === 0 && summary.synthetic === summary.total) return "synthetic learner data";
  if (summary.human > 0 && summary.synthetic === 0 && summary.human === summary.total) return "human learner data";
  if (summary.synthetic > 0 || summary.human > 0) return `${summary.synthetic} synthetic · ${summary.human} human`;
  return `${summary.total} responses`;
}

// Read + review surface for one learner's recall loop (U8). Conflicts are surfaced as
// a deliberate calibration signal (R16); graded rows are option-select outcomes.
export function LearnerLoopReview({ detail }: Readonly<{ detail: LearnerLoopDetail }>) {
  const conflictByNode = new Map(detail.conflicts.map((conflict) => [conflict.derivedNodeId, conflict] as const));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Learner {detail.learnerStateRef}</CardTitle>
          <CardDescription>
            {detail.responses.length} graded responses · {detail.conflicts.length} calibration↔graded conflicts ·{" "}
            {sourceBadgeCopy(detail.responseSourceSummary)}. Learner state only, never a published graph.
          </CardDescription>
          <div className="flex justify-end">
            <Badge variant={detail.responseSourceSummary.synthetic > 0 ? "secondary" : "outline"}>
              {sourceBadgeCopy(detail.responseSourceSummary)}
            </Badge>
          </div>
        </CardHeader>
        {detail.conflicts.length > 0 && (
          <CardContent className="pt-4">
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Calibration conflicts</AlertTitle>
              <AlertDescription>
                {detail.conflicts.map((conflict) => (
                  <span key={conflict.derivedNodeId} className="block">
                    {conflict.derivedNodeId}: {CONFLICT_COPY[conflict.kind]} (verdict {conflict.verdict} vs graded {conflict.latestGraded})
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {detail.responses.map((response) => {
        // A calibration conflict is a NEUTRAL-node concept; scaffold responses have no node.
        const conflict = response.derivedNodeId ? conflictByNode.get(response.derivedNodeId) : undefined;
        return (
          <Card key={response.responseId}>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-2">
                <CardTitle className="text-base">{response.nodeLabel}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <Badge variant="outline">#{response.attemptSeq}</Badge>
                  <Badge variant="outline">{response.signalType}</Badge>
                  <Badge variant="outline">{response.responseSource}</Badge>
                  <LocalDateTime iso={response.createdAt} />
                  {response.signalType === "graded" && response.judgedOutcome && (
                    <Badge variant={response.judgedOutcome === "incorrect" ? "destructive" : "secondary"}>
                      {response.judgedOutcome}
                      {response.gradedScore !== null ? ` (${response.gradedScore.toFixed(2)})` : ""}
                    </Badge>
                  )}
                  {conflict && <Badge variant="destructive">conflict</Badge>}
                </div>
              </div>
              <CardDescription>{response.question}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">Auto-graded option-select response.</div>
                <Link className="text-sm underline underline-offset-4" href={`/admin/lab/enrichments/${response.enrichmentId}`}>
                  View DAG
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
