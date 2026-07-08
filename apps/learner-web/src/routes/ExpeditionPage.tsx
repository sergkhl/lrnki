import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckpointPath } from "@/components/learn/CheckpointPath";
import { QuestHeader } from "@/components/learn/QuestHeader";
import { buildTrailView } from "@/components/learn/trailView";
import { expeditionQuery } from "@/lib/queries";

// The expedition trail screen. Data comes prefetched/cached by Query before the sheet
// opens (R6): the whole study session is one read, so the activity loop never spins.
export function ExpeditionPage() {
  const { enrichmentId } = useParams({ from: "/expedition/$enrichmentId" });
  const expedition = useQuery(expeditionQuery(enrichmentId));

  if (expedition.isPending) return null;
  if (!expedition.data) {
    return (
      <section className="flex min-h-[calc(100svh-2rem)] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">This expedition is not available.</p>
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Expeditions
        </Button>
      </section>
    );
  }

  const { session, expedition: row } = expedition.data;
  const trail = buildTrailView(session);

  return (
    <div className="-m-4 flex h-dvh flex-col overflow-hidden bg-background">
      <nav className="shrink-0 border-b border-border bg-card px-4 py-2">
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Expeditions
        </Button>
      </nav>
      <QuestHeader session={session} trail={trail} expeditionTitle={row?.title ?? null} />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CheckpointPath view={trail} session={session} />
      </main>
    </div>
  );
}
