import { AlertTriangleIcon } from "lucide-react";
import { resubmitEditedAnswer } from "@/app/admin/lab/learner-loop/actions";
import type { ConceptConflict, LearnerLoopDetail } from "@/lib/learnerLoop";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const CONFLICT_COPY: Record<ConceptConflict["kind"], string> = {
  claimed_known_but_failed: "Claimed known, graded incorrect",
  claimed_unknown_but_passed: "Claimed unknown, graded correct"
};

// Read + review surface for one learner's recall loop (U8). Conflicts are surfaced as
// a deliberate calibration signal (R16); graded answers can be edited and resubmitted,
// appending a new graded row and recomputing the path (learner state only, R15).
export function LearnerLoopReview({ detail }: Readonly<{ detail: LearnerLoopDetail }>) {
  const conflictByConcept = new Map(detail.conflicts.map((conflict) => [conflict.conceptId, conflict] as const));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Learner {detail.learnerStateRef}</CardTitle>
          <CardDescription>
            {detail.responses.length} responses · {detail.conflicts.length} self-report↔graded conflicts ·{" "}
            {detail.paths.length} projected path{detail.paths.length === 1 ? "" : "s"}. Editing an answer appends a new
            graded row and recomputes the path — learner state only, never a published graph.
          </CardDescription>
        </CardHeader>
        {detail.conflicts.length > 0 && (
          <CardContent className="pt-4">
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Calibration conflicts</AlertTitle>
              <AlertDescription>
                {detail.conflicts.map((conflict) => (
                  <span key={conflict.conceptId} className="block">
                    {conflict.conceptId}: {CONFLICT_COPY[conflict.kind]} (self-report {conflict.activeSelfReport} vs graded {conflict.latestGraded})
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {detail.responses.map((response) => {
        const conflict = conflictByConcept.get(response.conceptId);
        return (
          <Card key={response.responseId}>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                #{response.attemptSeq} {response.conceptLabel}
                <Badge variant="outline">{response.signalType}</Badge>
                <Badge variant="outline">{response.responseSource}</Badge>
                {response.signalType === "self_report" && response.selfReportRating && (
                  <Badge variant="secondary">{response.selfReportRating}</Badge>
                )}
                {response.signalType === "graded" && response.judgedOutcome && (
                  <Badge variant={response.judgedOutcome === "incorrect" ? "destructive" : "secondary"}>
                    {response.judgedOutcome}
                    {response.gradedScore !== null ? ` (${response.gradedScore.toFixed(2)})` : ""}
                  </Badge>
                )}
                {conflict && <Badge variant="destructive">conflict</Badge>}
              </CardTitle>
              <CardDescription>{response.question}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="text-sm">
                <span className="font-medium">Answer key:</span> {response.answerKey}
              </div>
              {response.signalType === "graded" && (
                <>
                  <Separator />
                  <form action={resubmitEditedAnswer} className="flex flex-col gap-2">
                    <input type="hidden" name="learnerStateRef" value={detail.learnerStateRef} />
                    <input type="hidden" name="cardId" value={response.cardId} />
                    <label className="text-sm font-medium" htmlFor={`answer-${response.responseId}`}>
                      Edit &amp; resubmit answer (grades anew, appends a row)
                    </label>
                    <Textarea
                      id={`answer-${response.responseId}`}
                      name="editedAnswer"
                      defaultValue={response.submittedAnswer ?? ""}
                      rows={3}
                    />
                    <Button type="submit" size="sm" className="self-start">
                      Resubmit &amp; recompute
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
