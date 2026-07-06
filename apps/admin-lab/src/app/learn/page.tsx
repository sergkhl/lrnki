import { listExpeditionCandidates } from "@lrnki/application";
import {
  PostgresEnrichmentInspectionRead,
  PostgresLessonReadStore,
  PostgresLearnerExpeditionStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { ExpeditionEntry } from "@/components/learn/ExpeditionEntry";
import { LearnerNameGate } from "@/components/learn/LearnerNameGate";
import { readLearnerRef } from "@/lib/learnerSession";

async function loadEntry(learnerStateRef: string) {
  if (!process.env.DATABASE_URL) {
    return { candidates: [], learnerExpeditions: [] };
  }
  const sql = createDatabaseClient();
  try {
    return await listExpeditionCandidates({
      learnerStateRef,
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      expeditionStore: new PostgresLearnerExpeditionStore(sql),
      studyItemStore: new PostgresStudyItemBankStore(sql),
      responseLog: new PostgresResponseLogStore(sql),
      lessonReadStore: new PostgresLessonReadStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function LearnLandingPage() {
  const learnerStateRef = await readLearnerRef();
  if (learnerStateRef) {
    const entry = await loadEntry(learnerStateRef);
    return <ExpeditionEntry learnerStateRef={learnerStateRef} entry={entry} />;
  }

  return (
    <section className="flex min-h-[calc(100svh-2rem)] items-center justify-center">
      <LearnerNameGate />
    </section>
  );
}
