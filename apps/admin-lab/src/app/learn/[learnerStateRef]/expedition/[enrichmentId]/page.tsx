import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon, MapIcon } from "lucide-react";
import { PostgresLearnerExpeditionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { Button } from "@/components/ui/button";
import { ActivityScreen } from "@/components/learn/ActivityScreen";
import { QuestHeader } from "@/components/learn/QuestHeader";
import { Trail } from "@/components/learn/Trail";
import { buildTrailView } from "@/components/learn/trailView";
import { getLearnerStudySession, listAnsweredStudyItemIds } from "@/lib/learnerStudySession";

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
  const [session, answeredStudyItemIds] = await Promise.all([
    getLearnerStudySession(enrichmentId, targetDerivedNodeId, learnerStateRef),
    listAnsweredStudyItemIds(learnerStateRef)
  ]);
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
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/learn/${encodeURIComponent(learnerStateRef)}/expedition/${encodeURIComponent(enrichmentId)}/map` as Route} />}
        >
          <MapIcon data-icon="inline-start" />
          Map
        </Button>
      </nav>
      <QuestHeader session={session} />
      <ActivityScreen session={session} answeredStudyItemIds={answeredStudyItemIds} />
      <Trail view={trail} />
    </div>
  );
}
