import { notFound } from "next/navigation";
import { PostgresLearnerExpeditionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveyMap } from "@/components/learn/SurveyMap";
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

export default async function MapPage({ params }: Readonly<{ params: Promise<{ learnerStateRef: string; enrichmentId: string }> }>) {
  const { learnerStateRef: encodedLearnerStateRef, enrichmentId } = await params;
  const learnerStateRef = decodeURIComponent(encodedLearnerStateRef);
  const session = await loadSession(learnerStateRef, enrichmentId);
  if (!session) notFound();
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <CardTitle>Survey map</CardTitle>
      </CardHeader>
      <CardContent>
        <SurveyMap session={session} />
      </CardContent>
    </Card>
  );
}
