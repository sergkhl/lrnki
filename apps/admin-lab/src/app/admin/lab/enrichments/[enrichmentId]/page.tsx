import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { buttonVariants } from "@/components/ui/button";
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
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/enrichments">
          <ArrowLeftIcon data-icon="inline-start" />
          All enrichment runs
        </Link>
      </div>
      <DerivedGraphExplorer detail={detail} />
    </AdminShell>
  );
}
