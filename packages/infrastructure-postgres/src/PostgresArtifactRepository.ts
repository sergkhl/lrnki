import type { ArtifactEnvelope } from "@lrnki/domain-core";
import type { ArtifactRepositoryPort } from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";

export async function writeArtifactEnvelope<TPayload>(
  sql: Sql | TransactionSql,
  artifact: ArtifactEnvelope<TPayload>
): Promise<void> {
  await sql`
    INSERT INTO artifact_versions (artifact_id, artifact_type, schema_version, run_id, graph_version_id, producer, producer_version, config_hash, payload)
    VALUES (${artifact.artifactId}, ${artifact.artifactType}, ${artifact.schemaVersion}, ${artifact.runId ?? null}, ${artifact.graphVersionId ?? null}, ${artifact.producer}, ${artifact.producerVersion}, ${artifact.configHash}, ${sql.json(artifact.payload as Parameters<Sql["json"]>[0])})
    ON CONFLICT (artifact_id) DO NOTHING`;
}

// Append-only immutable artifact envelopes (ADR-0003). Re-appending the same
// artifactId is a no-op: artifacts are immutable once written.
export class PostgresArtifactRepository implements ArtifactRepositoryPort {
  constructor(private readonly sql: Sql) {}

  async append<TPayload>(artifact: ArtifactEnvelope<TPayload>): Promise<void> {
    await writeArtifactEnvelope(this.sql, artifact);
  }
}
