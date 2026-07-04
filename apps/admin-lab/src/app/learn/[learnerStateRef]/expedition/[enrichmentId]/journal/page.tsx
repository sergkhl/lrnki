import { notFound } from "next/navigation";
import { PostgresLearnerExpeditionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { JournalArchive } from "@/components/learn/JournalArchive";
import { getLearnerStudySession } from "@/lib/learnerStudySession";

async function loadSession(learnerStateRef: string, enrichmentId: string) {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    const expedition = await new PostgresLearnerExpeditionStore(sql).getByEnrichment({ learnerStateRef, enrichmentId });
    return expedition?.targetDerivedNodeId ? getLearnerStudySession(enrichmentId, expedition.targetDerivedNodeId, learnerStateRef) : undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function JournalPage({ params }: Readonly<{ params: Promise<{ learnerStateRef: string; enrichmentId: string }> }>) {
  const { learnerStateRef: encodedLearnerStateRef, enrichmentId } = await params;
  const learnerStateRef = decodeURIComponent(encodedLearnerStateRef);
  const session = await loadSession(learnerStateRef, enrichmentId);
  if (!session) notFound();
  return <JournalArchive session={session} />;
}
