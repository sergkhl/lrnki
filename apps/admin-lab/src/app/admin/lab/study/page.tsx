import Link from "next/link";
import { GitForkIcon, GraduationCapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { GoalPicker } from "@/app/admin/lab/study/GoalPicker";
import { StudyStartForm } from "@/app/admin/lab/study/StudyStartForm";
import { getEnrichmentDetail, listEnrichments } from "@/lib/enrichments";
import { goalCandidates, isFoundationalGoal, journeySize } from "@/lib/derivedGraph";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const dynamic = "force-dynamic";

// Study start (U4, R1/R2/R3). GOAL-FIRST: the learner searches a goal concept (label or
// alias) within an enrichment, sees each goal's journey size (prerequisite-cone count,
// larger first), and a DAG-root goal is tagged "foundational — studied directly" yet stays
// selectable. The enrichment is a SECONDARY switcher defaulting to the latest. The
// mechanism is domain-general; the demo anchors on real curated graphs.
export default async function StudyStartPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ enrichmentId?: string; target?: string }> }>) {
  const { enrichmentId, target } = await searchParams;
  const enrichments = await listEnrichments();
  // Default to the latest enrichment (listEnrichments returns started_at DESC) — the
  // enrichment is no longer the first thing the learner picks (R1).
  const selectedEnrichmentId = enrichmentId ?? enrichments?.[0]?.enrichmentId;
  const detail = selectedEnrichmentId ? await getEnrichmentDetail(selectedEnrichmentId) : undefined;
  const targetNode = detail && target ? detail.nodes.find((node) => node.derivedNodeId === target) : undefined;
  const candidates = detail ? goalCandidates(detail) : [];
  const targetJourney = targetNode && detail ? journeySize(targetNode.derivedNodeId, detail.edges) : 0;

  return (
    <AdminShell active="study">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <GraduationCapIcon className="size-4" /> Study a goal
            </CardTitle>
            <CardDescription>
              Pick a goal concept first — search by name or alias. Each goal shows its journey size (how many
              prerequisites it builds on); larger journeys come first. A foundational goal with no prerequisites is
              studied directly. You calibrate what you already know on the goal&apos;s graph in the next screen.
            </CardDescription>
          </CardHeader>
        </Card>

        {!enrichments || enrichments.length === 0 || !detail ? (
          <Card>
            <CardContent className="pt-4">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><GitForkIcon /></EmptyMedia>
                  <EmptyTitle>No enrichments</EmptyTitle>
                  <EmptyDescription>Run the enrichment pipeline (and seed study items) first, then refresh.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Goal — the primary choice */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">1 · Goal concept</CardTitle>
                <CardDescription>&ldquo;Teach me Z&rdquo; — search and pick the concept to reach.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <GoalPicker enrichmentId={selectedEnrichmentId!} candidates={candidates} currentTarget={target} />
              </CardContent>
            </Card>

            {/* Enrichment — a secondary switcher (defaults to latest) */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Graph</CardTitle>
                <CardDescription>Which Derived Graph Layer to search within (defaults to the latest).</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="flex flex-col gap-1">
                  {enrichments.map((enrichment) => (
                    <li key={enrichment.enrichmentId}>
                      <Link
                        href={`/admin/lab/study?enrichmentId=${encodeURIComponent(enrichment.enrichmentId)}`}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 ${enrichment.enrichmentId === selectedEnrichmentId ? "border-primary" : ""} ${enrichment.studyItemCount === 0 ? "opacity-60" : ""}`}
                      >
                        <span className="min-w-0 truncate font-medium">{enrichment.enrichmentId}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Badge variant="outline">{enrichment.conceptCount} concepts</Badge>
                          <Badge variant="secondary">{enrichment.certainEdgeCount} edges</Badge>
                          {enrichment.studyItemCount === 0 ? (
                            <Badge variant="destructive">no study items</Badge>
                          ) : (
                            <Badge variant="default">{enrichment.studyItemCount} study items</Badge>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Learner + launch */}
            {targetNode && selectedEnrichmentId ? (
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">2 · Learner</CardTitle>
                  <CardDescription>Mocked identity — no auth.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-4">
                  {isFoundationalGoal({ journeySize: targetJourney }) ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">{targetNode.label}</span> is foundational — it has no prerequisites,
                      so you&apos;ll study it directly.
                    </p>
                  ) : null}
                  <StudyStartForm enrichmentId={selectedEnrichmentId} targetDerivedNodeId={targetNode.derivedNodeId} targetLabel={targetNode.label} />
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
