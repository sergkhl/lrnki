import Link from "next/link";
import { GitForkIcon, GraduationCapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { StudyStartForm } from "@/app/admin/lab/study/StudyStartForm";
import { getEnrichmentDetail, listEnrichments } from "@/lib/enrichments";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const dynamic = "force-dynamic";

// Study start (U5, R1). Three server-rendered steps via query params: pick an enrichment,
// pick a goal node Z within it, then name a learner and launch. The mechanism is
// domain-general; the demo anchors on the clean single-domain Rust ownership DAG (U7).
export default async function StudyStartPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ enrichmentId?: string; target?: string }> }>) {
  const { enrichmentId, target } = await searchParams;
  const enrichments = await listEnrichments();
  const detail = enrichmentId ? await getEnrichmentDetail(enrichmentId) : undefined;
  const targetNode = detail && target ? detail.nodes.find((node) => node.derivedNodeId === target) : undefined;

  return (
    <AdminShell active="study">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <GraduationCapIcon className="size-4" /> Study a goal
            </CardTitle>
            <CardDescription>
              Pick an enrichment and a goal node, declare what you already know (optional), then study only the gap. A
              calibrated learner skips ahead through a different slice of the graph than one who knows nothing.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Step 1 — enrichment */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">1 · Enrichment</CardTitle>
            <CardDescription>The Derived Graph Layer to study within.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {!enrichments || enrichments.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><GitForkIcon /></EmptyMedia>
                  <EmptyTitle>No enrichments</EmptyTitle>
                  <EmptyDescription>Run the enrichment pipeline (and seed cards) first, then refresh.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {enrichments.map((enrichment) => (
                  <li key={enrichment.enrichmentId}>
                    <Link
                      href={`/admin/lab/study?enrichmentId=${encodeURIComponent(enrichment.enrichmentId)}`}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 ${enrichment.enrichmentId === enrichmentId ? "border-primary" : ""}`}
                    >
                      <span className="min-w-0 truncate font-medium">{enrichment.enrichmentId}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline">{enrichment.conceptCount} concepts</Badge>
                        <Badge variant="secondary">{enrichment.certainEdgeCount} edges</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — goal node */}
        {detail ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">2 · Goal node</CardTitle>
              <CardDescription>&ldquo;Teach me Z&rdquo; — the node to reach.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
                {detail.nodes.map((node) => (
                  <li key={node.derivedNodeId}>
                    <Link
                      href={`/admin/lab/study?enrichmentId=${encodeURIComponent(enrichmentId!)}&target=${encodeURIComponent(node.derivedNodeId)}`}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 ${node.derivedNodeId === target ? "border-primary" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{node.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{node.declaredDomain}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge variant={node.nodeKind === "anchor" ? "default" : "secondary"}>{node.nodeKind}</Badge>
                        {node.hasCard ? null : <Badge variant="outline">no card</Badge>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Step 3 — learner + launch */}
        {targetNode && enrichmentId ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">3 · Learner</CardTitle>
              <CardDescription>Mocked identity — no auth.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <StudyStartForm enrichmentId={enrichmentId} targetDerivedNodeId={targetNode.derivedNodeId} targetLabel={targetNode.label} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
