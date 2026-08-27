import type {
  PublishSourceExpeditionCatalogEntry,
  SourceExpeditionCatalogEntry,
  SourceExpeditionCatalogPort,
  SourceExpeditionSourceCredit,
  SourceExpeditionSourceProvenance
} from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";
import { currentSourceExpeditionAssetsMatch } from "./PostgresLearnerExpeditionStore";

type CatalogRow = {
  catalog_key: string;
  enrichment_id: string;
  title: string;
  teaser: string;
  catalog_role: string;
  audience: string;
  sort_order: number;
  source_provenance: unknown;
  accepted_asset_set_identity: string;
  accepted_asset_config_hash: string;
  created_at: string;
};

type SourceCreditRow = {
  enrichment_id: string;
  source_resource_id: string;
  title: string;
  source_uri: string | null;
  license: string | null;
};

export class PostgresSourceExpeditionCatalog implements SourceExpeditionCatalogPort {
  constructor(private readonly sql: Sql) {}

  async listAccepted(): Promise<SourceExpeditionCatalogEntry[]> {
    const rows = await this.sql<CatalogRow[]>`
      SELECT catalog_key, enrichment_id, title, teaser, catalog_role, audience, sort_order,
             source_provenance, accepted_asset_set_identity, accepted_asset_config_hash, created_at
      FROM source_expedition_catalog_entries
      ORDER BY sort_order, catalog_key`;
    return attachSourceCredits(this.sql, rows);
  }

  async getAcceptedByEnrichment(
    enrichmentId: string
  ): Promise<SourceExpeditionCatalogEntry | undefined> {
    const rows = await this.sql<CatalogRow[]>`
      SELECT catalog_key, enrichment_id, title, teaser, catalog_role, audience, sort_order,
             source_provenance, accepted_asset_set_identity, accepted_asset_config_hash, created_at
      FROM source_expedition_catalog_entries
      WHERE enrichment_id = ${enrichmentId}
      LIMIT 1`;
    return (await attachSourceCredits(this.sql, rows))[0];
  }

  async getAcceptedByCatalogKey(
    catalogKey: string
  ): Promise<SourceExpeditionCatalogEntry | undefined> {
    const rows = await this.sql<CatalogRow[]>`
      SELECT catalog_key, enrichment_id, title, teaser, catalog_role, audience, sort_order,
             source_provenance, accepted_asset_set_identity, accepted_asset_config_hash, created_at
      FROM source_expedition_catalog_entries
      WHERE catalog_key = ${catalogKey}
      LIMIT 1`;
    return (await attachSourceCredits(this.sql, rows))[0];
  }

  async publishAccepted(input: PublishSourceExpeditionCatalogEntry): Promise<
    | { published: true }
    | { published: false; refused: "accepted_asset_set_changed" }
  > {
    return this.sql.begin(async (tx) => {
      if (input.acceptedAssetSetIdentity !== input.expectedAssets.assetSetIdentity) {
        return { published: false as const, refused: "accepted_asset_set_changed" as const };
      }
      if (!await currentSourceExpeditionAssetsMatch(tx, input.enrichmentId, input.expectedAssets)) {
        return { published: false as const, refused: "accepted_asset_set_changed" as const };
      }
      const sourceCredits = await creditsForEnrichments(tx, [input.enrichmentId]);
      if ((sourceCredits.get(input.enrichmentId) ?? []).length === 0) {
        throw new Error("Accepted Source Expedition publication requires registered source credits.");
      }
      await tx`
        INSERT INTO source_expedition_catalog_entries (
          catalog_key, enrichment_id, title, teaser, catalog_role, audience, sort_order,
          source_provenance, accepted_asset_set_identity, accepted_asset_config_hash
        ) VALUES (
          ${input.catalogKey}, ${input.enrichmentId}, ${input.title}, ${input.teaser},
          ${input.catalogRole}, ${input.audience}, ${input.sortOrder},
          ${tx.json(input.sourceProvenance)}, ${input.acceptedAssetSetIdentity},
          ${input.acceptedAssetConfigHash}
        )
        ON CONFLICT (catalog_key) DO UPDATE SET
          enrichment_id = EXCLUDED.enrichment_id,
          title = EXCLUDED.title,
          teaser = EXCLUDED.teaser,
          catalog_role = EXCLUDED.catalog_role,
          audience = EXCLUDED.audience,
          sort_order = EXCLUDED.sort_order,
          source_provenance = EXCLUDED.source_provenance,
          accepted_asset_set_identity = EXCLUDED.accepted_asset_set_identity,
          accepted_asset_config_hash = EXCLUDED.accepted_asset_config_hash,
          created_at = now()`;
      return { published: true as const };
    });
  }
}

async function attachSourceCredits(
  sql: Sql | TransactionSql,
  rows: CatalogRow[]
): Promise<SourceExpeditionCatalogEntry[]> {
  const credits = await creditsForEnrichments(sql, rows.map((row) => row.enrichment_id));
  return rows.map((row) => ({
    catalogKey: row.catalog_key,
    enrichmentId: row.enrichment_id,
    title: row.title,
    teaser: row.teaser,
    catalogRole: row.catalog_role,
    audience: row.audience,
    sortOrder: row.sort_order,
    sourceProvenance: sourceProvenance(row.source_provenance),
    acceptedAssetSetIdentity: row.accepted_asset_set_identity,
    acceptedAssetConfigHash: row.accepted_asset_config_hash,
    sourceCredits: credits.get(row.enrichment_id) ?? [],
    createdAt: row.created_at
  }));
}

async function creditsForEnrichments(
  sql: Sql | TransactionSql,
  enrichmentIds: string[]
): Promise<Map<string, SourceExpeditionSourceCredit[]>> {
  if (enrichmentIds.length === 0) return new Map();
  const rows = await sql<SourceCreditRow[]>`
    SELECT DISTINCT ge.enrichment_id, sr.source_resource_id, sr.title, sr.source_uri, sr.license
    FROM graph_enrichments ge
    JOIN graph_version_run_memberships membership
      ON membership.graph_version_id = ge.graph_version_id
    JOIN source_resources sr
      ON sr.source_resource_id = membership.source_resource_id
    WHERE ge.enrichment_id::text = ANY(${enrichmentIds})
    ORDER BY ge.enrichment_id, sr.title, sr.source_resource_id`;
  const byEnrichment = new Map<string, SourceExpeditionSourceCredit[]>();
  for (const row of rows) {
    byEnrichment.set(row.enrichment_id, [
      ...(byEnrichment.get(row.enrichment_id) ?? []),
      {
        sourceResourceId: row.source_resource_id,
        title: row.title,
        sourceUri: row.source_uri,
        license: row.license
      }
    ]);
  }
  return byEnrichment;
}

function sourceProvenance(value: unknown): SourceExpeditionSourceProvenance {
  if (
    typeof value !== "object" || value === null ||
    !("authorship" in value) || typeof value.authorship !== "string" ||
    !("knowledgeBasis" in value) || typeof value.knowledgeBasis !== "string" ||
    !("externalClaimVerificationRequired" in value) ||
      typeof value.externalClaimVerificationRequired !== "boolean" ||
    !("acceptanceScope" in value) || typeof value.acceptanceScope !== "string"
  ) {
    throw new Error("Invalid Source Expedition source provenance row.");
  }
  return {
    authorship: value.authorship,
    knowledgeBasis: value.knowledgeBasis,
    externalClaimVerificationRequired: value.externalClaimVerificationRequired,
    acceptanceScope: value.acceptanceScope
  };
}
