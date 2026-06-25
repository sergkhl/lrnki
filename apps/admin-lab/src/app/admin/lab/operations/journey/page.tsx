import Link from "next/link";
import { DatabaseZapIcon, RouteIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getJourneyCostReport } from "@/lib/operationTimeline";
import { BottleneckReportView } from "../_components/BottleneckReportView";

export const dynamic = "force-dynamic";

export default async function JourneyCostPage({ searchParams }: { searchParams: Promise<{ enrichmentId?: string }> }) {
  const { enrichmentId } = await searchParams;
  const report = enrichmentId ? await getJourneyCostReport(enrichmentId) : undefined;

  return (
    <AdminShell active="operations">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Journey cost report</CardTitle>
          <CardDescription>
            Extraction, Graph-Version Build, enrichment, and study-item totals for one enrichment lineage.
          </CardDescription>
          <CardAction>
            <Link className="text-sm underline underline-offset-4" href="/admin/lab/operations">← operations</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!enrichmentId ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><RouteIcon /></EmptyMedia>
                <EmptyTitle>No journey selected</EmptyTitle>
                <EmptyDescription>Provide an enrichment id to inspect its whole-pipeline cost.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : report === undefined ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Journey not found</AlertTitle>
              <AlertDescription>
                No lineage and timeline data exists for <code className="font-mono">{enrichmentId}</code>, or the application database is unavailable.
              </AlertDescription>
            </Alert>
          ) : (
            <BottleneckReportView report={report} />
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
