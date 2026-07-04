import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";
import { PostgresLearnerExpeditionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { Button } from "@/components/ui/button";
import { CheckpointPath } from "@/components/learn/CheckpointPath";
import { QuestHeader } from "@/components/learn/QuestHeader";
import { buildTrailView } from "@/components/learn/trailView";
import { getLearnerStudySession } from "@/lib/learnerStudySession";

async function getTargetForExpedition(learnerStateRef: string, enrichmentId: string): Promise<string | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    const expedition = await new PostgresLearnerExpeditionStore(sql).getByEnrichment({ learnerStateRef, enrichmentId });
    return expedition?.targetDerivedNodeId ?? undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function ExpeditionPage({
  params
}: Readonly<{ params: Promise<{ learnerStateRef: string; enrichmentId: string }> }>) {
  const { learnerStateRef: encodedLearnerStateRef, enrichmentId } = await params;
  const learnerStateRef = decodeURIComponent(encodedLearnerStateRef);
  const targetDerivedNodeId = await getTargetForExpedition(learnerStateRef, enrichmentId);
  if (!targetDerivedNodeId) notFound();
  const session = await getLearnerStudySession(enrichmentId, targetDerivedNodeId, learnerStateRef);
  if (!session) notFound();
  const trail = buildTrailView(session);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/learn/${encodeURIComponent(learnerStateRef)}` as Route} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Expeditions
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/learn/${encodeURIComponent(learnerStateRef)}/expedition/${encodeURIComponent(enrichmentId)}/journal` as Route} />}
        >
          <BookOpenIcon data-icon="inline-start" />
          Journal
        </Button>
      </nav>
      <QuestHeader session={session} />
      <CheckpointPath view={trail} session={session} />
    </div>
  );
}
