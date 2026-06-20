import { randomUUID } from "node:crypto";
import type { ArtifactEnvelope, Card, NewResponseLogRow, ResponseLogRow } from "@lrnki/domain-core";
import type { CardBankStorePort, ResponseLogStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

const CARD_BANK_PRODUCER = "@lrnki/infrastructure-postgres";
const CARD_BANK_PRODUCER_VERSION = "0.1.0";

// Card Bank persistence (R3). Normalized `cards` + `card_answer_key_citations` are
// the query surface; the immutable `card_bank` artifact is the inspection trace the
// `artifact_cards` JSON_TABLE view flattens. `persist` writes both in ONE
// transaction so there is never authoritative relational state without its artifact
// (mirrors PostgresEnrichmentRunStore). Cards are a learner-NEUTRAL derived asset:
// regeneration replaces an enrichment's cards rather than mutating learner state.
export class PostgresCardBankStore implements CardBankStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(cards: Card[]): Promise<void> {
    if (cards.length === 0) return;
    // All cards in one persist belong to a single enrichment layer. Regeneration is
    // replay, not mutation: delete the enrichment's prior cards (citations cascade)
    // then re-insert.
    const graphVersionId = cards[0].graphVersionId;
    const enrichmentId = cards[0].enrichmentId;
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM cards WHERE enrichment_id = ${enrichmentId}`;
      for (const card of cards) {
        await tx`
          INSERT INTO cards (card_id, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash)
          VALUES (${card.cardId}, ${card.graphVersionId}, ${card.enrichmentId}, ${card.derivedNodeId}, ${card.groundingProvenance}, ${card.question}, ${card.answerKey}, ${card.selfReportPrompt}, ${card.generatingModel}, ${card.configHash})`;
        for (const citation of card.citations) {
          if (citation.provenance === "source") {
            await tx`
              INSERT INTO card_answer_key_citations (card_answer_key_citation_id, card_id, provenance, source_resource_id, source_block_id, evidence_quote)
              VALUES (${randomUUID()}, ${card.cardId}, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote})`;
          } else {
            await tx`
              INSERT INTO card_answer_key_citations (card_answer_key_citation_id, card_id, provenance, derived_node_id, generated_passage_text)
              VALUES (${randomUUID()}, ${card.cardId}, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
          }
        }
      }

      const artifact: ArtifactEnvelope<{ graphVersionId: string; enrichmentId: string; cards: Card[] }> = {
        artifactId: randomUUID(),
        artifactType: "card_bank.v2",
        schemaVersion: "2",
        graphVersionId,
        producer: CARD_BANK_PRODUCER,
        producerVersion: CARD_BANK_PRODUCER_VERSION,
        configHash: cards[0].configHash,
        createdAt: new Date().toISOString(),
        payload: { graphVersionId, enrichmentId, cards }
      };
      await writeArtifactEnvelope(tx, artifact);
    });
  }

  async getCard(derivedNodeId: string): Promise<Card | undefined> {
    const rows = await this.sql<CardRow[]>`
      SELECT card_id, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM cards WHERE derived_node_id = ${derivedNodeId} LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [card] = await this.hydrate(rows);
    return card;
  }

  async listCardsForEnrichment(enrichmentId: string): Promise<Card[]> {
    const rows = await this.sql<CardRow[]>`
      SELECT card_id, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM cards WHERE enrichment_id = ${enrichmentId} ORDER BY derived_node_id`;
    return this.hydrate(rows);
  }

  private async hydrate(rows: CardRow[]): Promise<Card[]> {
    if (rows.length === 0) return [];
    const cardIds = rows.map((row) => row.card_id);
    const citationRows = await this.sql<CitationRow[]>`
      SELECT card_id, provenance, source_resource_id, source_block_id, evidence_quote, derived_node_id, generated_passage_text
      FROM card_answer_key_citations WHERE card_id IN ${this.sql(cardIds)}
      ORDER BY card_id, card_answer_key_citation_id`;
    const citationsByCard = new Map<string, CitationRow[]>();
    for (const citation of citationRows) {
      citationsByCard.set(citation.card_id, [...(citationsByCard.get(citation.card_id) ?? []), citation]);
    }
    return rows.map((row) => ({
      cardId: row.card_id,
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      derivedNodeId: row.derived_node_id,
      groundingProvenance: row.grounding_provenance as Card["groundingProvenance"],
      question: row.question,
      answerKey: row.answer_key,
      selfReportPrompt: row.self_report_prompt,
      generatingModel: row.generating_model,
      configHash: row.config_hash,
      citations: (citationsByCard.get(row.card_id) ?? []).map((citation) => citation.provenance === "source" ? {
        provenance: "source",
        sourceResourceId: citation.source_resource_id!,
        sourceBlockId: citation.source_block_id!,
        evidenceQuote: citation.evidence_quote!
      } : {
        provenance: "generated",
        derivedNodeId: citation.derived_node_id!,
        passageText: citation.generated_passage_text!
      })
    }));
  }
}

type CardRow = {
  card_id: string;
  graph_version_id: string;
  enrichment_id: string;
  derived_node_id: string;
  grounding_provenance: string;
  question: string;
  answer_key: string;
  self_report_prompt: string;
  generating_model: string;
  config_hash: string;
};

type CitationRow = {
  card_id: string;
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
            response_id, learner_state_ref, card_id, derived_node_id, signal_type,
            self_report_rating, judged_outcome, graded_score, evidence_weight,
            response_source, grader_identity, batch_id, attempt_seq, submitted_answer
          )
          VALUES (
            ${row.responseId}, ${row.learnerStateRef}, ${row.cardId}, ${row.derivedNodeId}, ${row.signalType},
            ${row.selfReportRating}, ${row.judgedOutcome}, ${row.gradedScore}, ${row.evidenceWeight},
            ${row.responseSource}, ${row.graderIdentity}, ${row.batchId}, ${row.attemptSeq}, ${row.submittedAnswer}
          )`;
      }
    });
  }

  async listForLearner(learnerStateRef: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, card_id, derived_node_id, signal_type,
             self_report_rating, judged_outcome, graded_score, evidence_weight,
             response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
      FROM response_log WHERE learner_state_ref = ${learnerStateRef} ORDER BY attempt_seq`;
    return rows.map(hydrateResponseLogRow);
  }

  async listForLearnerNode(learnerStateRef: string, derivedNodeId: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, card_id, derived_node_id, signal_type,
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
  card_id: string;
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
    cardId: row.card_id,
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
