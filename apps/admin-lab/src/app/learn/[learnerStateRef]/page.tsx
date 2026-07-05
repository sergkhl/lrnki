import { listExpeditionCandidates } from "@lrnki/application";
import {
  PostgresEnrichmentInspectionRead,
  PostgresLearnerExpeditionStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { ExpeditionEntry } from "@/components/learn/ExpeditionEntry";

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
      responseLog: new PostgresResponseLogStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function LearnerEntryPage({
  params
}: Readonly<{ params: Promise<{ learnerStateRef: string }> }>) {
  const { learnerStateRef: encodedLearnerStateRef } = await params;
  const learnerStateRef = decodeURIComponent(encodedLearnerStateRef);
  const entry = await loadEntry(learnerStateRef);
  return <ExpeditionEntry learnerStateRef={learnerStateRef} entry={entry} />;
}
