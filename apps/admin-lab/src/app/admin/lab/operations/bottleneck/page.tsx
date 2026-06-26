import Link from "next/link";
import { DatabaseZapIcon, GaugeIcon } from "lucide-react";
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
import { getBottleneckReport } from "@/lib/operationTimeline";
import { BottleneckReportView } from "../_components/BottleneckReportView";
import type { OperationType } from "@lrnki/ports";

export const dynamic = "force-dynamic";

export default async function BottleneckPage({ searchParams }: { searchParams: Promise<{ operationId?: string; operationType?: string }> }) {
  const { operationId, operationType } = await searchParams;
  const report = operationId
    ? await getBottleneckReport(operationId, isOperationType(operationType) ? operationType : undefined)
    : undefined;

  return (
    <AdminShell active="operations">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Bottleneck report</CardTitle>
          <CardDescription>
            One operation&apos;s wall-clock joined with operation-scoped LiteLLM calls, tokens, and cost.
          </CardDescription>
          <CardAction>
            <Link className="text-sm underline underline-offset-4" href="/admin/lab/operations">← operations</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!operationId ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GaugeIcon /></EmptyMedia>
                <EmptyTitle>No operation selected</EmptyTitle>
                <EmptyDescription>Open an operation to see its per-stage bottleneck breakdown.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : report === undefined ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Operation not found</AlertTitle>
              <AlertDescription>
                No timeline exists for <code className="font-mono">{operationId}</code>, or the application database is unavailable.
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

function isOperationType(value: string | undefined): value is OperationType {
  return value === "extraction" || value === "minting" || value === "enrichment" || value === "study_items";
}
