import { randomUUID } from "node:crypto";
import type { ArtifactEnvelope, NewResponseLogRow, RejectedStudyItem, ResponseLogRow, StudyItem, StudyItemCitation, StudyItemOption, StudyItemType } from "@lrnki/domain-core";
import type { ResponseLogStorePort, StudyItemBankStorePort } from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

const STUDY_ITEM_BANK_PRODUCER = "@lrnki/infrastructure-postgres";
const STUDY_ITEM_BANK_PRODUCER_VERSION = "0.1.0";

// Study Item Bank persistence (R7, R12, ADR-0026). Normalized `study_items` +
// `study_item_options` + `study_item_citations` are the query surface; the immutable
// `study_item_bank` artifact is the inspection trace the `artifact_study_items`
// JSON_TABLE view flattens. `persist` writes them all in ONE transaction so there is
// never authoritative relational state without its artifact (mirrors
// PostgresEnrichmentRunStore). Items are a learner-NEUTRAL derived asset: regeneration
// replaces an enrichment's items rather than mutating learner state. `supportedItemTypes`
// is a SELECT DISTINCT query — the supported set is the byproduct of which items grounded,
// never a stored map (KTD2, rule 18).
export class PostgresStudyItemBankStore implements StudyItemBankStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: { graphVersionId: string; enrichmentId: string; configHash: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }): Promise<void> {
    const { graphVersionId, enrichmentId, configHash, studyItems, rejected } = input;
    // All items in one persist belong to a single enrichment layer. Regeneration is
    // replay, not mutation: delete the enrichment's prior items (options + citations
    // cascade) and prior rejections, then re-insert. Done even when 0 items survive so an
    // all-rejected regeneration still clears stale items and records the rejections.
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM study_items WHERE enrichment_id = ${enrichmentId}`;
      await tx`DELETE FROM rejected_study_items WHERE enrichment_id = ${enrichmentId}`;
      for (const rejection of rejected) {
        await tx`
          INSERT INTO rejected_study_items (rejected_study_item_id, graph_version_id, enrichment_id, derived_node_id, reason, config_hash)
          VALUES (${randomUUID()}, ${graphVersionId}, ${enrichmentId}, ${rejection.derivedNodeId}, ${rejection.reason}, ${configHash})`;
      }
      for (const item of studyItems) {
        const answerKey = item.itemType === "self_assessment" ? item.answerKey : null;
        const selfReportPrompt = item.itemType === "self_assessment" ? item.selfReportPrompt : null;
        await tx`
          INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash)
          VALUES (${item.studyItemId}, ${item.itemType}, ${item.graphVersionId}, ${item.enrichmentId}, ${item.derivedNodeId}, ${item.groundingProvenance}, ${item.question}, ${answerKey}, ${selfReportPrompt}, ${item.generatingModel}, ${item.configHash})`;

        if (item.itemType === "self_assessment") {
          for (const citation of item.citations) await this.insertCitation(tx, item.studyItemId, citation);
        } else {
          // Sequential await keeps the option/citation inserts ordered within the tx.
          for (const [ordinal, option] of item.options.entries()) {
            await tx`
              INSERT INTO study_item_options (option_id, study_item_id, ordinal, option_text, is_correct, provenance)
              VALUES (${option.optionId}, ${item.studyItemId}, ${ordinal}, ${option.text}, ${option.isCorrect}, ${option.provenance})`;
            if (option.isCorrect && option.citation) await this.insertCitation(tx, item.studyItemId, option.citation);
          }
        }
      }

      const artifact: ArtifactEnvelope<{ graphVersionId: string; enrichmentId: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }> = {
        artifactId: randomUUID(),
        artifactType: "study_item_bank.v4",
        schemaVersion: "4",
        graphVersionId,
        producer: STUDY_ITEM_BANK_PRODUCER,
        producerVersion: STUDY_ITEM_BANK_PRODUCER_VERSION,
        configHash,
        createdAt: new Date().toISOString(),
        payload: { graphVersionId, enrichmentId, studyItems, rejected }
      };
      await writeArtifactEnvelope(tx, artifact);
    });
  }

  private async insertCitation(tx: Sql | TransactionSql, studyItemId: string, citation: StudyItemCitation): Promise<void> {
    if (citation.provenance === "source") {
      await tx`
        INSERT INTO study_item_citations (study_item_citation_id, study_item_id, provenance, source_resource_id, source_block_id, evidence_quote)
        VALUES (${randomUUID()}, ${studyItemId}, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote})`;
    } else {
      await tx`
        INSERT INTO study_item_citations (study_item_citation_id, study_item_id, provenance, derived_node_id, generated_passage_text)
        VALUES (${randomUUID()}, ${studyItemId}, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
    }
  }

  async getStudyItem(derivedNodeId: string, itemType: StudyItemType): Promise<StudyItem | undefined> {
    const rows = await this.sql<StudyItemRow[]>`
      SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM study_items WHERE derived_node_id = ${derivedNodeId} AND item_type = ${itemType} LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [item] = await this.hydrate(rows);
    return item;
  }

  async listStudyItemsForEnrichment(enrichmentId: string): Promise<StudyItem[]> {
    const rows = await this.sql<StudyItemRow[]>`
      SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM study_items WHERE enrichment_id = ${enrichmentId} ORDER BY derived_node_id, item_type`;
    return this.hydrate(rows);
  }

  async supportedItemTypes(derivedNodeId: string): Promise<StudyItemType[]> {
    const rows = await this.sql<{ item_type: string }[]>`
      SELECT DISTINCT item_type FROM study_items WHERE derived_node_id = ${derivedNodeId} ORDER BY item_type`;
    return rows.map((row) => row.item_type as StudyItemType);
  }

  private async hydrate(rows: StudyItemRow[]): Promise<StudyItem[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.study_item_id);
    const citationRows = await this.sql<CitationRow[]>`
      SELECT study_item_id, provenance, source_resource_id, source_block_id, evidence_quote, derived_node_id, generated_passage_text
      FROM study_item_citations WHERE study_item_id IN ${this.sql(ids)}
      ORDER BY study_item_id, study_item_citation_id`;
    const optionRows = await this.sql<OptionRow[]>`
      SELECT option_id, study_item_id, ordinal, option_text, is_correct, provenance
      FROM study_item_options WHERE study_item_id IN ${this.sql(ids)}
      ORDER BY study_item_id, ordinal`;

    const citationsByItem = new Map<string, CitationRow[]>();
    for (const citation of citationRows) {
      citationsByItem.set(citation.study_item_id, [...(citationsByItem.get(citation.study_item_id) ?? []), citation]);
    }
    const optionsByItem = new Map<string, OptionRow[]>();
    for (const option of optionRows) {
      optionsByItem.set(option.study_item_id, [...(optionsByItem.get(option.study_item_id) ?? []), option]);
    }

    return rows.map((row) => {
      const base = {
        studyItemId: row.study_item_id,
        graphVersionId: row.graph_version_id,
        enrichmentId: row.enrichment_id,
        derivedNodeId: row.derived_node_id,
        groundingProvenance: row.grounding_provenance as StudyItem["groundingProvenance"],
        generatingModel: row.generating_model,
        configHash: row.config_hash,
        question: row.question
      };
      const citations = (citationsByItem.get(row.study_item_id) ?? []).map(toCitation);
      if (row.item_type === "self_assessment") {
        return { ...base, itemType: "self_assessment", answerKey: row.answer_key!, selfReportPrompt: row.self_report_prompt!, citations };
      }
      const citation = citations[0];
      const options: StudyItemOption[] = (optionsByItem.get(row.study_item_id) ?? []).map((option) => ({
        optionId: option.option_id,
        text: option.option_text,
        isCorrect: option.is_correct,
        provenance: option.provenance,
        ...(option.is_correct && citation ? { citation } : {})
      }));
      return { ...base, itemType: "option_select", options };
    });
  }
}

function toCitation(row: CitationRow): StudyItemCitation {
  return row.provenance === "source"
    ? { provenance: "source", sourceResourceId: row.source_resource_id!, sourceBlockId: row.source_block_id!, evidenceQuote: row.evidence_quote! }
    : { provenance: "generated", derivedNodeId: row.derived_node_id!, passageText: row.generated_passage_text! };
}

type StudyItemRow = {
  study_item_id: string;
  item_type: "self_assessment" | "option_select";
  graph_version_id: string;
  enrichment_id: string;
  derived_node_id: string;
  grounding_provenance: string;
  question: string;
  answer_key: string | null;
  self_report_prompt: string | null;
  generating_model: string;
  config_hash: string;
};

type OptionRow = {
  option_id: string;
  study_item_id: string;
  ordinal: number;
  option_text: string;
  is_correct: boolean;
  provenance: "source" | "generated";
};

type CitationRow = {
  study_item_id: string;
  provenance: "source" | "generated";
  source_resource_id: string | null;
  source_block_id: string | null;
  evidence_quote: string | null;
  derived_node_id: string | null;
  generated_passage_text: string | null;
};

// Response Log persistence (R4–R6). APPEND + READ only — there is no update or delete
// method, so the append-only guarantee is structural. The DB CHECK constraints keep
// every row signal-coherent; this store never reshapes a row, it only inserts.
export class PostgresResponseLogStore implements ResponseLogStorePort {
  constructor(private readonly sql: Sql) {}

  async append(rows: NewResponseLogRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const row of rows) {
        await tx`
          INSERT INTO response_log (
            response_id, learner_state_ref, study_item_id, derived_node_id, signal_type,
            self_report_rating, judged_outcome, graded_score, evidence_weight,
            response_source, grader_identity, batch_id, attempt_seq, submitted_answer
          )
          VALUES (
            ${row.responseId}, ${row.learnerStateRef}, ${row.studyItemId}, ${row.derivedNodeId}, ${row.signalType},
            ${row.selfReportRating}, ${row.judgedOutcome}, ${row.gradedScore}, ${row.evidenceWeight},
            ${row.responseSource}, ${row.graderIdentity}, ${row.batchId}, ${row.attemptSeq}, ${row.submittedAnswer}
          )`;
      }
    });
  }

  async listForLearner(learnerStateRef: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, signal_type,
             self_report_rating, judged_outcome, graded_score, evidence_weight,
             response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
      FROM response_log WHERE learner_state_ref = ${learnerStateRef} ORDER BY attempt_seq`;
    return rows.map(hydrateResponseLogRow);
  }

  async listForLearnerNode(learnerStateRef: string, derivedNodeId: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, signal_type,
             self_report_rating, judged_outcome, graded_score, evidence_weight,
             response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
      FROM response_log WHERE learner_state_ref = ${learnerStateRef} AND derived_node_id = ${derivedNodeId} ORDER BY attempt_seq`;
    return rows.map(hydrateResponseLogRow);
  }

  async nextAttemptSeq(learnerStateRef: string): Promise<number> {
    const [{ next }] = await this.sql<{ next: number }[]>`
      SELECT COALESCE(MAX(attempt_seq), 0) + 1 AS next FROM response_log WHERE learner_state_ref = ${learnerStateRef}`;
    return Number(next);
  }
}

type ResponseLogDbRow = {
  response_id: string;
  learner_state_ref: string;
  study_item_id: string;
  derived_node_id: string;
  signal_type: string;
  self_report_rating: string | null;
  judged_outcome: string | null;
  graded_score: number | null;
  evidence_weight: number;
  response_source: string;
  grader_identity: string | null;
  batch_id: string | null;
  attempt_seq: number;
  submitted_answer: string | null;
  created_at: string;
};

function hydrateResponseLogRow(row: ResponseLogDbRow): ResponseLogRow {
  return {
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    studyItemId: row.study_item_id,
    derivedNodeId: row.derived_node_id,
    signalType: row.signal_type as ResponseLogRow["signalType"],
    selfReportRating: row.self_report_rating as ResponseLogRow["selfReportRating"],
    judgedOutcome: row.judged_outcome as ResponseLogRow["judgedOutcome"],
    gradedScore: row.graded_score === null ? null : Number(row.graded_score),
    evidenceWeight: Number(row.evidence_weight),
    responseSource: row.response_source as ResponseLogRow["responseSource"],
    graderIdentity: row.grader_identity,
    batchId: row.batch_id,
    attemptSeq: Number(row.attempt_seq),
    submittedAnswer: row.submitted_answer,
    createdAt: new Date(row.created_at).toISOString()
  };
}
