import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CompassIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { getEnrichmentDetail } from "@/lib/enrichments";
import { openAdminLearnerExpedition } from "../actions";

export const dynamic = "force-dynamic";

export default async function EnrichmentDetailPage({
  params,
  searchParams
}: Readonly<{ params: Promise<{ enrichmentId: string }>; searchParams: Promise<{ learnDoor?: string }> }>) {
  const { enrichmentId } = await params;
  const { learnDoor } = await searchParams;
  const detail = await getEnrichmentDetail(enrichmentId);
  if (!detail) notFound();
  return (
    <AdminShell active="enrichments">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/enrichments">
          <ArrowLeftIcon data-icon="inline-start" />
          All enrichment runs
        </Link>
        <form action={async () => {
          "use server";
          await openAdminLearnerExpedition(enrichmentId);
        }}>
          <Button type="submit" size="sm" variant="outline">
            <CompassIcon data-icon="inline-start" />
            Open Learn App
          </Button>
        </form>
      </div>
      {learnDoor === "no-target" ? (
        <Alert className="mb-4">
          <AlertTitle>No playable expedition</AlertTitle>
          <AlertDescription>This enrichment does not have a target with ready study items.</AlertDescription>
        </Alert>
      ) : null}
      <DerivedGraphExplorer detail={detail} />
    </AdminShell>
  );
}
