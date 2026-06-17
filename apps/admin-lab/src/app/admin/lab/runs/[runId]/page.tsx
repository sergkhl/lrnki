import Link from "next/link";
import { FileQuestionIcon } from "lucide-react";
import { CORE_DEMOTED_UNGROUNDABLE_REASON } from "@lrnki/domain-core";
import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

function severityVariant(severity: string): "destructive" | "secondary" | "outline" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
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

  const { run, candidates, qualityIssues, profiles } = inspection;
  const profilesByKey = new Map(profiles.map((profile) => [profile.candidateKey, profile] as const));
  const demotedCandidates = candidates.filter((candidate) => candidate.boundaryReasonCodes.includes(CORE_DEMOTED_UNGROUNDABLE_REASON));

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
              {run.degraded ? <Badge variant="destructive">degraded</Badge> : null}
              {/* An incomplete core is demoted to optional, not failed (see Demoted cores below);
                  a non-succeeded run signals a pipeline or persistence failure (ADR-0017), and
                  publication refuses it, so mark it explicitly not publishable. */}
              {run.status !== "succeeded" ? <Badge variant="destructive">not publishable</Badge> : null}
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Pipeline config</dt><dd className="break-all font-mono text-xs">{inspection.pipelineConfigHash}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Latency</dt><dd>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Candidates</dt><dd>{run.candidateCount} total / {run.coreCount} core</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Evidence profiles</dt><dd>{run.completeProfileCount} complete / {run.profileCount} total · {run.definitionCount} def / {run.mentionCount} mention / {run.assertionCount} assert</dd></div>
            </dl>
          </CardContent>
        </Card>

        {run.degraded ? (
          <Alert variant="destructive">
            <AlertTitle>Degraded run</AlertTitle>
            <AlertDescription>
              This run succeeded, but all model-selected cores were demoted because none could be grounded with a verbatim Definition Passage.
            </AlertDescription>
          </Alert>
        ) : null}

        {demotedCandidates.length > 0 ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Demoted cores</CardTitle>
              <CardDescription>
                Core Concepts that could not be grounded with a verbatim Definition Passage were demoted to optional.
              </CardDescription>
              <CardAction><Badge variant={run.degraded ? "destructive" : "secondary"}>{demotedCandidates.length}</Badge></CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Table>
                <TableHeader><TableRow><TableHead>Concept</TableHead><TableHead>Admission definition evidence</TableHead><TableHead>CEP definition</TableHead><TableHead>Outcome</TableHead></TableRow></TableHeader>
                <TableBody>
                  {demotedCandidates.map((candidate) => {
                    const profile = profilesByKey.get(candidate.candidateKey);
                    return (
                      <TableRow key={candidate.candidateKey}>
                        <TableCell className="max-w-72 whitespace-normal">
                          <div className="flex flex-col items-start gap-2">
                            <span className="font-medium">{candidate.canonicalLabel}</span>
                            <span className="font-mono text-xs text-muted-foreground">{candidate.candidateKey}</span>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">model: {candidate.modelTier}</Badge>
                              <Badge variant="outline">now: {candidate.tier}</Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-96 whitespace-normal">
                          {candidate.definitionBearingTreatment.evidence.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {candidate.definitionBearingTreatment.evidence.map((evidence, index) => (
                                <blockquote key={index} className="border-l-2 pl-3 text-sm text-muted-foreground">
                                  [{evidence.blockId}] &ldquo;{evidence.evidenceQuote}&rdquo;
                                </blockquote>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-80 whitespace-normal">
                          {profile?.definitions.length ? (
                            <div className="flex flex-col gap-2">
                              {profile.definitions.map((passage, index) => (
                                <blockquote key={index} className="border-l-2 pl-3 text-sm text-muted-foreground">
                                  &ldquo;{passage.evidenceQuote}&rdquo;
                                </blockquote>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="destructive">no verbatim definition</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-96 whitespace-normal text-muted-foreground">
                          The candidate remains inspectable as optional evidence; it will not publish as a core Concept.
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Quality issues</CardTitle>
            <CardDescription>Run-scoped inspection notes from the extraction artifact.</CardDescription>
            <CardAction><Badge variant="outline">{qualityIssues.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {qualityIssues.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Severity</TableHead><TableHead>Stage</TableHead><TableHead>Issue</TableHead><TableHead>Subject</TableHead><TableHead>Rationale</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
                <TableBody>
                  {qualityIssues.map((issue, index) => (
                    <TableRow key={`${issue.issueType}-${issue.candidateKey ?? index}`}>
                      <TableCell><Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{issue.stage}</TableCell>
                      <TableCell className="font-mono text-xs">{issue.issueType}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{issue.conceptLabel ?? "Run"}</span>
                          {issue.candidateKey ? <span className="font-mono text-xs text-muted-foreground">{issue.candidateKey}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-96 whitespace-normal text-muted-foreground">{issue.rationale}</TableCell>
                      <TableCell className="min-w-80 whitespace-normal">
                        {issue.evidenceQuotes.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {issue.evidenceQuotes.map((quote, quoteIndex) => (
                              <blockquote key={quoteIndex} className="border-l-2 pl-3 text-xs text-muted-foreground">&ldquo;{quote}&rdquo;</blockquote>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <span className="text-sm text-muted-foreground">No quality issues recorded for this run.</span>
            )}
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
                          <CriterionBadge label="Definition-bearing" passed={candidate.definitionBearingTreatment.passed} />
                          <CriterionBadge label="Organizing power" passed={candidate.organizingPower.passed} />
                        </div>
                        <span className="text-muted-foreground">
                          Verified evidence: {candidate.standaloneLearningObjective.evidence.length}/{candidate.standaloneLearningObjective.submittedEvidence.length} standalone,{" "}
                          {candidate.establishedDomainMeaning.evidence.length}/{candidate.establishedDomainMeaning.submittedEvidence.length} domain meaning,{" "}
                          {candidate.definitionBearingTreatment.evidence.length}/{candidate.definitionBearingTreatment.submittedEvidence.length} definition-bearing,{" "}
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
                        {candidate.definitionBearingTreatment.evidence.map((evidence, index) => (
                          <blockquote key={`definition-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                            Definition-bearing [{evidence.blockId}]: &ldquo;{evidence.evidenceQuote}&rdquo;
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
            <CardTitle>Concept Evidence Profiles</CardTitle>
            <CardDescription>One CEP per admitted Concept (ADR-0007 reset): a verified definition, salience-ordered mentions, and guarded optional assertions — all verbatim, all source-grounded.</CardDescription>
            <CardAction><Badge variant="outline">{profiles.length}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {profiles.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Concept</TableHead><TableHead>Completeness</TableHead><TableHead>Definitions</TableHead><TableHead>Mentions (salience order)</TableHead><TableHead>Optional assertions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.candidateKey}>
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="flex flex-col items-start gap-2">
                          <span className="font-medium">{profile.conceptLabel}</span>
                          <Badge variant={tierVariant(profile.tier)}>{profile.tier}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={profile.complete ? "default" : "destructive"}>{profile.complete ? "complete" : "no definition"}</Badge>
                      </TableCell>
                      <TableCell className="min-w-80 whitespace-normal">
                        {profile.definitions.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {profile.definitions.map((passage, index) => (
                              <blockquote key={`def-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                                &ldquo;{passage.evidenceQuote}&rdquo;
                                <span className="mt-1 block font-mono text-[0.7rem]">{passage.headingPath.join(" / ") || "(root)"}</span>
                              </blockquote>
                            ))}
                          </div>
                        ) : (
                          <span className="text-destructive">No definition passage</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-80 whitespace-normal">
                        {profile.mentions.length > 0 ? (
                          <ol className="flex flex-col gap-2">
                            {profile.mentions.map((passage, index) => (
                              <li key={`mention-${index}`} className="border-l-2 pl-3 text-sm text-muted-foreground">
                                <span className="font-mono text-[0.7rem]">#{passage.salienceRank}</span> &ldquo;{passage.evidenceQuote}&rdquo;
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-72 whitespace-normal">
                        {profile.assertions.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {profile.assertions.map((assertion, index) => (
                              <div key={`assert-${index}`} className="flex flex-col gap-1">
                                <span><Badge variant="outline">{assertion.assertionType}</Badge> <span className="font-medium">{assertion.target}</span></span>
                                {assertion.evidenceQuotes.map((quote, quoteIndex) => (
                                  <blockquote key={quoteIndex} className="border-l-2 pl-3 text-xs text-muted-foreground">&ldquo;{quote}&rdquo;</blockquote>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <>
                <Separator />
                <Empty className="min-h-40">
                  <EmptyHeader>
                    <EmptyTitle>No evidence profiles</EmptyTitle>
                    <EmptyDescription>This run admitted no Concepts, so it produced no Concept Evidence Profiles.</EmptyDescription>
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
