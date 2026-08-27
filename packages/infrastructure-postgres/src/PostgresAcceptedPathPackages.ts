import { createHash } from "node:crypto";
import path from "node:path";
import type {
  AcceptedPathPackage,
  AcceptedPathPackageQualification,
  AcceptedPathPackageSource,
  AcceptedPathPackageStorePort,
  SourceExpeditionCatalogEntry
} from "@lrnki/ports";
import type { JSONValue, Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { currentSourceExpeditionAssetsMatch } from "./PostgresLearnerExpeditionStore";

export const ACCEPTED_PATH_PACKAGE_FORMAT = "lrnki.accepted-path-package.v1" as const;

export const ACCEPTED_PATH_PACKAGE_TABLES = [
  "source_resources",
  "source_documents",
  "source_blocks",
  "extraction_runs",
  "concept_candidates",
  "concept_candidate_mentions",
  "concept_admission_decisions",
  "run_concept_evidence_profiles",
  "run_evidence_passages",
  "run_optional_assertions",
  "run_optional_assertion_evidence",
  "graph_versions",
  "concepts",
  "graph_version_concepts",
  "graph_version_concept_aliases",
  "graph_version_run_memberships",
  "graph_version_concept_evidence_profiles",
  "graph_version_evidence_passages",
  "graph_version_optional_assertions",
  "graph_version_optional_assertion_evidence",
  "refinement_decisions",
  "artifact_versions",
  "graph_enrichments",
  "derived_graph_nodes",
  "enrichment_grounding_bundles",
  "enrichment_grounding_passages",
  "inferred_prerequisite_edges",
  "concept_difficulties",
  "rescue_dispositions",
  "minting_dispositions",
  "derived_node_merges",
  "enrichment_layer_purposes",
  "study_items",
  "study_item_options",
  "matching_pairs",
  "study_item_citations",
  "impostor_statements",
  "rejected_study_items",
  "concept_lessons",
  "concept_lesson_sections",
  "concept_lesson_section_citations",
  "lesson_absent_nodes",
  "source_expedition_catalog_entries"
] as const;

type PackageTableName = typeof ACCEPTED_PATH_PACKAGE_TABLES[number];
type JsonRow = Record<string, unknown>;
type PackageTables = Record<PackageTableName, JsonRow[]>;
type AcceptedPathPackageProjection = { tables: PackageTables };

const PACKAGE_INSERT_ORDER = ACCEPTED_PATH_PACKAGE_TABLES.filter(
  (table) => table !== "source_expedition_catalog_entries"
);

const PRIMARY_KEYS: Record<PackageTableName, string> = {
  source_resources: "source_resource_id",
  source_documents: "source_document_id",
  source_blocks: "source_block_id",
  extraction_runs: "run_id",
  concept_candidates: "concept_candidate_id",
  concept_candidate_mentions: "concept_candidate_mention_id",
  concept_admission_decisions: "concept_admission_decision_id",
  run_concept_evidence_profiles: "run_concept_evidence_profile_id",
  run_evidence_passages: "run_evidence_passage_id",
  run_optional_assertions: "run_optional_assertion_id",
  run_optional_assertion_evidence: "run_optional_assertion_evidence_id",
  graph_versions: "graph_version_id",
  concepts: "concept_id",
  graph_version_concepts: "graph_version_concept_id",
  graph_version_concept_aliases: "graph_version_concept_alias_id",
  graph_version_run_memberships: "graph_version_run_membership_id",
  graph_version_concept_evidence_profiles: "graph_version_concept_evidence_profile_id",
  graph_version_evidence_passages: "graph_version_evidence_passage_id",
  graph_version_optional_assertions: "graph_version_optional_assertion_id",
  graph_version_optional_assertion_evidence: "graph_version_optional_assertion_evidence_id",
  refinement_decisions: "refinement_decision_id",
  artifact_versions: "artifact_id",
  graph_enrichments: "enrichment_id",
  derived_graph_nodes: "derived_node_id",
  enrichment_grounding_bundles: "enrichment_grounding_bundle_id",
  enrichment_grounding_passages: "enrichment_grounding_passage_id",
  inferred_prerequisite_edges: "inferred_prerequisite_edge_id",
  concept_difficulties: "concept_difficulty_id",
  rescue_dispositions: "rescue_disposition_id",
  minting_dispositions: "minting_disposition_id",
  derived_node_merges: "derived_node_merge_id",
  enrichment_layer_purposes: "enrichment_id",
  study_items: "study_item_id",
  study_item_options: "option_id",
  matching_pairs: "matching_pair_id",
  study_item_citations: "study_item_citation_id",
  impostor_statements: "impostor_statement_id",
  rejected_study_items: "rejected_study_item_id",
  concept_lessons: "concept_lesson_id",
  concept_lesson_sections: "concept_lesson_section_id",
  concept_lesson_section_citations: "concept_lesson_section_citation_id",
  lesson_absent_nodes: "lesson_absent_node_id",
  source_expedition_catalog_entries: "catalog_key"
};

const rowSchema = z.record(z.string(), z.json());
const tableShape = Object.fromEntries(
  ACCEPTED_PATH_PACKAGE_TABLES.map((table) => [table, z.array(rowSchema)])
) as Record<PackageTableName, z.ZodArray<typeof rowSchema>>;
const nonEmpty = z.string().trim().min(1);
const sourceProvenanceSchema = z.object({
  authorship: nonEmpty,
  knowledgeBasis: nonEmpty,
  externalClaimVerificationRequired: z.boolean(),
  acceptanceScope: nonEmpty
}).strict();
const assetExpectationSchema = z.object({
  assetSetIdentity: nonEmpty,
  currentConceptLessonIds: z.array(nonEmpty).min(1),
  currentStudyItemIds: z.array(nonEmpty).min(1)
}).strict();

export const acceptedPathPackageSchema = z.object({
  format: z.literal(ACCEPTED_PATH_PACKAGE_FORMAT),
  catalog: z.object({
    catalogKey: nonEmpty,
    enrichmentId: z.uuid(),
    title: nonEmpty,
    teaser: nonEmpty,
    catalogRole: nonEmpty,
    audience: nonEmpty,
    sortOrder: z.number().int().positive(),
    sourceProvenance: sourceProvenanceSchema,
    acceptedAssetSetIdentity: nonEmpty,
    acceptedAssetConfigHash: nonEmpty
  }).strict(),
  source: z.object({
    fixtureId: nonEmpty,
    path: z.string().regex(/^fixtures\/accepted-paths\/sources\/[a-z0-9-]+\.md$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentType: nonEmpty,
    declaredDomain: nonEmpty,
    title: nonEmpty,
    sourceUri: nonEmpty,
    license: nonEmpty
  }).strict(),
  qualification: z.object({
    declaredDomain: nonEmpty,
    totalStopCount: z.number().int().min(3),
    trailNodeIds: z.array(z.uuid()).min(3),
    expectedAssets: assetExpectationSchema
  }).strict(),
  projection: z.object({
    tables: z.object(tableShape).strict()
  }).strict()
}).strict();

export class PostgresAcceptedPathPackageStore implements AcceptedPathPackageStorePort {
  constructor(private readonly sql: Sql) {}

  async exportAccepted(input: {
    catalogEntry: SourceExpeditionCatalogEntry;
    source: AcceptedPathPackageSource;
    qualification: AcceptedPathPackageQualification;
  }): Promise<AcceptedPathPackage> {
    const allTables = await readGlobalTables(this.sql);
    const projection = selectAcceptedPathProjection(allTables, input.catalogEntry.catalogKey);
    return parseAcceptedPathPackage({
      format: ACCEPTED_PATH_PACKAGE_FORMAT,
      catalog: {
        catalogKey: input.catalogEntry.catalogKey,
        enrichmentId: input.catalogEntry.enrichmentId,
        title: input.catalogEntry.title,
        teaser: input.catalogEntry.teaser,
        catalogRole: input.catalogEntry.catalogRole,
        audience: input.catalogEntry.audience,
        sortOrder: input.catalogEntry.sortOrder,
        sourceProvenance: input.catalogEntry.sourceProvenance,
        acceptedAssetSetIdentity: input.catalogEntry.acceptedAssetSetIdentity,
        acceptedAssetConfigHash: input.catalogEntry.acceptedAssetConfigHash
      },
      source: input.source,
      qualification: input.qualification,
      projection
    });
  }

  async installGlobalProjections(packages: readonly AcceptedPathPackage[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      await installAcceptedPathGlobalProjections(tx, packages);
    });
  }

  async publishCatalogProjections(packages: readonly AcceptedPathPackage[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      await publishAcceptedPathCatalogProjections(tx, packages);
    });
  }
}

export async function installAcceptedPathGlobalProjections(
  tx: TransactionSql,
  packages: readonly AcceptedPathPackage[]
): Promise<void> {
  const parsed = packages.map(parseAcceptedPathPackage);
  validateAcceptedPathPackageSet(parsed);
  const merged = mergePackageTables(parsed);
  for (const table of PACKAGE_INSERT_ORDER) {
    await insertJsonRows(tx, table, merged[table]);
  }
}

export async function publishAcceptedPathCatalogProjections(
  tx: TransactionSql,
  packages: readonly AcceptedPathPackage[]
): Promise<void> {
  const parsed = packages.map(parseAcceptedPathPackage);
  validateAcceptedPathPackageSet(parsed);
  for (const entry of parsed) {
    if (!await currentSourceExpeditionAssetsMatch(
      tx,
      entry.catalog.enrichmentId,
      entry.qualification.expectedAssets
    )) {
      throw new Error(
        `Accepted path ${JSON.stringify(entry.catalog.catalogKey)} changed before publication.`
      );
    }
  }
  const rows = parsed.flatMap((entry) => packageTables(entry).source_expedition_catalog_entries);
  await insertJsonRows(tx, "source_expedition_catalog_entries", rows);
}

export function parseAcceptedPathPackage(value: unknown): AcceptedPathPackage {
  const parsed = acceptedPathPackageSchema.parse(value) as AcceptedPathPackage;
  validateAcceptedPathPackage(parsed);
  return parsed;
}

export function parseCanonicalAcceptedPathPackage(text: string): {
  package: AcceptedPathPackage;
  sha256: string;
} {
  const parsed = parseAcceptedPathPackage(JSON.parse(text));
  const canonical = serializeAcceptedPathPackage(parsed);
  if (canonical !== text) throw new Error("Accepted path package is not canonical JSON.");
  return {
    package: parsed,
    sha256: createHash("sha256").update(text).digest("hex")
  };
}

export function serializeAcceptedPathPackage(value: AcceptedPathPackage): string {
  const parsed = parseAcceptedPathPackage(value);
  const canonical = canonicalPackageValue(parsed);
  return `${JSON.stringify(sortJsonKeys(canonical), null, 2)}\n`;
}

export function validateAcceptedPathPackageSet(packages: readonly AcceptedPathPackage[]): void {
  if (packages.length === 0) throw new Error("At least one accepted path package is required.");
  const parsed = packages.map(parseAcceptedPathPackage);
  requireUnique(parsed.map((entry) => entry.catalog.catalogKey), "catalog key");
  requireUnique(parsed.map((entry) => entry.catalog.enrichmentId), "enrichment id");
  requireUnique(parsed.map((entry) => entry.catalog.sortOrder), "catalog order");
  requireUnique(parsed.map((entry) => path.posix.basename(entry.source.path)), "source basename");

  const identitiesById = new Map<string, string>();
  const identitiesByIri = new Map<string, string>();
  const identitiesByLabelDomain = new Map<string, string>();
  const seenPrimaryKeys = new Map<string, string>();
  for (const entry of parsed) {
    for (const table of ACCEPTED_PATH_PACKAGE_TABLES) {
      for (const row of packageTables(entry)[table]) {
        const primaryKey = requiredScalar(row, PRIMARY_KEYS[table]);
        const identity = `${table}:${primaryKey}`;
        if (table !== "concepts") {
          const previous = seenPrimaryKeys.get(identity);
          if (previous) {
            throw new Error(
              `Accepted packages ${JSON.stringify(previous)} and ${JSON.stringify(entry.catalog.catalogKey)} share ${identity}.`
            );
          }
          seenPrimaryKeys.set(identity, entry.catalog.catalogKey);
        }
      }
    }
    for (const row of packageTables(entry).concepts) {
      const conceptId = requiredText(row, "concept_id");
      const iri = requiredText(row, "iri");
      const labelDomain = `${requiredText(row, "normalized_label")}\0${requiredText(row, "declared_domain")}`;
      const fullIdentity = canonicalJson(row);
      bindIdentity(identitiesById, conceptId, fullIdentity, "Concept id");
      bindIdentity(identitiesByIri, iri, conceptId, "Concept IRI");
      bindIdentity(identitiesByLabelDomain, labelDomain, conceptId, "Concept label/domain");
    }
  }
}

function validateAcceptedPathPackage(entry: AcceptedPathPackage): void {
  const tables = packageTables(entry);
  for (const table of ACCEPTED_PATH_PACKAGE_TABLES) {
    requireUnique(
      tables[table].map((row) => requiredScalar(row, PRIMARY_KEYS[table])),
      `${table} primary key`
    );
  }

  const catalogRow = onlyRow(tables.source_expedition_catalog_entries, "catalog entry");
  const enrichmentRow = onlyRow(tables.graph_enrichments, "graph enrichment");
  const graphRow = onlyRow(tables.graph_versions, "graph version");
  const membershipRow = onlyRow(tables.graph_version_run_memberships, "graph membership");
  const extractionRow = onlyRow(tables.extraction_runs, "extraction run");
  const sourceRow = onlyRow(tables.source_resources, "source resource");
  const documentRow = onlyRow(tables.source_documents, "source document");

  assertEqual(requiredText(catalogRow, "catalog_key"), entry.catalog.catalogKey, "catalog key");
  assertEqual(requiredText(catalogRow, "enrichment_id"), entry.catalog.enrichmentId, "catalog enrichment");
  assertEqual(requiredText(catalogRow, "title"), entry.catalog.title, "catalog title");
  assertEqual(requiredText(catalogRow, "teaser"), entry.catalog.teaser, "catalog teaser");
  assertEqual(requiredText(catalogRow, "catalog_role"), entry.catalog.catalogRole, "catalog role");
  assertEqual(requiredText(catalogRow, "audience"), entry.catalog.audience, "catalog audience");
  assertEqual(requiredNumber(catalogRow, "sort_order"), entry.catalog.sortOrder, "catalog order");
  assertEqual(
    requiredText(catalogRow, "accepted_asset_set_identity"),
    entry.catalog.acceptedAssetSetIdentity,
    "accepted asset identity"
  );
  assertEqual(
    requiredText(catalogRow, "accepted_asset_config_hash"),
    entry.catalog.acceptedAssetConfigHash,
    "accepted asset config"
  );
  if (canonicalJson(catalogRow.source_provenance) !== canonicalJson(entry.catalog.sourceProvenance)) {
    throw new Error("Catalog source provenance differs from the package header.");
  }

  const graphVersionId = requiredText(enrichmentRow, "graph_version_id");
  assertEqual(requiredText(enrichmentRow, "enrichment_id"), entry.catalog.enrichmentId, "enrichment id");
  assertEqual(requiredText(enrichmentRow, "status"), "succeeded", "enrichment status");
  assertEqual(requiredText(graphRow, "graph_version_id"), graphVersionId, "graph version id");
  if (graphRow.base_graph_version_id !== null) {
    throw new Error("Accepted path package must contain a standalone graph version.");
  }
  assertEqual(requiredText(graphRow, "status"), "published", "graph version status");
  assertEqual(requiredText(membershipRow, "graph_version_id"), graphVersionId, "membership graph");
  assertEqual(requiredText(membershipRow, "run_id"), requiredText(extractionRow, "run_id"), "membership run");
  assertEqual(
    requiredText(membershipRow, "source_resource_id"),
    requiredText(sourceRow, "source_resource_id"),
    "membership source"
  );
  assertEqual(
    requiredText(extractionRow, "source_document_id"),
    requiredText(documentRow, "source_document_id"),
    "extraction document"
  );
  assertEqual(requiredText(extractionRow, "status"), "succeeded", "extraction status");

  assertEqual(requiredText(sourceRow, "content_hash"), entry.source.contentHash, "source hash");
  assertEqual(requiredText(sourceRow, "content_type"), entry.source.contentType, "source content type");
  assertEqual(requiredText(sourceRow, "declared_domain"), entry.source.declaredDomain, "source domain");
  assertEqual(requiredText(sourceRow, "title"), entry.source.title, "source title");
  assertEqual(requiredText(sourceRow, "source_uri"), entry.source.sourceUri, "source URI");
  assertEqual(requiredText(sourceRow, "license"), entry.source.license, "source license");
  assertEqual(
    requiredText(sourceRow, "object_key"),
    `fixtures/${path.posix.basename(entry.source.path)}`,
    "source object key"
  );
  assertEqual(entry.qualification.declaredDomain, entry.source.declaredDomain, "qualification domain");

  validateForeignKeyClosure(tables);
  validateArtifacts(tables, graphVersionId, requiredText(extractionRow, "run_id"), entry.catalog.enrichmentId);
  validateQualificationRows(entry, tables, graphVersionId);
}

function validateQualificationRows(
  entry: AcceptedPathPackage,
  tables: PackageTables,
  graphVersionId: string
): void {
  const qualification = entry.qualification;
  requireUnique(qualification.trailNodeIds, "qualified trail node id");
  requireUnique(qualification.expectedAssets.currentConceptLessonIds, "qualified lesson id");
  requireUnique(qualification.expectedAssets.currentStudyItemIds, "qualified study item id");
  if (qualification.trailNodeIds.length !== qualification.totalStopCount) {
    throw new Error("Qualified trail count differs from its sealed node ids.");
  }
  if (qualification.expectedAssets.assetSetIdentity !== entry.catalog.acceptedAssetSetIdentity) {
    throw new Error("Qualification asset identity differs from the accepted catalog identity.");
  }
  const trail = new Set(qualification.trailNodeIds);
  const nodeById = indexRows(tables.derived_graph_nodes, "derived_node_id");
  for (const nodeId of trail) {
    const node = nodeById.get(nodeId);
    if (!node) throw new Error(`Qualified trail references missing node ${JSON.stringify(nodeId)}.`);
    if (node.grounding_origin === "llm_grounded") {
      throw new Error(`Qualified trail contains LLM-grounded node ${JSON.stringify(nodeId)}.`);
    }
  }

  const lessonById = indexRows(tables.concept_lessons, "concept_lesson_id");
  const lessonNodes = new Set<string>();
  for (const lessonId of qualification.expectedAssets.currentConceptLessonIds) {
    const row = lessonById.get(lessonId);
    if (!row || row.superseded_at !== null) throw new Error(`Qualified lesson ${JSON.stringify(lessonId)} is not current.`);
    assertEqual(requiredText(row, "graph_version_id"), graphVersionId, "qualified lesson graph");
    assertEqual(requiredText(row, "enrichment_id"), entry.catalog.enrichmentId, "qualified lesson enrichment");
    assertEqual(requiredText(row, "config_hash"), entry.catalog.acceptedAssetConfigHash, "qualified lesson config");
    const nodeId = requiredText(row, "derived_node_id");
    if (!trail.has(nodeId)) throw new Error(`Qualified lesson ${JSON.stringify(lessonId)} is off trail.`);
    lessonNodes.add(nodeId);
  }
  if (lessonNodes.size !== trail.size) throw new Error("Qualified lessons do not cover every trail node exactly once.");

  const itemById = indexRows(tables.study_items, "study_item_id");
  const itemNodes = new Set<string>();
  for (const itemId of qualification.expectedAssets.currentStudyItemIds) {
    const row = itemById.get(itemId);
    if (!row || row.superseded_at !== null) throw new Error(`Qualified study item ${JSON.stringify(itemId)} is not current.`);
    assertEqual(requiredText(row, "item_type"), "option_select", "qualified item type");
    assertEqual(requiredText(row, "graph_version_id"), graphVersionId, "qualified item graph");
    assertEqual(requiredText(row, "enrichment_id"), entry.catalog.enrichmentId, "qualified item enrichment");
    assertEqual(requiredText(row, "config_hash"), entry.catalog.acceptedAssetConfigHash, "qualified item config");
    const nodeId = requiredText(row, "derived_node_id");
    if (!trail.has(nodeId)) throw new Error(`Qualified study item ${JSON.stringify(itemId)} is off trail.`);
    itemNodes.add(nodeId);
  }
  if (itemNodes.size !== trail.size) throw new Error("Qualified option-select items do not cover every trail node.");
}

function validateArtifacts(
  tables: PackageTables,
  graphVersionId: string,
  runId: string,
  enrichmentId: string
): void {
  const requiredTypes = new Set([
    "extraction_run",
    "concept_canonicalization",
    "graph_snapshot",
    "enrichment_run",
    "concept_lesson_bank",
    "study_item_bank"
  ]);
  for (const row of tables.artifact_versions) requiredTypes.delete(requiredText(row, "artifact_type"));
  if (requiredTypes.size > 0) {
    throw new Error(`Accepted package is missing artifacts: ${[...requiredTypes].sort().join(", ")}.`);
  }
  const canonicalization = tables.artifact_versions.find(
    (row) => row.artifact_type === "concept_canonicalization"
  );
  if (!canonicalization || !sameTextSet(payloadRunIds(canonicalization), [runId])) {
    throw new Error("Canonicalization artifact does not own the package extraction run.");
  }
  for (const row of tables.artifact_versions) {
    if (row.graph_version_id !== null && row.graph_version_id !== graphVersionId) {
      throw new Error("Artifact points outside the package Graph Version.");
    }
    const payload = objectValue(row.payload);
    if (
      ["enrichment_run", "concept_lesson_bank", "study_item_bank"].includes(
        requiredText(row, "artifact_type")
      ) && payload.enrichmentId !== enrichmentId
    ) {
      throw new Error("Artifact points outside the package Graph Enrichment.");
    }
  }
}

type ForeignKey = readonly [PackageTableName, string, PackageTableName, string, boolean?];
const FOREIGN_KEYS: ForeignKey[] = [
  ["source_documents", "source_resource_id", "source_resources", "source_resource_id"],
  ["source_blocks", "source_document_id", "source_documents", "source_document_id"],
  ["extraction_runs", "source_resource_id", "source_resources", "source_resource_id"],
  ["extraction_runs", "source_document_id", "source_documents", "source_document_id"],
  ["concept_candidates", "run_id", "extraction_runs", "run_id"],
  ["concept_candidate_mentions", "concept_candidate_id", "concept_candidates", "concept_candidate_id"],
  ["concept_candidate_mentions", "source_block_id", "source_blocks", "source_block_id"],
  ["concept_admission_decisions", "concept_candidate_id", "concept_candidates", "concept_candidate_id"],
  ["run_concept_evidence_profiles", "run_id", "extraction_runs", "run_id"],
  ["run_concept_evidence_profiles", "concept_candidate_id", "concept_candidates", "concept_candidate_id"],
  ["run_evidence_passages", "run_concept_evidence_profile_id", "run_concept_evidence_profiles", "run_concept_evidence_profile_id"],
  ["run_evidence_passages", "source_block_id", "source_blocks", "source_block_id"],
  ["run_optional_assertions", "run_concept_evidence_profile_id", "run_concept_evidence_profiles", "run_concept_evidence_profile_id"],
  ["run_optional_assertion_evidence", "run_optional_assertion_id", "run_optional_assertions", "run_optional_assertion_id"],
  ["run_optional_assertion_evidence", "source_block_id", "source_blocks", "source_block_id"],
  ["graph_version_concepts", "graph_version_id", "graph_versions", "graph_version_id"],
  ["graph_version_concepts", "concept_id", "concepts", "concept_id"],
  ["graph_version_concept_aliases", "graph_version_id", "graph_versions", "graph_version_id"],
  ["graph_version_concept_aliases", "concept_id", "concepts", "concept_id"],
  ["graph_version_run_memberships", "graph_version_id", "graph_versions", "graph_version_id"],
  ["graph_version_run_memberships", "run_id", "extraction_runs", "run_id"],
  ["graph_version_run_memberships", "source_resource_id", "source_resources", "source_resource_id"],
  ["graph_version_concept_evidence_profiles", "graph_version_id", "graph_versions", "graph_version_id"],
  ["graph_version_concept_evidence_profiles", "concept_id", "concepts", "concept_id"],
  ["graph_version_evidence_passages", "graph_version_concept_evidence_profile_id", "graph_version_concept_evidence_profiles", "graph_version_concept_evidence_profile_id"],
  ["graph_version_evidence_passages", "source_resource_id", "source_resources", "source_resource_id"],
  ["graph_version_evidence_passages", "source_block_id", "source_blocks", "source_block_id"],
  ["graph_version_optional_assertions", "graph_version_concept_evidence_profile_id", "graph_version_concept_evidence_profiles", "graph_version_concept_evidence_profile_id"],
  ["graph_version_optional_assertion_evidence", "graph_version_optional_assertion_id", "graph_version_optional_assertions", "graph_version_optional_assertion_id"],
  ["graph_version_optional_assertion_evidence", "source_resource_id", "source_resources", "source_resource_id"],
  ["graph_version_optional_assertion_evidence", "source_block_id", "source_blocks", "source_block_id"],
  ["refinement_decisions", "graph_version_id", "graph_versions", "graph_version_id"],
  ["artifact_versions", "run_id", "extraction_runs", "run_id", true],
  ["artifact_versions", "graph_version_id", "graph_versions", "graph_version_id", true],
  ["graph_enrichments", "graph_version_id", "graph_versions", "graph_version_id"],
  ["derived_graph_nodes", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["derived_graph_nodes", "concept_id", "concepts", "concept_id", true],
  ["enrichment_grounding_bundles", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["enrichment_grounding_passages", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["enrichment_grounding_passages", "source_resource_id", "source_resources", "source_resource_id", true],
  ["enrichment_grounding_passages", "source_block_id", "source_blocks", "source_block_id", true],
  ["inferred_prerequisite_edges", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["inferred_prerequisite_edges", "prerequisite_derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["inferred_prerequisite_edges", "dependent_derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["concept_difficulties", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["concept_difficulties", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["rescue_dispositions", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["minting_dispositions", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["minting_dispositions", "anchor_concept_id", "concepts", "concept_id"],
  ["derived_node_merges", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["derived_node_merges", "canonical_derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["enrichment_layer_purposes", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["study_items", "graph_version_id", "graph_versions", "graph_version_id", true],
  ["study_items", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["study_items", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["study_item_options", "study_item_id", "study_items", "study_item_id"],
  ["matching_pairs", "study_item_id", "study_items", "study_item_id"],
  ["matching_pairs", "source_resource_id", "source_resources", "source_resource_id", true],
  ["matching_pairs", "source_block_id", "source_blocks", "source_block_id", true],
  ["matching_pairs", "derived_node_id", "derived_graph_nodes", "derived_node_id", true],
  ["study_item_citations", "study_item_id", "study_items", "study_item_id"],
  ["study_item_citations", "source_resource_id", "source_resources", "source_resource_id", true],
  ["study_item_citations", "source_block_id", "source_blocks", "source_block_id", true],
  ["study_item_citations", "derived_node_id", "derived_graph_nodes", "derived_node_id", true],
  ["impostor_statements", "study_item_id", "study_items", "study_item_id"],
  ["impostor_statements", "source_resource_id", "source_resources", "source_resource_id", true],
  ["impostor_statements", "source_block_id", "source_blocks", "source_block_id", true],
  ["impostor_statements", "derived_node_id", "derived_graph_nodes", "derived_node_id", true],
  ["rejected_study_items", "graph_version_id", "graph_versions", "graph_version_id", true],
  ["rejected_study_items", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["rejected_study_items", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["concept_lessons", "graph_version_id", "graph_versions", "graph_version_id", true],
  ["concept_lessons", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["concept_lessons", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["concept_lesson_sections", "concept_lesson_id", "concept_lessons", "concept_lesson_id"],
  ["concept_lesson_section_citations", "concept_lesson_section_id", "concept_lesson_sections", "concept_lesson_section_id"],
  ["concept_lesson_section_citations", "source_resource_id", "source_resources", "source_resource_id", true],
  ["concept_lesson_section_citations", "source_block_id", "source_blocks", "source_block_id", true],
  ["concept_lesson_section_citations", "derived_node_id", "derived_graph_nodes", "derived_node_id", true],
  ["lesson_absent_nodes", "graph_version_id", "graph_versions", "graph_version_id", true],
  ["lesson_absent_nodes", "enrichment_id", "graph_enrichments", "enrichment_id"],
  ["lesson_absent_nodes", "derived_node_id", "derived_graph_nodes", "derived_node_id"],
  ["source_expedition_catalog_entries", "enrichment_id", "graph_enrichments", "enrichment_id"]
];

function validateForeignKeyClosure(tables: PackageTables): void {
  for (const [childTable, childField, parentTable, parentField, nullable] of FOREIGN_KEYS) {
    const parentValues = new Set(tables[parentTable].map((row) => requiredScalar(row, parentField)));
    for (const row of tables[childTable]) {
      const value = row[childField];
      if (nullable && value === null) continue;
      if ((typeof value !== "string" && typeof value !== "number") || !parentValues.has(value)) {
        throw new Error(`${childTable}.${childField} points outside ${parentTable}.${parentField}.`);
      }
    }
  }
}

async function readGlobalTables(sql: Sql): Promise<PackageTables> {
  const entries = await Promise.all(ACCEPTED_PATH_PACKAGE_TABLES.map(async (table) => {
    const rows = await sql.unsafe<{ row: JsonRow }[]>(`SELECT to_jsonb(t) AS row FROM "${table}" t`);
    return [table, rows.map((entry) => entry.row)] as const;
  }));
  return Object.fromEntries(entries) as PackageTables;
}

function selectAcceptedPathProjection(
  all: PackageTables,
  catalogKey: string
): AcceptedPathPackageProjection {
  const selected = emptyPackageTables();
  selected.source_expedition_catalog_entries = all.source_expedition_catalog_entries.filter(
    (row) => row.catalog_key === catalogKey
  );
  const catalog = onlyRow(selected.source_expedition_catalog_entries, "catalog entry");
  const enrichmentId = requiredText(catalog, "enrichment_id");
  selected.graph_enrichments = by(all.graph_enrichments, "enrichment_id", [enrichmentId]);
  const enrichment = onlyRow(selected.graph_enrichments, "graph enrichment");
  const graphVersionId = requiredText(enrichment, "graph_version_id");
  selected.graph_versions = by(all.graph_versions, "graph_version_id", [graphVersionId]);
  selected.graph_version_run_memberships = by(
    all.graph_version_run_memberships,
    "graph_version_id",
    [graphVersionId]
  );
  const runIds = selected.graph_version_run_memberships.map((row) => requiredText(row, "run_id"));
  const sourceIds = selected.graph_version_run_memberships.map(
    (row) => requiredText(row, "source_resource_id")
  );
  selected.extraction_runs = by(all.extraction_runs, "run_id", runIds);
  const documentIds = selected.extraction_runs.map((row) => requiredText(row, "source_document_id"));
  selected.source_resources = by(all.source_resources, "source_resource_id", sourceIds);
  selected.source_documents = by(all.source_documents, "source_document_id", documentIds);
  selected.source_blocks = by(
    all.source_blocks,
    "source_document_id",
    selected.source_documents.map((row) => requiredText(row, "source_document_id"))
  );
  selected.concept_candidates = by(all.concept_candidates, "run_id", runIds);
  const candidateIds = selected.concept_candidates.map((row) => requiredText(row, "concept_candidate_id"));
  selected.concept_candidate_mentions = by(
    all.concept_candidate_mentions,
    "concept_candidate_id",
    candidateIds
  );
  selected.concept_admission_decisions = by(
    all.concept_admission_decisions,
    "concept_candidate_id",
    candidateIds
  );
  selected.run_concept_evidence_profiles = by(all.run_concept_evidence_profiles, "run_id", runIds);
  const runProfileIds = selected.run_concept_evidence_profiles.map(
    (row) => requiredText(row, "run_concept_evidence_profile_id")
  );
  selected.run_evidence_passages = by(
    all.run_evidence_passages,
    "run_concept_evidence_profile_id",
    runProfileIds
  );
  selected.run_optional_assertions = by(
    all.run_optional_assertions,
    "run_concept_evidence_profile_id",
    runProfileIds
  );
  selected.run_optional_assertion_evidence = by(
    all.run_optional_assertion_evidence,
    "run_optional_assertion_id",
    selected.run_optional_assertions.map((row) => requiredText(row, "run_optional_assertion_id"))
  );

  selected.graph_version_concepts = by(all.graph_version_concepts, "graph_version_id", [graphVersionId]);
  const conceptIds = selected.graph_version_concepts.map((row) => requiredText(row, "concept_id"));
  selected.concepts = by(all.concepts, "concept_id", conceptIds);
  selected.graph_version_concept_aliases = by(
    all.graph_version_concept_aliases,
    "graph_version_id",
    [graphVersionId]
  );
  selected.graph_version_concept_evidence_profiles = by(
    all.graph_version_concept_evidence_profiles,
    "graph_version_id",
    [graphVersionId]
  );
  const graphProfileIds = selected.graph_version_concept_evidence_profiles.map(
    (row) => requiredText(row, "graph_version_concept_evidence_profile_id")
  );
  selected.graph_version_evidence_passages = by(
    all.graph_version_evidence_passages,
    "graph_version_concept_evidence_profile_id",
    graphProfileIds
  );
  selected.graph_version_optional_assertions = by(
    all.graph_version_optional_assertions,
    "graph_version_concept_evidence_profile_id",
    graphProfileIds
  );
  selected.graph_version_optional_assertion_evidence = by(
    all.graph_version_optional_assertion_evidence,
    "graph_version_optional_assertion_id",
    selected.graph_version_optional_assertions.map(
      (row) => requiredText(row, "graph_version_optional_assertion_id")
    )
  );
  selected.refinement_decisions = by(all.refinement_decisions, "graph_version_id", [graphVersionId]);
  selected.artifact_versions = selectArtifacts(all.artifact_versions, runIds, graphVersionId, enrichmentId);

  selected.derived_graph_nodes = by(all.derived_graph_nodes, "enrichment_id", [enrichmentId]);
  const nodeIds = selected.derived_graph_nodes.map((row) => requiredText(row, "derived_node_id"));
  selected.enrichment_grounding_bundles = by(
    all.enrichment_grounding_bundles,
    "derived_node_id",
    nodeIds
  );
  selected.enrichment_grounding_passages = by(
    all.enrichment_grounding_passages,
    "derived_node_id",
    nodeIds
  );
  selected.inferred_prerequisite_edges = by(
    all.inferred_prerequisite_edges,
    "enrichment_id",
    [enrichmentId]
  );
  selected.concept_difficulties = by(all.concept_difficulties, "enrichment_id", [enrichmentId]);
  selected.rescue_dispositions = by(all.rescue_dispositions, "enrichment_id", [enrichmentId]);
  selected.minting_dispositions = by(all.minting_dispositions, "enrichment_id", [enrichmentId]);
  selected.derived_node_merges = by(all.derived_node_merges, "enrichment_id", [enrichmentId]);
  selected.enrichment_layer_purposes = by(
    all.enrichment_layer_purposes,
    "enrichment_id",
    [enrichmentId]
  );

  selected.study_items = all.study_items.filter(
    (row) => row.enrichment_id === enrichmentId && row.superseded_at === null
  );
  const studyItemIds = selected.study_items.map((row) => requiredText(row, "study_item_id"));
  selected.study_item_options = by(all.study_item_options, "study_item_id", studyItemIds);
  selected.matching_pairs = by(all.matching_pairs, "study_item_id", studyItemIds);
  selected.study_item_citations = by(all.study_item_citations, "study_item_id", studyItemIds);
  selected.impostor_statements = by(all.impostor_statements, "study_item_id", studyItemIds);
  selected.rejected_study_items = by(all.rejected_study_items, "enrichment_id", [enrichmentId]);
  selected.concept_lessons = all.concept_lessons.filter(
    (row) => row.enrichment_id === enrichmentId && row.superseded_at === null
  );
  const lessonIds = selected.concept_lessons.map((row) => requiredText(row, "concept_lesson_id"));
  selected.concept_lesson_sections = by(
    all.concept_lesson_sections,
    "concept_lesson_id",
    lessonIds
  );
  selected.concept_lesson_section_citations = by(
    all.concept_lesson_section_citations,
    "concept_lesson_section_id",
    selected.concept_lesson_sections.map(
      (row) => requiredText(row, "concept_lesson_section_id")
    )
  );
  selected.lesson_absent_nodes = by(all.lesson_absent_nodes, "enrichment_id", [enrichmentId]);

  for (const table of ACCEPTED_PATH_PACKAGE_TABLES) {
    selected[table] = sortRows(selected[table]);
  }
  return { tables: selected };
}

function selectArtifacts(
  rows: JsonRow[],
  runIds: string[],
  graphVersionId: string,
  enrichmentId: string
): JsonRow[] {
  const selected: JsonRow[] = [];
  const byType = (type: string, predicate: (row: JsonRow) => boolean) => {
    const matches = rows.filter((row) => row.artifact_type === type && predicate(row));
    if (matches.length === 0) throw new Error(`No ${type} artifact belongs to the accepted path.`);
    selected.push([...matches].sort((left, right) =>
      requiredText(right, "created_at").localeCompare(requiredText(left, "created_at"))
    )[0]);
  };
  byType("extraction_run", (row) => runIds.includes(requiredText(row, "run_id")));
  byType("concept_canonicalization", (row) => sameTextSet(payloadRunIds(row), runIds));
  byType("graph_snapshot", (row) => row.graph_version_id === graphVersionId);
  for (const type of ["enrichment_run", "concept_lesson_bank", "study_item_bank"]) {
    byType(type, (row) => objectValue(row.payload).enrichmentId === enrichmentId);
  }
  return selected;
}

function mergePackageTables(packages: readonly AcceptedPathPackage[]): PackageTables {
  const merged = emptyPackageTables();
  for (const table of ACCEPTED_PATH_PACKAGE_TABLES) {
    const rows = packages.flatMap((entry) => packageTables(entry)[table]);
    if (table === "concepts") {
      const byId = new Map<string, JsonRow>();
      for (const row of rows) byId.set(requiredText(row, "concept_id"), row);
      merged[table] = sortRows([...byId.values()]);
    } else {
      merged[table] = sortRows(rows);
    }
  }
  return merged;
}

async function insertJsonRows(
  tx: TransactionSql,
  table: PackageTableName,
  rows: readonly JsonRow[]
): Promise<void> {
  if (rows.length === 0) return;
  await tx.unsafe(
    `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`,
    [tx.json([...rows] as JSONValue)]
  );
}

function canonicalPackageValue(entry: AcceptedPathPackage): AcceptedPathPackage {
  const tables = packageTables(entry);
  return {
    ...entry,
    qualification: {
      ...entry.qualification,
      trailNodeIds: [...entry.qualification.trailNodeIds].sort(compareText),
      expectedAssets: {
        ...entry.qualification.expectedAssets,
        currentConceptLessonIds: [
          ...entry.qualification.expectedAssets.currentConceptLessonIds
        ].sort(compareText),
        currentStudyItemIds: [...entry.qualification.expectedAssets.currentStudyItemIds].sort(compareText)
      }
    },
    projection: {
      tables: Object.fromEntries(
        ACCEPTED_PATH_PACKAGE_TABLES.map((table) => [table, sortRows(tables[table])])
      ) as PackageTables
    }
  };
}

function packageTables(entry: AcceptedPathPackage): PackageTables {
  return (entry.projection as AcceptedPathPackageProjection).tables;
}

function emptyPackageTables(): PackageTables {
  return Object.fromEntries(
    ACCEPTED_PATH_PACKAGE_TABLES.map((table) => [table, []])
  ) as unknown as PackageTables;
}

function by(rows: JsonRow[], field: string, values: readonly string[]): JsonRow[] {
  const accepted = new Set(values);
  return rows.filter((row) => typeof row[field] === "string" && accepted.has(row[field]));
}

function sortRows(rows: readonly JsonRow[]): JsonRow[] {
  return [...rows].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

function indexRows(rows: readonly JsonRow[], field: string): Map<string, JsonRow> {
  return new Map(rows.map((row) => [requiredText(row, field), row]));
}

function onlyRow(rows: readonly JsonRow[], label: string): JsonRow {
  if (rows.length !== 1) throw new Error(`Accepted package requires exactly one ${label}; found ${rows.length}.`);
  return rows[0];
}

function payloadRunIds(row: JsonRow): string[] {
  const value = objectValue(row.payload).runIds;
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : [];
}

function objectValue(value: unknown): JsonRow {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRow
    : {};
}

function requiredText(row: JsonRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Expected non-empty ${field}.`);
  return value;
}

function requiredNumber(row: JsonRow, field: string): number {
  const value = row[field];
  if (typeof value !== "number") throw new Error(`Expected numeric ${field}.`);
  return value;
}

function requiredScalar(row: JsonRow, field: string): string | number {
  const value = row[field];
  if ((typeof value !== "string" || value.length === 0) && typeof value !== "number") {
    throw new Error(`Expected scalar ${field}.`);
  }
  return value;
}

function requireUnique(values: readonly (string | number)[], label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label} ${JSON.stringify(value)}.`);
    seen.add(value);
  }
}

function bindIdentity(
  identities: Map<string, string>,
  key: string,
  value: string,
  label: string
): void {
  const existing = identities.get(key);
  if (existing !== undefined && existing !== value) {
    throw new Error(`${label} ${JSON.stringify(key)} disagrees across accepted packages.`);
  }
  identities.set(key, value);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} differs: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function sameTextSet(left: readonly string[], right: readonly string[]): boolean {
  const one = [...left].sort(compareText);
  const two = [...right].sort(compareText);
  return one.length === two.length && one.every((value, index) => value === two[index]);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonKeys(value));
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonKeys(nested)])
  );
}
