import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckpointPath } from "@/components/learn/CheckpointPath";
import { QuestHeader } from "@/components/learn/QuestHeader";
import { buildTrailView } from "@/components/learn/trailView";
import { getLearnerStudySession } from "@/lib/learnerStudySession";

export default async function ExpeditionPage({
  params
}: Readonly<{ params: Promise<{ learnerStateRef: string; enrichmentId: string }> }>) {
  const { learnerStateRef: encodedLearnerStateRef, enrichmentId } = await params;
  const learnerStateRef = decodeURIComponent(encodedLearnerStateRef);
  // The summit is derived inside the projection (ADR-0032); the page needs only the enrichment.
  const session = await getLearnerStudySession(enrichmentId, learnerStateRef);
  if (!session) notFound();
  const trail = buildTrailView(session);

  return (
    <div className="-m-4 flex h-dvh flex-col overflow-hidden bg-[color:var(--journal-background)]">
      <nav className="shrink-0 border-b border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] px-4 py-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/learn/${encodeURIComponent(learnerStateRef)}` as Route} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Expeditions
        </Button>
      </nav>
      <QuestHeader session={session} trail={trail} />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CheckpointPath view={trail} session={session} />
      </main>
    </div>
  );
}
