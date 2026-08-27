import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  createAcceptedPathPackageModule,
  qualifiedSourceExpeditionAssetConfigHash
} from "@lrnki/application";
import { studyItemBankConfigHash } from "@lrnki/infrastructure-litellm";
import {
  PostgresAcceptedPathPackageStore,
  PostgresSourceExpeditionCatalog,
  createDatabaseClient,
  installAcceptedPathGlobalProjections,
  parseCanonicalAcceptedPathPackage,
  publishAcceptedPathCatalogProjections,
  serializeAcceptedPathPackage
} from "@lrnki/infrastructure-postgres";
import type { AcceptedPathPackageStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;
const repoRoot = path.resolve(import.meta.dirname, "../../..");

maybe("a sealed accepted path round-trips byte-for-byte through lrnki_test without learner or model state", async () => {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required.");
  if (decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) !== "lrnki_test") {
    throw new Error("Accepted package integration may target only lrnki_test.");
  }
  const text = await readFile(
    path.join(repoRoot, "fixtures/accepted-paths/packages/critical-thinking.json"),
    "utf8"
  );
  const acceptedPackage = parseCanonicalAcceptedPathPackage(text).package;
  const sql = createDatabaseClient(databaseUrl);
  const rollback = new Error("rollback accepted package round-trip");
  try {
    await assert.rejects(
      sql.begin(async (tx) => {
        const transactionSql = tx as unknown as Sql;
        const sourceExpeditions = createLearnerSourceExpeditions(
          transactionSql,
          CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
        );
        let catalogWasEmptyBeforePublish = false;
        const transactionStore: AcceptedPathPackageStorePort = {
          async exportAccepted(input) {
            return new PostgresAcceptedPathPackageStore(transactionSql).exportAccepted(input);
          },
          async installGlobalProjections(packages) {
            await installAcceptedPathGlobalProjections(tx, packages);
          },
          async publishCatalogProjections(packages) {
            const rows = await tx<{ count: number }[]>`
              SELECT count(*)::int AS count
              FROM source_expedition_catalog_entries
              WHERE catalog_key = ${acceptedPackage.catalog.catalogKey}`;
            catalogWasEmptyBeforePublish = rows[0].count === 0;
            await publishAcceptedPathCatalogProjections(tx, packages);
          }
        };
        const qualifiedAssetConfigHash = qualifiedSourceExpeditionAssetConfigHash(
          studyItemBankConfigHash()
        );
        const packageModule = createAcceptedPathPackageModule({
          sourceExpeditions,
          catalog: new PostgresSourceExpeditionCatalog(transactionSql),
          packageStore: transactionStore,
          qualifiedAssetConfigHash
        });
        const installed = await packageModule.install([acceptedPackage]);
        assert.equal(catalogWasEmptyBeforePublish, true);
        assert.deepEqual(installed.catalogKeys, ["critical-thinking"]);
        assert.equal(installed.sourceCount, 1);

        const learnerRows = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM learner_expeditions
          WHERE enrichment_id = ${acceptedPackage.catalog.enrichmentId}`;
        assert.equal(learnerRows[0].count, 0);
        const operationRows = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM operation_runs
          WHERE operation_id IN (
            ${acceptedPackage.catalog.enrichmentId}::uuid,
            ${(acceptedPackage.projection as { tables: { graph_versions: Array<{ graph_version_id: string }> } }).tables.graph_versions[0].graph_version_id}::uuid
          )`;
        assert.equal(operationRows[0].count, 0);

        const exported = await packageModule.exportAccepted({
          catalogKey: acceptedPackage.catalog.catalogKey,
          source: acceptedPackage.source
        });
        assert.equal(serializeAcceptedPathPackage(exported), text);
        throw rollback;
      }),
      (error) => error === rollback
    );
  } finally {
    await sql.end();
  }
});
