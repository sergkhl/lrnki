import { randomUUID } from "node:crypto";
import type { ArtifactEnvelope, CalibrationVerdict, ConceptLesson, ConceptLessonSection, ImpostorItem, ImpostorStatement, LessonAbsentNode, MatchingItem, MatchingPair, NewResponseLogRow, RejectedStudyItem, ResponseLogRow, StudyItem, StudyItemCitation, StudyItemOption, StudyItemType } from "@lrnki/domain-core";
import type { CalibrationVerdictStorePort, ConceptLessonStorePort, EnrichmentLayerPurposeStorePort, LessonReadStorePort, ResponseLogStorePort, StudyItemBankStorePort } from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifacts";

const STUDY_ITEM_BANK_PRODUCER = "@lrnki/infrastructure-postgres";
const STUDY_ITEM_BANK_PRODUCER_VERSION = "0.1.0";

// Study Item Bank persistence (R7, R12, ADR-0026). Normalized `study_items` +
// `study_item_options` + `study_item_citations` are the query surface; the immutable
// `study_item_bank` artifact is the inspection trace the `artifact_study_items`
// JSON_TABLE view flattens. `persist` writes them all in ONE transaction so there is
// never authoritative relational state without its artifact (mirrors
// PostgresEnrichmentRunStore). Items are a learner-NEUTRAL derived asset: regeneration
// supersedes an enrichment's prior items rather than deleting them, because
// response_log.study_item_id (append-only, no cascade) must keep resolving even after
// the bank moves on — a hard delete-then-insert here would FK-violate the moment any
// response has been logged against the item being replaced. All three read methods
// scope to `superseded_at IS NULL` (the current generation); `supportedItemTypes`
// is a SELECT DISTINCT query over that same current scope — the supported set is the
// byproduct of which items grounded, never a stored map (KTD2, rule 18).
export class PostgresStudyItemBankStore implements StudyItemBankStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: { graphVersionId: string | null; enrichmentId: string; configHash: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }): Promise<void> {
    const { graphVersionId, enrichmentId, configHash, studyItems, rejected } = input;
    for (const item of studyItems) assertPersistableItem(item);
    // All items in one persist belong to a single enrichment layer. Regeneration is
    // replay, not mutation — but unlike rejections (which nothing outside this table
    // references, so a plain delete-then-insert is safe), prior items are SUPERSEDED
    // rather than deleted: response_log rows may already point at them. The superseded
    // row, and its options/citations/impostor statements, stay in place as history. Done
    // even when 0 items survive so an all-rejected regeneration still retires stale
    // items and records the rejections.
    await this.sql.begin(async (tx) => {
      await tx`UPDATE study_items SET superseded_at = now() WHERE enrichment_id = ${enrichmentId} AND superseded_at IS NULL`;
      await tx`DELETE FROM rejected_study_items WHERE enrichment_id = ${enrichmentId}`;
      for (const rejection of rejected) {
        await tx`
          INSERT INTO rejected_study_items (rejected_study_item_id, graph_version_id, enrichment_id, derived_node_id, item_type, reason, config_hash)
          VALUES (${randomUUID()}, ${graphVersionId}, ${enrichmentId}, ${rejection.derivedNodeId}, ${rejection.itemType}, ${rejection.reason}, ${configHash})`;
      }
      for (const item of studyItems) {
        await tx`
          INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, explanation, facet, explorable_terms, generating_model, config_hash)
          VALUES (${item.studyItemId}, ${item.itemType}, ${item.graphVersionId}, ${item.enrichmentId}, ${item.derivedNodeId}, ${item.groundingProvenance}, ${item.question}, ${item.itemType === "option_select" ? item.explanation : null}, ${item.facet ?? null}, ${this.sql.json(item.explorableTerms)}, ${item.generatingModel}, ${item.configHash})`;

        // Sequential await keeps the per-item child inserts ordered within the tx.
        if (item.itemType === "option_select") {
          for (const [ordinal, option] of item.options.entries()) {
            await tx`
              INSERT INTO study_item_options (option_id, study_item_id, ordinal, option_text, is_correct, provenance)
              VALUES (${option.optionId}, ${item.studyItemId}, ${ordinal}, ${option.text}, ${option.isCorrect}, ${option.provenance})`;
            if (option.isCorrect && option.citation) await this.insertCitation(tx, item.studyItemId, option.citation);
          }
        } else if (item.itemType === "matching") {
          for (const [ordinal, pair] of item.pairs.entries()) {
            await this.insertMatchingPair(tx, item, pair, ordinal);
          }
        } else if (item.itemType === "impostor") {
          for (const statement of item.statements) {
            await this.insertImpostorStatement(tx, item, statement);
          }
        } else {
          assertNever(item);
        }
      }

      const artifact: ArtifactEnvelope<{ graphVersionId: string | null; enrichmentId: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }> = {
        artifactId: randomUUID(),
        artifactType: "study_item_bank",
        ...(graphVersionId ? { graphVersionId } : {}),
        producer: STUDY_ITEM_BANK_PRODUCER,
        producerVersion: STUDY_ITEM_BANK_PRODUCER_VERSION,
        configHash,
        createdAt: new Date().toISOString(),
        payload: { graphVersionId, enrichmentId, studyItems, rejected }
      };
      await writeArtifactEnvelope(tx, artifact);
    });
  }

  private async insertMatchingPair(tx: Sql | TransactionSql, item: MatchingItem, pair: MatchingPair, ordinal: number): Promise<void> {
    const citation = pair.citation;
    if (citation.provenance === "source") {
      await tx`
        INSERT INTO matching_pairs (matching_pair_id, match_tile_id, study_item_id, ordinal, prompt_text, match_text, provenance, source_resource_id, source_block_id, evidence_quote, match_kind)
        VALUES (${pair.pairId}, ${pair.matchId}, ${item.studyItemId}, ${ordinal}, ${pair.promptText}, ${pair.matchText}, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote}, ${citation.matchKind})`;
    } else {
      await tx`
        INSERT INTO matching_pairs (matching_pair_id, match_tile_id, study_item_id, ordinal, prompt_text, match_text, provenance, derived_node_id, generated_passage_text)
        VALUES (${pair.pairId}, ${pair.matchId}, ${item.studyItemId}, ${ordinal}, ${pair.promptText}, ${pair.matchText}, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
    }
  }

  private async insertCitation(tx: Sql | TransactionSql, studyItemId: string, citation: StudyItemCitation): Promise<void> {
    if (citation.provenance === "source") {
      await tx`
        INSERT INTO study_item_citations (study_item_citation_id, study_item_id, provenance, source_resource_id, source_block_id, evidence_quote, match_kind)
        VALUES (${randomUUID()}, ${studyItemId}, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote}, ${citation.matchKind})`;
    } else {
      await tx`
        INSERT INTO study_item_citations (study_item_citation_id, study_item_id, provenance, derived_node_id, generated_passage_text)
        VALUES (${randomUUID()}, ${studyItemId}, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
    }
  }

  // Insert one impostor statement row. A truth carries its inline citation (source or
  // generated); the impostor carries no citation and, alone, the item's reveal / lie_source /
  // sibling_label. The DB CHECK rejects any other column shape (the structural honesty
  // backstop behind the guard) — a source-cited impostor is unrepresentable.
  private async insertImpostorStatement(tx: Sql | TransactionSql, item: ImpostorItem, statement: ImpostorStatement): Promise<void> {
    if (statement.isImpostor) {
      const siblingLabel = statement.lieSource === "sibling" ? (statement.siblingLabel ?? null) : null;
      await tx`
        INSERT INTO impostor_statements (impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, reveal_text, lie_source, sibling_label)
        VALUES (${statement.statementId}, ${item.studyItemId}, ${statement.ordinal}, ${statement.text}, true, 'generated', ${statement.reveal}, ${statement.lieSource}, ${siblingLabel})`;
      return;
    }
    const citation = statement.citation;
    if (!citation) throw new Error(`impostor truth ${statement.statementId} must carry a citation.`);
    if (citation.provenance === "source") {
      await tx`
        INSERT INTO impostor_statements (impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, source_resource_id, source_block_id, evidence_quote, match_kind)
        VALUES (${statement.statementId}, ${item.studyItemId}, ${statement.ordinal}, ${statement.text}, false, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote}, ${citation.matchKind})`;
    } else {
      await tx`
        INSERT INTO impostor_statements (impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, derived_node_id, generated_passage_text)
        VALUES (${statement.statementId}, ${item.studyItemId}, ${statement.ordinal}, ${statement.text}, false, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
    }
  }

  async getStudyItem(derivedNodeId: string, itemType: StudyItemType): Promise<StudyItem | undefined> {
    const rows = await this.sql<StudyItemRow[]>`
      SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, explanation, facet, explorable_terms, generating_model, config_hash
      FROM study_items WHERE derived_node_id = ${derivedNodeId} AND item_type = ${itemType} AND superseded_at IS NULL LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [item] = await hydrateStudyItemRows(this.sql, rows);
    return item;
  }

  async getStudyItemById(studyItemId: string): Promise<StudyItem | undefined> {
    const rows = await this.sql<StudyItemRow[]>`
      SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, explanation, facet, explorable_terms, generating_model, config_hash
      FROM study_items WHERE study_item_id = ${studyItemId} AND superseded_at IS NULL LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [item] = await hydrateStudyItemRows(this.sql, rows);
    return item;
  }

  async listStudyItemsForEnrichment(enrichmentId: string): Promise<StudyItem[]> {
    const rows = await this.sql<StudyItemRow[]>`
      SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, explanation, facet, explorable_terms, generating_model, config_hash
      FROM study_items WHERE enrichment_id = ${enrichmentId} AND superseded_at IS NULL ORDER BY derived_node_id, item_type`;
    return hydrateStudyItemRows(this.sql, rows);
  }

  async supportedItemTypes(derivedNodeId: string): Promise<StudyItemType[]> {
    const rows = await this.sql<{ item_type: string }[]>`
      SELECT DISTINCT item_type FROM study_items WHERE derived_node_id = ${derivedNodeId} AND superseded_at IS NULL ORDER BY item_type`;
    return rows.map((row) => row.item_type as StudyItemType);
  }

}

// Hydrate persisted study-item rows into full domain items. Module-level (rather than a
// private method) so PostgresLearnerRecallChallengeStore can hydrate a challenge lineup's
// items — including superseded generations, whose child rows stay in place — through the
// exact same stitch (plan 2026-07-13-003 U2, rule 18).
export async function hydrateStudyItemRows(sql: Sql, rows: StudyItemRow[]): Promise<StudyItem[]> {
    if (rows.length === 0) return [];
    const optionSelectIds = rows.filter((row) => row.item_type === "option_select").map((row) => row.study_item_id);
    const matchingIds = rows.filter((row) => row.item_type === "matching").map((row) => row.study_item_id);
    const impostorIds = rows.filter((row) => row.item_type === "impostor").map((row) => row.study_item_id);

    const citationRows = optionSelectIds.length
      ? await sql<CitationRow[]>`
        SELECT study_item_id, provenance, source_resource_id, source_block_id, evidence_quote, match_kind, derived_node_id, generated_passage_text
        FROM study_item_citations WHERE study_item_id IN ${sql(optionSelectIds)}
        ORDER BY study_item_id, study_item_citation_id`
      : [];
    const matchingRows = matchingIds.length
      ? await sql<MatchingPairRow[]>`
        SELECT matching_pair_id, match_tile_id, study_item_id, ordinal, prompt_text, match_text, provenance, source_resource_id, source_block_id, evidence_quote, match_kind, derived_node_id, generated_passage_text
        FROM matching_pairs WHERE study_item_id IN ${sql(matchingIds)}
        ORDER BY study_item_id, ordinal`
      : [];
    const optionRows = optionSelectIds.length
      ? await sql<OptionRow[]>`
        SELECT option_id, study_item_id, ordinal, option_text, is_correct, provenance
        FROM study_item_options WHERE study_item_id IN ${sql(optionSelectIds)}
        ORDER BY study_item_id, ordinal`
      : [];
    const statementRows = impostorIds.length
      ? await sql<ImpostorStatementRow[]>`
        SELECT impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, source_resource_id, source_block_id, evidence_quote, match_kind, derived_node_id, generated_passage_text, reveal_text, lie_source, sibling_label
        FROM impostor_statements WHERE study_item_id IN ${sql(impostorIds)}
        ORDER BY study_item_id, ordinal`
      : [];

    const citationsByItem = new Map<string, CitationRow[]>();
    for (const citation of citationRows) {
      citationsByItem.set(citation.study_item_id, [...(citationsByItem.get(citation.study_item_id) ?? []), citation]);
    }
    const optionsByItem = new Map<string, OptionRow[]>();
    for (const option of optionRows) {
      optionsByItem.set(option.study_item_id, [...(optionsByItem.get(option.study_item_id) ?? []), option]);
    }
    const statementsByItem = new Map<string, ImpostorStatementRow[]>();
    for (const statement of statementRows) {
      statementsByItem.set(statement.study_item_id, [...(statementsByItem.get(statement.study_item_id) ?? []), statement]);
    }
    const matchingByItem = new Map<string, MatchingPairRow[]>();
    for (const pair of matchingRows) {
      matchingByItem.set(pair.study_item_id, [...(matchingByItem.get(pair.study_item_id) ?? []), pair]);
    }

    return rows.map((row): StudyItem => {
      const base = {
        studyItemId: row.study_item_id,
        graphVersionId: row.graph_version_id,
        enrichmentId: row.enrichment_id,
        derivedNodeId: row.derived_node_id,
        groundingProvenance: row.grounding_provenance as StudyItem["groundingProvenance"],
        generatingModel: row.generating_model,
        configHash: row.config_hash,
        ...(row.facet ? { facet: row.facet } : {}),
        explorableTerms: row.explorable_terms ?? [],
        question: row.question
      };
      if (row.item_type === "impostor") {
        const statementRowsForItem = statementsByItem.get(row.study_item_id) ?? [];
        const statements: ImpostorStatement[] = statementRowsForItem.map(toImpostorStatement);
        return {
          ...base,
          itemType: "impostor",
          statements
        };
      }
      if (row.item_type === "matching") {
        return {
          ...base,
          itemType: "matching",
          pairs: (matchingByItem.get(row.study_item_id) ?? []).map(toMatchingPair)
        };
      }
      if (row.item_type !== "option_select") throw new Error(`unsupported study item type: ${row.item_type}`);
      const citations = (citationsByItem.get(row.study_item_id) ?? []).map(toCitation);
      const citation = citations[0];
      const options: StudyItemOption[] = (optionsByItem.get(row.study_item_id) ?? []).map((option) => ({
        optionId: option.option_id,
        text: option.option_text,
        isCorrect: option.is_correct,
        provenance: option.provenance,
        ...(option.is_correct && citation ? { citation } : {})
      }));
      return { ...base, itemType: "option_select", explanation: row.explanation ?? "", options };
    });
}

// Defense-in-depth structural assert before persist (the guard already validated). Dispatches
// on item type; the DB CHECKs are the final backstop.
function assertPersistableItem(item: StudyItem): void {
  if (item.itemType === "option_select") {
    if (item.options.length !== 4) throw new Error(`option_select ${item.studyItemId} must have exactly four options.`);
    const correctOptions = item.options.filter((option) => option.isCorrect);
    if (correctOptions.length !== 1) throw new Error(`option_select ${item.studyItemId} must have exactly one correct option.`);
    if (!correctOptions[0].citation) throw new Error(`option_select ${item.studyItemId} correct option must carry a citation.`);
    return;
  }
  if (item.itemType === "impostor") {
    if (item.statements.length !== 4) throw new Error(`impostor ${item.studyItemId} must have exactly four statements.`);
    const impostors = item.statements.filter((statement) => statement.isImpostor);
    if (impostors.length !== 1) throw new Error(`impostor ${item.studyItemId} must have exactly one impostor statement.`);
    if (!impostors[0].reveal.trim()) throw new Error(`impostor ${item.studyItemId} impostor statement must carry a reveal.`);
    if (item.statements.some((statement) => !statement.isImpostor && !statement.citation)) throw new Error(`impostor ${item.studyItemId} truths must each carry a citation.`);
    return;
  }
  if (item.itemType === "matching") {
    if (item.pairs.length < 3 || item.pairs.length > 4) throw new Error(`matching ${item.studyItemId} must have three or four pairs.`);
    if (item.pairs.some((pair) => !pair.citation)) throw new Error(`matching ${item.studyItemId} pairs must each carry a citation.`);
    return;
  }
  assertNever(item);
}

function toCitation(row: CitationRow): StudyItemCitation {
  return row.provenance === "source"
    ? { provenance: "source", sourceResourceId: row.source_resource_id!, sourceBlockId: row.source_block_id!, evidenceQuote: row.evidence_quote!, matchKind: row.match_kind! }
    : { provenance: "generated", derivedNodeId: row.derived_node_id!, passageText: row.generated_passage_text! };
}

function toImpostorStatement(row: ImpostorStatementRow): ImpostorStatement {
  if (row.is_impostor) {
    return {
      statementId: row.impostor_statement_id,
      ordinal: row.ordinal,
      text: row.statement_text,
      isImpostor: true,
      provenance: "generated",
      reveal: row.reveal_text ?? "",
      lieSource: (row.lie_source ?? "generated") as "sibling" | "generated",
      ...(row.sibling_label ? { siblingLabel: row.sibling_label } : {})
    };
  }
  const citation: StudyItemCitation = row.provenance === "source"
    ? { provenance: "source", sourceResourceId: row.source_resource_id!, sourceBlockId: row.source_block_id!, evidenceQuote: row.evidence_quote!, matchKind: row.match_kind! }
    : { provenance: "generated", derivedNodeId: row.derived_node_id!, passageText: row.generated_passage_text! };
  return {
    statementId: row.impostor_statement_id,
    ordinal: row.ordinal,
    text: row.statement_text,
    isImpostor: false,
    provenance: row.provenance,
    citation
  };
}

function toMatchingPair(row: MatchingPairRow): MatchingPair {
  const citation: StudyItemCitation = row.provenance === "source"
    ? { provenance: "source", sourceResourceId: row.source_resource_id!, sourceBlockId: row.source_block_id!, evidenceQuote: row.evidence_quote!, matchKind: row.match_kind! }
    : { provenance: "generated", derivedNodeId: row.derived_node_id!, passageText: row.generated_passage_text! };
  return {
    pairId: row.matching_pair_id,
    matchId: row.match_tile_id,
    promptText: row.prompt_text,
    matchText: row.match_text,
    citation
  };
}

function assertNever(value: never): never {
  throw new Error(`unsupported study item type: ${String((value as { itemType?: string }).itemType)}`);
}

export type StudyItemRow = {
  study_item_id: string;
  item_type: StudyItemType;
  graph_version_id: string | null;
  enrichment_id: string;
  derived_node_id: string;
  grounding_provenance: string;
  question: string;
  explanation: string | null;
  facet: string | null;
  explorable_terms: string[];
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
  match_kind: "exact" | "normalized" | null;
  derived_node_id: string | null;
  generated_passage_text: string | null;
};

type MatchingPairRow = {
  matching_pair_id: string;
  match_tile_id: string;
  study_item_id: string;
  ordinal: number;
  prompt_text: string;
  match_text: string;
  provenance: "source" | "generated";
  source_resource_id: string | null;
  source_block_id: string | null;
  evidence_quote: string | null;
  match_kind: "exact" | "normalized" | null;
  derived_node_id: string | null;
  generated_passage_text: string | null;
};

type ImpostorStatementRow = {
  impostor_statement_id: string;
  study_item_id: string;
  ordinal: number;
  statement_text: string;
  is_impostor: boolean;
  provenance: "source" | "generated";
  source_resource_id: string | null;
  source_block_id: string | null;
  evidence_quote: string | null;
  match_kind: "exact" | "normalized" | null;
  derived_node_id: string | null;
  generated_passage_text: string | null;
  reveal_text: string | null;
  lie_source: "sibling" | "generated" | null;
  sibling_label: string | null;
};

const CONCEPT_LESSON_PRODUCER = "@lrnki/infrastructure-postgres";
const CONCEPT_LESSON_PRODUCER_VERSION = "0.1.0";

// Concept Lesson persistence (ADR-0031, R1/R3/R9). Normalized `concept_lessons` +
// `concept_lesson_sections` + `concept_lesson_section_citations` are the query surface;
// the immutable `concept_lesson_bank` artifact is the inspection trace the
// `artifact_concept_lessons` JSON_TABLE view flattens. `persist` writes them all — plus
// the `lesson_absent_nodes` — in ONE transaction, so there is never authoritative
// relational state without its artifact (mirrors PostgresStudyItemBankStore). Lessons are
// a learner-NEUTRAL derived asset: regeneration is replace-by-enrichment (delete-then-
// insert), never a mutation of learner state and never a write to the asserted graph (R9).
// Layer-purpose persistence (plan 2026-07-10-001 U1): one plain-register row per
// enrichment; regeneration upserts, absence is the fail-open template state.
export class PostgresEnrichmentLayerPurposeStore implements EnrichmentLayerPurposeStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: { enrichmentId: string; purpose: string }): Promise<void> {
    await this.sql`
      INSERT INTO enrichment_layer_purposes (enrichment_id, purpose)
      VALUES (${input.enrichmentId}, ${input.purpose})
      ON CONFLICT (enrichment_id) DO UPDATE SET purpose = EXCLUDED.purpose, created_at = now()`;
  }

  async get(enrichmentId: string): Promise<string | undefined> {
    const rows = await this.sql<{ purpose: string }[]>`
      SELECT purpose FROM enrichment_layer_purposes WHERE enrichment_id = ${enrichmentId}`;
    return rows[0]?.purpose;
  }
}

export class PostgresConceptLessonStore implements ConceptLessonStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: { graphVersionId: string | null; enrichmentId: string; configHash: string; lessons: ConceptLesson[]; absent: LessonAbsentNode[] }): Promise<void> {
    const { graphVersionId, enrichmentId, configHash, lessons, absent } = input;
    await this.sql.begin(async (tx) => {
      // Regeneration is replay, not mutation: retain prior lessons and their child rows as
      // pinned history, retire only the current generation, and replace unreferenced absences.
      await tx`UPDATE concept_lessons SET superseded_at = now() WHERE enrichment_id = ${enrichmentId} AND superseded_at IS NULL`;
      await tx`DELETE FROM lesson_absent_nodes WHERE enrichment_id = ${enrichmentId}`;
      for (const node of absent) {
        await tx`
          INSERT INTO lesson_absent_nodes (lesson_absent_node_id, graph_version_id, enrichment_id, derived_node_id, reason, config_hash)
          VALUES (${randomUUID()}, ${graphVersionId}, ${enrichmentId}, ${node.derivedNodeId}, ${node.reason}, ${configHash})`;
      }
      for (const lesson of lessons) {
        await tx`
          INSERT INTO concept_lessons (concept_lesson_id, graph_version_id, enrichment_id, derived_node_id, canonical_label, explorable_terms, generating_model, config_hash)
          VALUES (${lesson.conceptLessonId}, ${lesson.graphVersionId}, ${lesson.enrichmentId}, ${lesson.derivedNodeId}, ${lesson.canonicalLabel}, ${this.sql.json(lesson.explorableTerms)}, ${lesson.generatingModel}, ${lesson.configHash})`;
        for (const [ordinal, section] of lesson.sections.entries()) {
          const sectionId = randomUUID();
          await tx`
            INSERT INTO concept_lesson_sections (concept_lesson_section_id, concept_lesson_id, ordinal, kind, body_text, items, grounding_provenance, diagram_caption, diagram_spec)
            VALUES (${sectionId}, ${lesson.conceptLessonId}, ${ordinal}, ${section.kind}, ${section.text}, ${section.items ?? null}, ${section.groundingProvenance}, ${section.diagram?.caption ?? null}, ${section.diagram?.spec ?? null})`;
          if (section.citation) await this.insertCitation(tx, sectionId, section.citation);
        }
      }

      const artifact: ArtifactEnvelope<{ graphVersionId: string | null; enrichmentId: string; lessons: ConceptLesson[]; absent: LessonAbsentNode[] }> = {
        artifactId: randomUUID(),
        artifactType: "concept_lesson_bank",
        ...(graphVersionId ? { graphVersionId } : {}),
        producer: CONCEPT_LESSON_PRODUCER,
        producerVersion: CONCEPT_LESSON_PRODUCER_VERSION,
        configHash,
        createdAt: new Date().toISOString(),
        payload: { graphVersionId, enrichmentId, lessons, absent }
      };
      await writeArtifactEnvelope(tx, artifact);
    });
  }

  private async insertCitation(tx: Sql | TransactionSql, sectionId: string, citation: StudyItemCitation): Promise<void> {
    if (citation.provenance === "source") {
      await tx`
        INSERT INTO concept_lesson_section_citations (concept_lesson_section_citation_id, concept_lesson_section_id, provenance, source_resource_id, source_block_id, evidence_quote, match_kind)
        VALUES (${randomUUID()}, ${sectionId}, 'source', ${citation.sourceResourceId}, ${citation.sourceBlockId}, ${citation.evidenceQuote}, ${citation.matchKind})`;
    } else {
      await tx`
        INSERT INTO concept_lesson_section_citations (concept_lesson_section_citation_id, concept_lesson_section_id, provenance, derived_node_id, generated_passage_text)
        VALUES (${randomUUID()}, ${sectionId}, 'generated', ${citation.derivedNodeId}, ${citation.passageText})`;
    }
  }

  async getLesson(derivedNodeId: string): Promise<ConceptLesson | undefined> {
    const rows = await this.sql<LessonRow[]>`
      SELECT concept_lesson_id, graph_version_id, enrichment_id, derived_node_id, canonical_label, explorable_terms, generating_model, config_hash
      FROM concept_lessons WHERE derived_node_id = ${derivedNodeId} AND superseded_at IS NULL LIMIT 1`;
    if (rows.length === 0) return undefined;
    const [lesson] = await hydrateConceptLessonRows(this.sql, rows);
    return lesson;
  }

  async listLessonsForEnrichment(enrichmentId: string): Promise<ConceptLesson[]> {
    const rows = await this.sql<LessonRow[]>`
      SELECT concept_lesson_id, graph_version_id, enrichment_id, derived_node_id, canonical_label, explorable_terms, generating_model, config_hash
      FROM concept_lessons WHERE enrichment_id = ${enrichmentId} AND superseded_at IS NULL ORDER BY derived_node_id`;
    return hydrateConceptLessonRows(this.sql, rows);
  }

  async listAbsentForEnrichment(enrichmentId: string): Promise<LessonAbsentNode[]> {
    const rows = await this.sql<{ derived_node_id: string; canonical_label: string; reason: string }[]>`
      SELECT lan.derived_node_id, dgn.canonical_label, lan.reason
      FROM lesson_absent_nodes lan
      JOIN derived_graph_nodes dgn ON dgn.derived_node_id = lan.derived_node_id
      WHERE lan.enrichment_id = ${enrichmentId} ORDER BY lan.derived_node_id`;
    return rows.map((row) => ({ derivedNodeId: row.derived_node_id, canonicalLabel: row.canonical_label, reason: row.reason }));
  }

}

// Shared row stitch for ordinary current reads and the learner-scoped pinned-reference adapter.
// This helper applies no currentness policy; callers own the selecting query.
export async function hydrateConceptLessonRows(sql: Sql, rows: LessonRow[]): Promise<ConceptLesson[]> {
    if (rows.length === 0) return [];
    const lessonIds = rows.map((row) => row.concept_lesson_id);
    const sectionRows = await sql<LessonSectionRow[]>`
      SELECT concept_lesson_section_id, concept_lesson_id, ordinal, kind, body_text, items, grounding_provenance, diagram_caption, diagram_spec
      FROM concept_lesson_sections WHERE concept_lesson_id IN ${sql(lessonIds)}
      ORDER BY concept_lesson_id, ordinal`;
    const sectionIds = sectionRows.map((row) => row.concept_lesson_section_id);
    const citationRows = sectionIds.length
      ? await sql<LessonCitationRow[]>`
          SELECT concept_lesson_section_id, provenance, source_resource_id, source_block_id, evidence_quote, match_kind, derived_node_id, generated_passage_text
          FROM concept_lesson_section_citations WHERE concept_lesson_section_id IN ${sql(sectionIds)}`
      : [];

    const citationBySection = new Map<string, LessonCitationRow>();
    for (const citation of citationRows) citationBySection.set(citation.concept_lesson_section_id, citation);
    const sectionsByLesson = new Map<string, LessonSectionRow[]>();
    for (const section of sectionRows) {
      sectionsByLesson.set(section.concept_lesson_id, [...(sectionsByLesson.get(section.concept_lesson_id) ?? []), section]);
    }

    return rows.map((row) => ({
      conceptLessonId: row.concept_lesson_id,
      derivedNodeId: row.derived_node_id,
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      generatingModel: row.generating_model,
      configHash: row.config_hash,
      canonicalLabel: row.canonical_label,
      sections: (sectionsByLesson.get(row.concept_lesson_id) ?? []).map((section): ConceptLessonSection => {
        const citationRow = citationBySection.get(section.concept_lesson_section_id);
        const base: ConceptLessonSection = {
          kind: section.kind,
          text: section.body_text,
          groundingProvenance: section.grounding_provenance as ConceptLessonSection["groundingProvenance"]
        };
        if (section.items?.length) base.items = section.items;
        if (citationRow) base.citation = toCitation(citationRow as unknown as CitationRow);
        if (section.diagram_caption !== null && section.diagram_spec !== null) {
          base.diagram = { caption: section.diagram_caption, spec: section.diagram_spec };
        }
        return base;
      }),
      explorableTerms: row.explorable_terms ?? []
    }));
}

export type LessonRow = {
  concept_lesson_id: string;
  graph_version_id: string | null;
  enrichment_id: string;
  derived_node_id: string;
  canonical_label: string;
  explorable_terms: ConceptLesson["explorableTerms"];
  generating_model: string;
  config_hash: string;
};

type LessonSectionRow = {
  concept_lesson_section_id: string;
  concept_lesson_id: string;
  ordinal: number;
  kind: ConceptLessonSection["kind"];
  body_text: string;
  items: string[] | null;
  grounding_provenance: string;
  diagram_caption: string | null;
  diagram_spec: string | null;
};

type LessonCitationRow = {
  concept_lesson_section_id: string;
  provenance: "source" | "generated";
  source_resource_id: string | null;
  source_block_id: string | null;
  evidence_quote: string | null;
  match_kind: "exact" | "normalized" | null;
  derived_node_id: string | null;
  generated_passage_text: string | null;
};

// Calibration Verdict persistence (R10, KTD1). The MUTABLE store: `upsert` writes the
// current `known`/`learn` intent, overwriting any prior verdict for the node (one row,
// not two) via ON CONFLICT on the (learner, node) primary key; `delete` reverses a
// single node's verdict (R7); `clearLearner` is the verdict half of the per-learner
// reset (R16). No evidence weights, no append-only seeding — a verdict is current intent.
export class PostgresCalibrationVerdictStore implements CalibrationVerdictStorePort {
  constructor(private readonly sql: Sql) {}

  async upsert(verdict: { learnerStateRef: string; derivedNodeId: string; verdict: CalibrationVerdict["verdict"] }): Promise<void> {
    await this.sql`
      INSERT INTO calibration_verdicts (learner_state_ref, derived_node_id, verdict, updated_at)
      VALUES (${verdict.learnerStateRef}, ${verdict.derivedNodeId}, ${verdict.verdict}, now())
      ON CONFLICT (learner_state_ref, derived_node_id)
      DO UPDATE SET verdict = EXCLUDED.verdict, updated_at = now()`;
  }

  async delete(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void> {
    await this.sql`
      DELETE FROM calibration_verdicts
      WHERE learner_state_ref = ${input.learnerStateRef} AND derived_node_id = ${input.derivedNodeId}`;
  }

  async listForLearner(learnerStateRef: string): Promise<CalibrationVerdict[]> {
    const rows = await this.sql<{ learner_state_ref: string; derived_node_id: string; verdict: string; updated_at: string }[]>`
      SELECT learner_state_ref, derived_node_id, verdict, updated_at
      FROM calibration_verdicts WHERE learner_state_ref = ${learnerStateRef}
      ORDER BY derived_node_id`;
    return rows.map((row) => ({
      learnerStateRef: row.learner_state_ref,
      derivedNodeId: row.derived_node_id,
      verdict: row.verdict as CalibrationVerdict["verdict"],
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  async clearLearner(learnerStateRef: string): Promise<void> {
    await this.sql`DELETE FROM calibration_verdicts WHERE learner_state_ref = ${learnerStateRef}`;
  }
}

export class PostgresLessonReadStore implements LessonReadStorePort {
  constructor(private readonly sql: Sql) {}

  async markRead(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void> {
    await this.sql`
      INSERT INTO lesson_reads (learner_state_ref, derived_node_id)
      VALUES (${input.learnerStateRef}, ${input.derivedNodeId})
      ON CONFLICT (learner_state_ref, derived_node_id) DO NOTHING`;
  }

  async listForLearner(learnerStateRef: string): Promise<{ learnerStateRef: string; derivedNodeId: string; firstReadAt: string }[]> {
    const rows = await this.sql<{ learner_state_ref: string; derived_node_id: string; first_read_at: string }[]>`
      SELECT learner_state_ref, derived_node_id, first_read_at
      FROM lesson_reads
      WHERE learner_state_ref = ${learnerStateRef}
      ORDER BY derived_node_id`;
    return rows.map((row) => ({
      learnerStateRef: row.learner_state_ref,
      derivedNodeId: row.derived_node_id,
      firstReadAt: new Date(row.first_read_at).toISOString()
    }));
  }
}

// Response Log persistence (R4–R6). APPEND + READ only — there is no update or delete
// method, so the append-only guarantee is structural. The log is graded-only (R18);
// the DB CHECK keeps every row outcome-coherent; this store never reshapes a row, it
// only inserts.
export class PostgresResponseLogStore implements ResponseLogStorePort {
  constructor(private readonly sql: Sql) {}

  // The store — not the caller — assigns each row's monotonic per-learner `attempt_seq`.
  // Per learner we take a transaction-scoped advisory lock keyed on `learner_state_ref`
  // BEFORE reading `MAX(attempt_seq)+1`, so concurrent same-learner appends serialize on
  // the lock instead of racing the read-compute-write (a bare `MAX+1` in-INSERT does not
  // help: under READ COMMITTED each snapshot hides the other's uncommitted row). Different
  // learners hash to different lock keys and never contend; the lock auto-releases at
  // transaction end. The `(learner_state_ref, attempt_seq)` UNIQUE stays as a backstop.
  async append(rows: NewResponseLogRow[]): Promise<void> {
    if (rows.length === 0) return;
    const byLearner = new Map<string, NewResponseLogRow[]>();
    for (const row of rows) {
      const group = byLearner.get(row.learnerStateRef);
      if (group) group.push(row);
      else byLearner.set(row.learnerStateRef, [row]);
    }
    await this.sql.begin(async (tx) => {
      for (const [learnerStateRef, learnerRows] of byLearner) {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${learnerStateRef}, 0))`;
        const [{ next }] = await tx<{ next: number }[]>`
          SELECT COALESCE(MAX(attempt_seq), 0) + 1 AS next
          FROM response_log WHERE learner_state_ref = ${learnerStateRef}`;
        let attemptSeq = Number(next);
        for (const row of learnerRows) {
          // Discriminated subject (KTD4): a neutral row writes the study_item_id + derived_node_id
          // pair; a scaffold row writes scaffold_step_id only. The DB CHECK enforces exactly-one.
          const studyItemId = row.scope === "neutral" ? row.studyItemId : null;
          const derivedNodeId = row.scope === "neutral" ? row.derivedNodeId : null;
          const scaffoldStepId = row.scope === "scaffold" ? row.scaffoldStepId : null;
          await tx`
            INSERT INTO response_log (
              response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id, signal_type,
              judged_outcome, graded_score,
              response_source, grader_identity, batch_id, attempt_seq, submitted_answer
            )
            VALUES (
              ${row.responseId}, ${row.learnerStateRef}, ${studyItemId}, ${derivedNodeId}, ${scaffoldStepId}, ${row.signalType},
              ${row.judgedOutcome}, ${row.gradedScore},
              ${row.responseSource}, ${row.graderIdentity}, ${row.batchId}, ${attemptSeq}, ${row.submittedAnswer}
            )`;
          attemptSeq += 1;
        }
      }
    });
  }

  async listForLearner(learnerStateRef: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id, signal_type,
             judged_outcome, graded_score,
             response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
      FROM response_log WHERE learner_state_ref = ${learnerStateRef} ORDER BY attempt_seq`;
    return rows.map(hydrateResponseLogRow);
  }

  async listForLearnerNode(learnerStateRef: string, derivedNodeId: string): Promise<ResponseLogRow[]> {
    const rows = await this.sql<ResponseLogDbRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id, signal_type,
             judged_outcome, graded_score,
             response_source, grader_identity, batch_id, attempt_seq, submitted_answer, created_at
      FROM response_log WHERE learner_state_ref = ${learnerStateRef} AND derived_node_id = ${derivedNodeId} ORDER BY attempt_seq`;
    return rows.map(hydrateResponseLogRow);
  }
}

type ResponseLogDbRow = {
  response_id: string;
  learner_state_ref: string;
  study_item_id: string | null;
  derived_node_id: string | null;
  scaffold_step_id: string | null;
  signal_type: string;
  judged_outcome: string | null;
  graded_score: number | null;
  response_source: string;
  grader_identity: string | null;
  batch_id: string | null;
  attempt_seq: number;
  submitted_answer: string | null;
  created_at: string;
};

function hydrateResponseLogRow(row: ResponseLogDbRow): ResponseLogRow {
  // Rebuild the discriminated subject (KTD4) from the mutually-exclusive columns.
  const subject = row.scaffold_step_id !== null
    ? { scope: "scaffold" as const, scaffoldStepId: row.scaffold_step_id }
    : { scope: "neutral" as const, studyItemId: row.study_item_id as string, derivedNodeId: row.derived_node_id as string };
  return {
    ...subject,
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    signalType: row.signal_type as ResponseLogRow["signalType"],
    judgedOutcome: row.judged_outcome as ResponseLogRow["judgedOutcome"],
    gradedScore: row.graded_score === null ? null : Number(row.graded_score),
    responseSource: row.response_source as ResponseLogRow["responseSource"],
    graderIdentity: row.grader_identity,
    batchId: row.batch_id,
    attemptSeq: Number(row.attempt_seq),
    submittedAnswer: row.submitted_answer,
    createdAt: new Date(row.created_at).toISOString()
  };
}
