import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { Button } from "@/components/ui/button";
import { getEnrichmentDetail } from "@/lib/enrichments";

export const dynamic = "force-dynamic";

export default async function EnrichmentDetailPage({
  params
}: Readonly<{ params: Promise<{ enrichmentId: string }> }>) {
  const { enrichmentId } = await params;
  const detail = await getEnrichmentDetail(enrichmentId);
  if (!detail) notFound();
  return (
    <AdminShell active="enrichments">
      <div className="mb-4">
        <Button variant="ghost" size="sm" render={<Link href="/admin/lab/enrichments" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          All enrichment runs
        </Button>
      </div>
      <DerivedGraphExplorer detail={detail} />
    </AdminShell>
  );
}
