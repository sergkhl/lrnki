import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CompassIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { buttonVariants } from "@/components/ui/button";
import { getEnrichmentDetail } from "@/lib/enrichments";

export const dynamic = "force-dynamic";

// The learner surface is its own app now (ADR-0035): the door is a plain link into the
// Expo universal app's web build, which owns session and expedition state. The default is
// the local Expo web dev server; set LEARNER_WEB_URL to link elsewhere (e.g. the Pages site).
function learnerWebExpeditionUrl(enrichmentId: string): string {
  const base = process.env.LEARNER_WEB_URL ?? "http://localhost:8081";
  return `${base.replace(/\/$/, "")}/expedition/${encodeURIComponent(enrichmentId)}`;
}

export default async function EnrichmentDetailPage({
  params
}: Readonly<{ params: Promise<{ enrichmentId: string }> }>) {
  const { enrichmentId } = await params;
  const detail = await getEnrichmentDetail(enrichmentId);
  if (!detail) notFound();
  return (
    <AdminShell active="enrichments">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/enrichments">
          <ArrowLeftIcon data-icon="inline-start" />
          All enrichment runs
        </Link>
        <a
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={learnerWebExpeditionUrl(enrichmentId)}
          target="_blank"
          rel="noreferrer"
        >
          <CompassIcon data-icon="inline-start" />
          Open Learner App
        </a>
      </div>
      <DerivedGraphExplorer detail={detail} />
    </AdminShell>
  );
}
