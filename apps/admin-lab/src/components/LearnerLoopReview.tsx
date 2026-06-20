import { AlertTriangleIcon } from "lucide-react";
import { resubmitEditedAnswer } from "@/app/admin/lab/learner-loop/actions";
import type { ConceptConflict, LearnerLoopDetail } from "@/lib/learnerLoop";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const CONFLICT_COPY: Record<ConceptConflict["kind"], string> = {
  claimed_known_but_failed: "Claimed known, graded incorrect",
  claimed_unknown_but_passed: "Claimed unknown, graded correct"
};

const PROVENANCE_LABEL: Record<"source_cep" | "source_mentioned" | "generated", string> = {
  source_cep: "CEP",
  source_mentioned: "source-mention",
  generated: "generated"
};

// Read + review surface for one learner's recall loop (U8). Conflicts are surfaced as
// a deliberate calibration signal (R16); graded answers can be edited and resubmitted,
// appending a new graded row and recomputing the path (learner state only, R15).
export function LearnerLoopReview({ detail }: Readonly<{ detail: LearnerLoopDetail }>) {
  const conflictByNode = new Map(detail.conflicts.map((conflict) => [conflict.derivedNodeId, conflict] as const));
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
                  <span key={conflict.derivedNodeId} className="block">
                    {conflict.derivedNodeId}: {CONFLICT_COPY[conflict.kind]} (self-report {conflict.activeSelfReport} vs graded {conflict.latestGraded})
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {detail.coverage.map((path) => (
        <Card key={`${path.enrichmentId}:${path.targetDerivedNodeId}`}>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Path card coverage: {path.targetLabel}</CardTitle>
            <CardDescription>
              Every stored path step is shown with its recall-testability. Generated badges cite generated grounding, not source quotes.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Step</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Grounding</TableHead>
                  <TableHead>Card status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {path.steps.map((step) => (
                  <TableRow key={`${path.enrichmentId}:${step.derivedNodeId}`}>
                    <TableCell className="tabular-nums">{step.position + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{step.label}</span>
                        <span className="text-muted-foreground text-xs">{step.includedReason}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{step.groundingOrigin}</Badge>
                    </TableCell>
                    <TableCell>
                      {step.card ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={step.card.provenance === "generated" ? "secondary" : "outline"}>
                            {PROVENANCE_LABEL[step.card.provenance]}
                          </Badge>
                          <span className="text-muted-foreground text-xs">{step.card.question}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{step.fallbackReason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {detail.responses.map((response) => {
        const conflict = conflictByNode.get(response.derivedNodeId);
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
                </div>
              </div>
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
