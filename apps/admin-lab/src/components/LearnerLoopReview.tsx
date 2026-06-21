import { AlertTriangleIcon } from "lucide-react";
import { resubmitEditedAnswer } from "@/app/admin/lab/learner-loop/actions";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import type { ConceptConflict, LearnerAdaptedGraphs, LearnerLoopDetail, ResponseSourceSummary } from "@/lib/learnerLoop";
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

function sourceBadgeCopy(summary: ResponseSourceSummary): string {
  if (summary.total === 0) return "no responses";
  if (summary.synthetic > 0 && summary.human === 0 && summary.synthetic === summary.total) return "synthetic learner data";
  if (summary.human > 0 && summary.synthetic === 0 && summary.human === summary.total) return "human learner data";
  if (summary.synthetic > 0 || summary.human > 0) return `${summary.synthetic} synthetic · ${summary.human} human`;
  return `${summary.total} responses`;
}

// Read + review surface for one learner's recall loop (U8). Conflicts are surfaced as
// a deliberate calibration signal (R16); graded answers can be edited and resubmitted,
// appending a new graded row and recomputing the path (learner state only, R15).
export function LearnerLoopReview({ detail, adaptedGraphs }: Readonly<{ detail: LearnerLoopDetail; adaptedGraphs: LearnerAdaptedGraphs }>) {
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

      <section className="flex flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Adapted graph view</CardTitle>
            <CardDescription>
              One neutral and learner-adapted graph pair per distinct enrichment in this learner&apos;s paths.
            </CardDescription>
            <div className="flex justify-end">
              <Badge variant={adaptedGraphs.responseSourceSummary.synthetic > 0 ? "secondary" : "outline"}>
                {sourceBadgeCopy(adaptedGraphs.responseSourceSummary)}
              </Badge>
            </div>
          </CardHeader>
        </Card>
        {adaptedGraphs.graphs.length > 0 ? (
          adaptedGraphs.graphs.map((graph) => (
            <Card key={graph.enrichmentId}>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Enrichment {graph.enrichmentId}</CardTitle>
                <CardDescription>
                  Target: {graph.targetLabel} · frontier target: {graph.classification.selectedFrontierTarget ?? "none"}
                </CardDescription>
                <div className="flex justify-end">
                  <Badge variant="outline">{graph.detail.summary.conceptCount} concepts</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
                  <div className="min-w-0">
                    <DerivedGraphExplorer detail={graph.detail} />
                  </div>
                  <div className="min-w-0">
                    <DerivedGraphExplorer detail={graph.detail} adapted={graph.classification} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Alert>
            <AlertTriangleIcon />
            <AlertTitle>No adapted graph scope</AlertTitle>
            <AlertDescription>
              This learner has no stored path enrichment to render. Responses, conflicts, and card coverage are still shown below.
            </AlertDescription>
          </Alert>
        )}
      </section>

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
