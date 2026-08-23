import type {
  ArtifactEnvelope,
  ConceptCanonicalizationArtifact
} from "@lrnki/domain-core";
import type { ConceptCanonicalizationStorePort } from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";

export async function writeArtifactEnvelope<TPayload>(
  sql: Sql | TransactionSql,
  artifact: ArtifactEnvelope<TPayload>
): Promise<void> {
  await sql`
    INSERT INTO artifact_versions (artifact_id, artifact_type, run_id, graph_version_id, producer, producer_version, config_hash, payload, created_at)
    VALUES (${artifact.artifactId}, ${artifact.artifactType}, ${artifact.runId ?? null}, ${artifact.graphVersionId ?? null}, ${artifact.producer}, ${artifact.producerVersion}, ${artifact.configHash}, ${sql.json(artifact.payload as Parameters<Sql["json"]>[0])}, ${artifact.createdAt})
    ON CONFLICT (artifact_id) DO NOTHING`;
}

// The only direct artifact-store seam. Other operation stores write their own envelopes
// transactionally; Concept Canonicalization needs an independently inspectable append/read store.
export class PostgresConceptCanonicalizationStore
  implements ConceptCanonicalizationStorePort
{
  constructor(private readonly sql: Sql) {}

  async persist(
    artifact: ArtifactEnvelope<ConceptCanonicalizationArtifact>
  ): Promise<void> {
    await writeArtifactEnvelope(this.sql, artifact);
  }

  async getById(
    artifactId: string
  ): Promise<ArtifactEnvelope<ConceptCanonicalizationArtifact> | undefined> {
    const rows = await this.sql<{
      artifact_id: string;
      artifact_type: string;
      run_id: string | null;
      graph_version_id: string | null;
      producer: string;
      producer_version: string;
      config_hash: string;
      payload: ConceptCanonicalizationArtifact;
      created_at: string;
    }[]>`
      SELECT artifact_id, artifact_type, run_id, graph_version_id, producer, producer_version,
             config_hash, payload, created_at
      FROM artifact_versions
      WHERE artifact_id = ${artifactId}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return undefined;
    return {
      artifactId: row.artifact_id,
      artifactType: row.artifact_type,
      ...(row.run_id ? { runId: row.run_id } : {}),
      ...(row.graph_version_id ? { graphVersionId: row.graph_version_id } : {}),
      producer: row.producer,
      producerVersion: row.producer_version,
      configHash: row.config_hash,
      createdAt: row.created_at,
      payload: row.payload
    };
  }
}
