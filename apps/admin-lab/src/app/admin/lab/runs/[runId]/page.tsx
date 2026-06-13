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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { getRunInspection } from "@/lib/inspection";

export const dynamic = "force-dynamic";

function tierVariant(tier: string): "default" | "secondary" | "destructive" | "outline" {
  if (tier === "core") return "default";
  if (tier === "reject") return "destructive";
  if (tier === "quarantine") return "secondary";
  return "outline";
}

function CriterionBadge({ label, passed }: { label: string; passed: boolean }) {
  return <Badge variant={passed ? "default" : "outline"}>{label}: {passed ? "pass" : "fail"}</Badge>;
}

export default async function RunInspectorPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const inspection = await getRunInspection(runId);
  if (!inspection) {
    return (
      <AdminShell active="runs">
        <Empty className="min-h-[28rem] border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
            <EmptyTitle>Run not found</EmptyTitle>
            <EmptyDescription>No extraction run exists for <code className="font-mono">{runId}</code>.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className="text-sm font-medium underline underline-offset-4" href="/admin/lab/runs">Back to runs</Link>
          </EmptyContent>
        </Empty>
      </AdminShell>
    );
  }

  const { run, candidates, claims, proposals } = inspection;
  return (
    <AdminShell active="runs">
      <div className="flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink render={<Link href="/admin/lab/runs" />}>Runs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{run.sourceTitle}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{run.sourceTitle}</CardTitle>
            <CardDescription className="font-mono">{run.runId}</CardDescription>
            <CardAction className="flex flex-wrap gap-2">
              <Badge variant="outline">{run.declaredDomain}</Badge>
              <Badge variant={run.status === "failed" ? "destructive" : "default"}>{run.status}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Pipeline config</dt><dd className="break-all font-mono text-xs">{inspection.pipelineConfigHash}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Latency</dt><dd>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Candidates</dt><dd>{run.candidateCount} total / {run.coreCount} core</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Claims and proposals</dt><dd>{run.verifiedClaimCount} verified / {run.rejectedClaimCount} rejected / {run.proposalCount} proposals</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Candidates and admission decisions</CardTitle>
            <CardDescription>Model candidates with the application boundary&apos;s admission outcome.</CardDescription>
            <CardAction><Badge variant="outline">{candidates.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Decision</TableHead><TableHead>Labels</TableHead><TableHead>Eligibility</TableHead><TableHead>Criterion evidence</TableHead><TableHead>Reason codes</TableHead><TableHead>Confidence</TableHead></TableRow></TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.candidateKey}>
                    <TableCell>
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant={tierVariant(candidate.tier)}>{candidate.tier}</Badge>
                        {candidate.modelTier !== candidate.tier ? <Badge variant="secondary">model: {candidate.modelTier}</Badge> : null}
                        <Badge variant={candidate.coreSelected ? "default" : "outline"}>core set: {candidate.coreSelected ? "selected" : "not selected"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{candidate.canonicalLabel}</span>
                        {candidate.discoveredLabel !== candidate.canonicalLabel ? <span className="text-muted-foreground">Discovered: {candidate.discoveredLabel}</span> : null}
                        {candidate.proposedCanonicalLabel !== candidate.canonicalLabel ? <span className="text-muted-foreground">Proposed: {candidate.proposedCanonicalLabel}</span> : null}
                        <span className="text-muted-foreground">{candidate.mentionCount} mentions; aliases: {candidate.aliases.join(", ") || "none"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-80 whitespace-normal">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                          <CriterionBadge label="Standalone" passed={candidate.standaloneLearningObjective.passed} />
                          <CriterionBadge label="Domain meaning" passed={candidate.establishedDomainMeaning.passed} />
                          <CriterionBadge label="Organizing power" passed={candidate.organizingPower.passed} />
                        </div>
                        <span className="text-muted-foreground">
                          Verified evidence: {candidate.standaloneLearningObjective.evidence.length}/{candidate.standaloneLearningObjective.submittedEvidence.length} standalone,{" "}
                          {candidate.establishedDomainMeaning.evidence.length}/{candidate.establishedDomainMeaning.submittedEvidence.length} domain meaning,{" "}
                          {candidate.organizingPower.aspects.length}/{candidate.organizingPower.submittedAspects.length} organizing aspects
                        </span>
                        <p className="text-muted-foreground">{candidate.standaloneLearningObjective.rationale || "No standalone-objective rationale."}</p>
                        <p className="text-muted-foreground">{candidate.establishedDomainMeaning.rationale || "No domain-meaning rationale."}</p>
                        <p className="text-muted-foreground">{candidate.organizingPower.rationale || "No organizing-power rationale."}</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-96 whitespace-normal">
                      <div className="flex flex-col gap-3">
                        {candidate.standaloneLearningObjective.evidence.map((evidence, index) => (
                          <blockquote key={`standalone-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                            Standalone [{evidence.blockId}]: &ldquo;{evidence.evidenceQuote}&rdquo;
                          </blockquote>
                        ))}
                        {candidate.establishedDomainMeaning.evidence.map((evidence, index) => (
                          <blockquote key={`meaning-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                            Domain meaning [{evidence.blockId}]: &ldquo;{evidence.evidenceQuote}&rdquo;
                          </blockquote>
                        ))}
                        {candidate.organizingPower.aspects.map((aspect, index) => (
                          <blockquote key={`aspect-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                            {aspect.nature}: {aspect.summary} [{aspect.evidence.blockId}]: &ldquo;{aspect.evidence.evidenceQuote}&rdquo;
                          </blockquote>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>{candidate.reasonCodes.join(", ") || "—"}</span>
                        <span className="text-muted-foreground">Core selection: {candidate.selectionReasonCode}</span>
                        {candidate.boundaryReasonCodes.length > 0 ? <span className="text-muted-foreground">Boundary: {candidate.boundaryReasonCodes.join(", ")}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>{candidate.confidence.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Claims</CardTitle>
            <CardDescription>Validation outcomes with exact source evidence retained for inspection.</CardDescription>
            <CardAction><Badge variant="outline">{claims.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Outcome</TableHead><TableHead>Attempt</TableHead><TableHead>Subject</TableHead><TableHead>Relation</TableHead><TableHead>Object</TableHead><TableHead>Confidence</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
              <TableBody>
                {claims.map((claim, index) => (
                  <TableRow key={`${claim.subjectLabel}-${claim.predicate}-${index}`}>
                    <TableCell>
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant={claim.validationOutcome === "rejected" ? "destructive" : "default"}>{claim.validationOutcome}</Badge>
                        {claim.boundaryReasonCodes.map((reason) => <Badge key={reason} variant="outline">{reason}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{claim.extractionAttempt}</Badge></TableCell>
                    <TableCell className="font-medium">{claim.subjectLabel}</TableCell>
                    <TableCell><Badge variant="outline">{claim.predicate}</Badge></TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{claim.objectLabel}</TableCell>
                    <TableCell>{claim.modelConfidence.toFixed(2)}</TableCell>
                    <TableCell className="min-w-80 whitespace-normal">
                      {claim.evidenceQuotes.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {claim.evidenceQuotes.map((quote, quoteIndex) => (
                            <blockquote key={quoteIndex} className="border-l-2 pl-3 text-sm text-muted-foreground">&ldquo;{quote}&rdquo;</blockquote>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No verifiable quote</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Missing-concept proposals</CardTitle>
            <CardDescription>Run-scoped proposals remain outside the published core graph.</CardDescription>
            <CardAction><Badge variant="outline">{proposals.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {proposals.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Attempt</TableHead><TableHead>Proposed label</TableHead><TableHead>Rationale</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
                <TableBody>
                  {proposals.map((proposal, index) => (
                    <TableRow key={`${proposal.proposedLabel}-${index}`}>
                      <TableCell><Badge variant="secondary">{proposal.extractionAttempt}</Badge></TableCell>
                      <TableCell className="font-medium">{proposal.proposedLabel}</TableCell>
                      <TableCell className="max-w-xl whitespace-normal">{proposal.rationale}</TableCell>
                      <TableCell className="max-w-xl whitespace-normal text-muted-foreground">{proposal.evidenceQuote ? `“${proposal.evidenceQuote}”` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <>
                <Separator />
                <Empty className="min-h-40">
                  <EmptyHeader>
                    <EmptyTitle>No missing-concept proposals</EmptyTitle>
                    <EmptyDescription>This run did not produce any proposals.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
