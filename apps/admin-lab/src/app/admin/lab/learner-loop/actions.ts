"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { LiteLlmAnswerGradingJudgeAdapter, LiteLlmForcedToolClient } from "@lrnki/infrastructure-litellm";
import {
  PostgresArtifactRepository,
  PostgresEnrichmentRunStore,
  PostgresLearnerPathStore,
  PostgresResponseLogStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { resubmitAndRecompute } from "@/lib/learnerLoop";

// Admin Lab's FIRST write path (U8, R15). It appends a new graded row for an
// operator-edited answer and recomputes the learner's adaptive path(s) — mutating
// learner state ONLY. It never opens a graph-version or enrichment write port, so it
// cannot touch a published graph or the Derived Graph Layer (AGENTS rule 12).
export async function resubmitEditedAnswer(formData: FormData): Promise<void> {
  const learnerStateRef = String(formData.get("learnerStateRef") ?? "");
  const studyItemId = String(formData.get("studyItemId") ?? "");
  const editedAnswer = String(formData.get("editedAnswer") ?? "").trim();
  if (!learnerStateRef || !studyItemId || !editedAnswer) return;

  const sql = createDatabaseClient();
  try {
    // Re-derive the studyItem and its node from the DB — never trust a client-sent
    // answer-key. declaredDomain comes from the Derived Graph node.
    const studyItemRows = await sql<{ derived_node_id: string; question: string; answer_key: string; declared_domain: string }[]>`
      SELECT cd.derived_node_id, cd.question, cd.answer_key, n.declared_domain
      FROM study_items cd JOIN derived_graph_nodes n ON n.derived_node_id = cd.derived_node_id
      WHERE cd.study_item_id = ${studyItemId} AND cd.item_type = 'self_assessment' LIMIT 1`;
    if (studyItemRows.length === 0) return;
    const studyItem = studyItemRows[0];

    const pathRows = await sql<{ enrichment_id: string; target_derived_node_id: string }[]>`
      SELECT enrichment_id, target_derived_node_id FROM learner_paths WHERE learner_state_ref = ${learnerStateRef}`;

    const client = new LiteLlmForcedToolClient({
      baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
      apiKey: process.env.LITELLM_API_KEY ?? "sk-local",
      timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "600") * 1000,
      temperature: 0,
      seed: 7
    });

    await resubmitAndRecompute({
      learnerStateRef,
      studyItem: { studyItemId, derivedNodeId: studyItem.derived_node_id, question: studyItem.question, answerKey: studyItem.answer_key },
      declaredDomain: studyItem.declared_domain,
      submittedAnswer: editedAnswer,
      paths: pathRows.map((row) => ({ enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id })),
      judge: new LiteLlmAnswerGradingJudgeAdapter(client),
      responseLog: new PostgresResponseLogStore(sql),
      enrichmentStore: new PostgresEnrichmentRunStore(sql),
      pathStore: new PostgresLearnerPathStore(sql),
      artifacts: new PostgresArtifactRepository(sql),
      newPathId: () => randomUUID()
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  revalidatePath(`/admin/lab/learner-loop/${learnerStateRef}`);
}
