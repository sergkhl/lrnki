import {
  createSourceExpeditionModule,
  qualifiedSourceExpeditionAssetConfigHash,
  type LearnerKnowledgeAvailability,
  type SourceExpeditionModule
} from "@lrnki/application";
import { studyItemBankConfigHash } from "@lrnki/infrastructure-litellm";
import {
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresLearnerExpeditionStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";

// The sole production binding of Source Expedition qualification. Both the HTTP composition and
// the process-lived scaffold composition receive the same current qualification contract and
// concrete source-owned reads; neither may reconstruct readiness from raw rows.
export function createLearnerSourceExpeditions(
  sql: DatabaseClient,
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability
): SourceExpeditionModule {
  return createSourceExpeditionModule({
    learnerKnowledgeAvailability,
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    studyItemStore: new PostgresStudyItemBankStore(sql),
    expeditionStore: new PostgresLearnerExpeditionStore(sql),
    qualifiedAssetConfigHash: qualifiedSourceExpeditionAssetConfigHash(studyItemBankConfigHash())
  });
}
