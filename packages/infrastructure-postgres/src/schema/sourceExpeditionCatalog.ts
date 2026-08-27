import { sql } from "drizzle-orm";
import type { SourceExpeditionSourceProvenance } from "@lrnki/ports";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { graphEnrichments } from "./derivedGraph.js";

export const sourceExpeditionCatalogEntries = pgTable(
  "source_expedition_catalog_entries",
  {
    catalogKey: text("catalog_key").primaryKey().notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    title: text("title").notNull(),
    teaser: text("teaser").notNull(),
    catalogRole: text("catalog_role").notNull(),
    audience: text("audience").notNull(),
    sortOrder: integer("sort_order").notNull(),
    sourceProvenance: jsonb("source_provenance")
      .$type<SourceExpeditionSourceProvenance>()
      .notNull(),
    acceptedAssetSetIdentity: text("accepted_asset_set_identity").notNull(),
    acceptedAssetConfigHash: text("accepted_asset_config_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "source_expedition_catalog_entries_enrichment_id_fkey"
    }),
    unique("source_expedition_catalog_entries_enrichment_id_key").on(table.enrichmentId),
    unique("source_expedition_catalog_entries_sort_order_key").on(table.sortOrder),
    check(
      "source_expedition_catalog_entries_nonempty_check",
      sql`catalog_key <> '' AND title <> '' AND teaser <> '' AND catalog_role <> '' AND audience <> '' AND accepted_asset_set_identity <> '' AND accepted_asset_config_hash <> ''`
    ),
    check("source_expedition_catalog_entries_sort_order_check", sql`sort_order > 0`)
  ]
);
