import { randomUUID } from "node:crypto";
import type { ArtifactEnvelope, Card } from "@lrnki/domain-core";
import type { CardBankStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

const CARD_BANK_PRODUCER = "@lrnki/infrastructure-postgres";
const CARD_BANK_PRODUCER_VERSION = "0.1.0";

// Card Bank persistence (R3). Normalized `cards` + `card_answer_key_citations` are
// the query surface; the immutable `card_bank` artifact is the inspection trace the
// `artifact_cards` JSON_TABLE view flattens. `persist` writes both in ONE
// transaction so there is never authoritative relational state without its artifact
// (mirrors PostgresEnrichmentRunStore). Cards are a learner-NEUTRAL derived asset:
// regeneration replaces a version's cards rather than mutating learner state.
export class PostgresCardBankStore implements CardBankStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(cards: Card[]): Promise<void> {
    if (cards.length === 0) return;
    // All cards in one persist belong to a single graph version (the orchestration
    // generates a whole version's bank at once). Regeneration is replay, not
    // mutation: delete the version's prior cards (citations cascade) then re-insert.
    const graphVersionId = cards[0].graphVersionId;
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM cards WHERE graph_version_id = ${graphVersionId}`;
      for (const card of cards) {
        await tx`
          INSERT INTO cards (card_id, graph_version_id, concept_id, question, answer_key, self_report_prompt, generating_model, config_hash)
          VALUES (${card.cardId}, ${card.graphVersionId}, ${card.conceptId}, ${card.question}, ${card.answerKey}, ${card.selfReportPrompt}, ${card.generatingModel}, ${card.configHash})`;
        for (const citation of card.citations) {
          await tx`
            INSERT INTO card_answer_key_citations (card_answer_key_citation_id, card_id, source_resource_id, source_block_id, evidence_quote)
            VALUES (${randomUUID()}, ${card.cardId}, ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote})`;
        }
      }

      const artifact: ArtifactEnvelope<{ graphVersionId: string; cards: Card[] }> = {
        artifactId: randomUUID(),
        artifactType: "card_bank.v2",
        schemaVersion: "2",
        graphVersionId,
        producer: CARD_BANK_PRODUCER,
        producerVersion: CARD_BANK_PRODUCER_VERSION,
        configHash: cards[0].configHash,
        createdAt: new Date().toISOString(),
        payload: { graphVersionId, cards }
      };
      await writeArtifactEnvelope(tx, artifact);
    });
  }

  async getCard(graphVersionId: string, conceptId: string): Promise<Card | undefined> {
    const rows = await this.sql<CardRow[]>`
      SELECT card_id, graph_version_id, concept_id, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM cards WHERE graph_version_id = ${graphVersionId} AND concept_id = ${conceptId} LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [card] = await this.hydrate(rows);
    return card;
  }

  async listCardsForVersion(graphVersionId: string): Promise<Card[]> {
    const rows = await this.sql<CardRow[]>`
      SELECT card_id, graph_version_id, concept_id, question, answer_key, self_report_prompt, generating_model, config_hash
      FROM cards WHERE graph_version_id = ${graphVersionId} ORDER BY concept_id`;
    return this.hydrate(rows);
  }

  private async hydrate(rows: CardRow[]): Promise<Card[]> {
    if (rows.length === 0) return [];
    const cardIds = rows.map((row) => row.card_id);
    const citationRows = await this.sql<CitationRow[]>`
      SELECT card_id, source_resource_id, source_block_id, evidence_quote
      FROM card_answer_key_citations WHERE card_id IN ${this.sql(cardIds)}
      ORDER BY card_id, card_answer_key_citation_id`;
    const citationsByCard = new Map<string, CitationRow[]>();
    for (const citation of citationRows) {
      citationsByCard.set(citation.card_id, [...(citationsByCard.get(citation.card_id) ?? []), citation]);
    }
    return rows.map((row) => ({
      cardId: row.card_id,
      graphVersionId: row.graph_version_id,
      conceptId: row.concept_id,
      question: row.question,
      answerKey: row.answer_key,
      selfReportPrompt: row.self_report_prompt,
      generatingModel: row.generating_model,
      configHash: row.config_hash,
      citations: (citationsByCard.get(row.card_id) ?? []).map((citation) => ({
        sourceResourceId: citation.source_resource_id,
        sourceBlockId: citation.source_block_id,
        evidenceQuote: citation.evidence_quote
      }))
    }));
  }
}

type CardRow = {
  card_id: string;
  graph_version_id: string;
  concept_id: string;
  question: string;
  answer_key: string;
  self_report_prompt: string;
  generating_model: string;
  config_hash: string;
};

type CitationRow = {
  card_id: string;
  source_resource_id: string;
  source_block_id: string;
  evidence_quote: string;
};
