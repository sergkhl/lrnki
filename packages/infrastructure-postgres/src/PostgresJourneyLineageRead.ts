import { CONCEPT_CANONICALIZATION_SELECTION_DECISION_TYPE } from "@lrnki/domain-core";
import type { JourneyDisplay, JourneyLineage, JourneyLineageReadPort } from "@lrnki/ports";
import type { Sql } from "postgres";

export class PostgresJourneyLineageRead implements JourneyLineageReadPort {
  constructor(private readonly sql: Sql) {}

  async resolveJourney(enrichmentId: string): Promise<JourneyLineage | undefined> {
    const headers = await this.sql<{
      graph_version_id: string | null;
      canonicalization_operation_id: string | null;
    }[]>`
      SELECT ge.graph_version_id,
             (
               SELECT rd.subject->>'artifactId'
               FROM refinement_decisions rd
               WHERE rd.graph_version_id = ge.graph_version_id
                 AND rd.decision_type = ${CONCEPT_CANONICALIZATION_SELECTION_DECISION_TYPE}
               ORDER BY rd.refinement_decision_id
               LIMIT 1
             ) AS canonicalization_operation_id
      FROM graph_enrichments ge
      WHERE ge.enrichment_id = ${enrichmentId}
      LIMIT 1`;
    const header = headers[0];
    if (!header) return undefined;

    const memberships = header.graph_version_id
      ? await this.sql<{ run_id: string }[]>`
          SELECT run_id
          FROM graph_version_run_memberships
          WHERE graph_version_id = ${header.graph_version_id}
          ORDER BY run_id`
      : [];

    return {
      enrichmentId,
      graphVersionId: header.graph_version_id,
      canonicalizationOperationId: header.canonicalization_operation_id,
      extractionRunIds: memberships.map((row) => row.run_id)
    };
  }

  async resolveJourneyDisplay(enrichmentIds: string[]): Promise<JourneyDisplay[]> {
    if (enrichmentIds.length === 0) return [];
    const rows = await this.sql<{
      enrichment_id: string;
      graph_version_id: string | null;
      expedition_title: string | null;
      source_title: string | null;
    }[]>`
      SELECT ge.enrichment_id, ge.graph_version_id, expedition.title AS expedition_title, sources.title AS source_title
      FROM graph_enrichments ge
      LEFT JOIN LATERAL (
        SELECT le.title
        FROM learner_expeditions le
        WHERE le.enrichment_id = ge.enrichment_id
        ORDER BY le.active DESC, le.updated_at DESC
        LIMIT 1
      ) expedition ON true
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT sr.title, ', ' ORDER BY sr.title) AS title
        FROM graph_version_run_memberships gm
        JOIN source_resources sr ON sr.source_resource_id = gm.source_resource_id
        WHERE gm.graph_version_id = ge.graph_version_id
      ) sources ON true
      WHERE ge.enrichment_id::text = ANY(${enrichmentIds})`;

    return rows.map((row) => ({
      enrichmentId: row.enrichment_id,
      kind: row.expedition_title !== null || row.graph_version_id === null ? "synthetic" : "document",
      title: row.expedition_title ?? row.source_title
    }));
  }
}
