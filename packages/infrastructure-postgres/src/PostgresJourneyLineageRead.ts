import type { JourneyLineage, JourneyLineageReadPort } from "@lrnki/ports";
import type { Sql } from "postgres";

export class PostgresJourneyLineageRead implements JourneyLineageReadPort {
  constructor(private readonly sql: Sql) {}

  async resolveJourney(enrichmentId: string): Promise<JourneyLineage | undefined> {
    const headers = await this.sql<{ graph_version_id: string }[]>`
      SELECT graph_version_id
      FROM graph_enrichments
      WHERE enrichment_id = ${enrichmentId}
      LIMIT 1`;
    const header = headers[0];
    if (!header) return undefined;

    const memberships = await this.sql<{ run_id: string }[]>`
      SELECT run_id
      FROM graph_version_run_memberships
      WHERE graph_version_id = ${header.graph_version_id}
      ORDER BY run_id`;

    return {
      enrichmentId,
      graphVersionId: header.graph_version_id,
      extractionRunIds: memberships.map((row) => row.run_id)
    };
  }
}
