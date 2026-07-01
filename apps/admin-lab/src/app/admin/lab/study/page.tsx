import Link from "next/link";
import { GitForkIcon, GraduationCapIcon } from "lucide-react";
import { buildTargetCandidates, recommendedTargets } from "@lrnki/application";
import { AdminShell } from "@/components/AdminShell";
import { QuestPicker } from "@/app/admin/lab/study/QuestPicker";
import { StudyStartForm } from "@/app/admin/lab/study/StudyStartForm";
import { getEnrichmentDetail, listEnrichments } from "@/lib/enrichments";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const dynamic = "force-dynamic";

// Study start. The learner picks a target concept for a path-first quest; the enrichment is
// a secondary switcher defaulting to the latest Derived Graph Layer.
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
  const candidates = detail ? buildTargetCandidates(detail) : [];
  const recommended = detail ? recommendedTargets(candidates, detail) : [];
  const targetCandidate = target ? candidates.find((candidate) => candidate.derivedNodeId === target) : undefined;

  return (
    <AdminShell active="study">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <GraduationCapIcon className="size-4" /> Start a quest
            </CardTitle>
            <CardDescription>
              Pick a target concept. Recommended quests favor milestone targets with trusted prerequisite paths;
              search stays available for any concept in the Derived Graph Layer.
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
            {/* Target concept — the primary choice */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">1 · Quest target</CardTitle>
                <CardDescription>Recommended milestones first, with search across every target concept.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <QuestPicker enrichmentId={selectedEnrichmentId!} recommended={recommended} candidates={candidates} currentTarget={target} />
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
                  {targetCandidate?.isFoundational ? (
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
