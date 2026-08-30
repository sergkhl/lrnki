import {
  ACCEPTED_PATH_PACKAGE_FORMAT,
  type AcceptedPathPackage
} from "@lrnki/ports";
import { sourceExpeditionAssetSetIdentity } from "@lrnki/domain-core/source-expedition-asset-identity-node";
import { ACCEPTED_PATH_PACKAGE_TABLES } from "./PostgresAcceptedPathPackages";

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

export const ACCEPTED_PATH_V2_TEST_IDS = {
  source: uuid(1),
  document: uuid(2),
  block: uuid(3),
  run: uuid(4),
  graph: uuid(5),
  membership: uuid(6),
  enrichment: uuid(7),
  nodes: [uuid(11), uuid(12), uuid(13)],
  lessons: [uuid(21), uuid(22), uuid(23)],
  options: [uuid(31), uuid(32), uuid(33)],
  matching: uuid(34),
  impostor: uuid(35)
} as const;

export function acceptedPathPackageV2TestFixture(): AcceptedPathPackage {
  const ids = ACCEPTED_PATH_V2_TEST_IDS;
  const assetConfigHash = "source-expedition-learner-assets-v3:test";
  const enrichmentConfigHash = "enrichment-config-test";
  const routePlan = {
    policyIdentity: "source-expedition-route-v1:min3-max5-target4:mixed",
    orderedDerivedNodeIds: [...ids.nodes],
    legs: [{
      legIndex: 0,
      anchorDerivedNodeId: ids.nodes[2],
      derivedNodeIds: [...ids.nodes],
      selectedBonusStudyItemIds: [ids.matching, ids.impostor]
    }],
    summitDerivedNodeId: ids.nodes[2]
  };
  const assetSetIdentity = sourceExpeditionAssetSetIdentity({
    qualifiedAssetConfigHash: assetConfigHash,
    enrichmentId: ids.enrichment,
    graphVersionId: ids.graph,
    enrichmentConfigHash,
    trailNodeIds: ids.nodes,
    routePlan,
    lessons: ids.lessons.map((conceptLessonId, index) => ({
      conceptLessonId,
      derivedNodeId: ids.nodes[index]!,
      configHash: assetConfigHash
    })),
    studyItems: [
      ...ids.options.map((studyItemId, index) => ({
        studyItemId,
        derivedNodeId: ids.nodes[index]!,
        itemType: "option_select",
        configHash: assetConfigHash
      })),
      {
        studyItemId: ids.matching,
        derivedNodeId: ids.nodes[1],
        itemType: "matching",
        configHash: assetConfigHash
      },
      {
        studyItemId: ids.impostor,
        derivedNodeId: ids.nodes[2],
        itemType: "impostor",
        configHash: assetConfigHash
      }
    ]
  });
  const sourceProvenance = {
    authorship: "project_fixture",
    knowledgeBasis: "fixture_text",
    externalClaimVerificationRequired: false,
    acceptanceScope: "automated_contract_test"
  };
  const tables = Object.fromEntries(
    ACCEPTED_PATH_PACKAGE_TABLES.map((table) => [table, []])
  ) as unknown as Record<
    typeof ACCEPTED_PATH_PACKAGE_TABLES[number],
    Array<Record<string, unknown>>
  >;

  tables.source_resources.push({
    source_resource_id: ids.source,
    object_key: "fixtures/test-route.md",
    content_hash: "b".repeat(64),
    content_type: "text/markdown",
    declared_domain: "test domain",
    title: "Test Route",
    source_uri: "lrnki test fixture",
    license: "project test fixture"
  });
  tables.source_documents.push({
    source_document_id: ids.document,
    source_resource_id: ids.source
  });
  tables.source_blocks.push({
    source_block_id: ids.block,
    source_document_id: ids.document,
    block_id: "block-1"
  });
  tables.extraction_runs.push({
    run_id: ids.run,
    source_resource_id: ids.source,
    source_document_id: ids.document,
    status: "succeeded"
  });
  tables.graph_versions.push({
    graph_version_id: ids.graph,
    base_graph_version_id: null,
    status: "published"
  });
  tables.graph_version_run_memberships.push({
    graph_version_run_membership_id: ids.membership,
    graph_version_id: ids.graph,
    run_id: ids.run,
    source_resource_id: ids.source
  });
  tables.artifact_versions.push(
    artifact(uuid(91), "extraction_run", ids.run, null, {}),
    artifact(uuid(92), "concept_canonicalization", null, null, { runIds: [ids.run] }),
    artifact(uuid(93), "graph_snapshot", null, ids.graph, {}),
    artifact(uuid(94), "enrichment_run", null, ids.graph, { enrichmentId: ids.enrichment }),
    artifact(uuid(95), "concept_lesson_bank", null, ids.graph, { enrichmentId: ids.enrichment }),
    artifact(uuid(96), "study_item_bank", null, ids.graph, { enrichmentId: ids.enrichment })
  );
  tables.graph_enrichments.push({
    enrichment_id: ids.enrichment,
    graph_version_id: ids.graph,
    enrichment_config_hash: enrichmentConfigHash,
    status: "succeeded"
  });
  ids.nodes.forEach((derivedNodeId, index) => {
    tables.derived_graph_nodes.push({
      derived_node_id: derivedNodeId,
      enrichment_id: ids.enrichment,
      concept_id: null,
      canonical_label: `Concept ${index + 1}`,
      grounding_origin: "source_cep"
    });
  });
  tables.inferred_prerequisite_edges.push({
    inferred_prerequisite_edge_id: uuid(14),
    enrichment_id: ids.enrichment,
    prerequisite_derived_node_id: ids.nodes[0],
    dependent_derived_node_id: ids.nodes[1],
    uncertain: false
  });

  ids.lessons.forEach((conceptLessonId, index) => {
    tables.concept_lessons.push({
      concept_lesson_id: conceptLessonId,
      graph_version_id: ids.graph,
      enrichment_id: ids.enrichment,
      derived_node_id: ids.nodes[index],
      config_hash: assetConfigHash,
      superseded_at: null
    });
  });
  ids.options.forEach((studyItemId, index) => {
    tables.study_items.push(studyItem(
      studyItemId,
      ids.nodes[index],
      "option_select",
      ids.graph,
      ids.enrichment,
      assetConfigHash
    ));
    for (let ordinal = 0; ordinal < 4; ordinal += 1) {
      tables.study_item_options.push({
        option_id: uuid(40 + index * 4 + ordinal),
        study_item_id: studyItemId,
        ordinal,
        option_text: `Option ${ordinal + 1}`,
        is_correct: ordinal === 0,
        provenance: "source"
      });
    }
  });
  tables.study_items.push(
    studyItem(ids.matching, ids.nodes[1], "matching", ids.graph, ids.enrichment, assetConfigHash),
    studyItem(ids.impostor, ids.nodes[2], "impostor", ids.graph, ids.enrichment, assetConfigHash)
  );
  for (let ordinal = 0; ordinal < 3; ordinal += 1) {
    tables.matching_pairs.push({
      matching_pair_id: uuid(60 + ordinal),
      match_tile_id: uuid(70 + ordinal),
      study_item_id: ids.matching,
      ordinal,
      prompt_text: `Prompt ${ordinal + 1}`,
      match_text: `Match ${ordinal + 1}`,
      provenance: "generated",
      source_resource_id: null,
      source_block_id: null,
      derived_node_id: ids.nodes[1],
      generated_passage_text: `Generated matching support ${ordinal + 1}`
    });
  }
  for (let ordinal = 0; ordinal < 4; ordinal += 1) {
    tables.impostor_statements.push({
      impostor_statement_id: uuid(80 + ordinal),
      study_item_id: ids.impostor,
      ordinal,
      statement_text: `Statement ${ordinal + 1}`,
      is_impostor: ordinal === 3,
      provenance: "generated",
      source_resource_id: null,
      source_block_id: null,
      derived_node_id: ids.nodes[2],
      generated_passage_text: `Generated impostor support ${ordinal + 1}`,
      reveal_text: ordinal === 3 ? "Correction" : null,
      lie_source: ordinal === 3 ? "generated" : null
    });
  }

  tables.source_expedition_catalog_entries.push({
    catalog_key: "test-route",
    enrichment_id: ids.enrichment,
    title: "Test Route",
    teaser: "Three Concepts with every Study Item family.",
    catalog_role: "contract_test",
    audience: "test_reader",
    sort_order: 1,
    source_provenance: sourceProvenance,
    accepted_asset_set_identity: assetSetIdentity,
    accepted_asset_config_hash: assetConfigHash
  });

  return {
    format: ACCEPTED_PATH_PACKAGE_FORMAT,
    catalog: {
      catalogKey: "test-route",
      enrichmentId: ids.enrichment,
      title: "Test Route",
      teaser: "Three Concepts with every Study Item family.",
      catalogRole: "contract_test",
      audience: "test_reader",
      sortOrder: 1,
      sourceProvenance,
      acceptedAssetSetIdentity: assetSetIdentity,
      acceptedAssetConfigHash: assetConfigHash
    },
    source: {
      fixtureId: "accepted-path-test-route",
      path: "fixtures/accepted-paths/sources/test-route.md",
      contentHash: "b".repeat(64),
      contentType: "text/markdown",
      declaredDomain: "test domain",
      title: "Test Route",
      sourceUri: "lrnki test fixture",
      license: "project test fixture"
    },
    qualification: {
      declaredDomain: "test domain",
      totalConceptCount: 3,
      routePlan,
      expectedAssets: {
        assetSetIdentity,
        currentConceptLessonIds: [...ids.lessons],
        currentStudyItemIds: [...ids.options, ids.matching, ids.impostor]
      }
    },
    projection: { tables }
  };
}

function artifact(
  artifactId: string,
  artifactType: string,
  runId: string | null,
  graphVersionId: string | null,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    artifact_id: artifactId,
    artifact_type: artifactType,
    run_id: runId,
    graph_version_id: graphVersionId,
    payload
  };
}

function studyItem(
  studyItemId: string,
  derivedNodeId: string,
  itemType: "option_select" | "matching" | "impostor",
  graphVersionId: string,
  enrichmentId: string,
  configHash: string
): Record<string, unknown> {
  return {
    study_item_id: studyItemId,
    derived_node_id: derivedNodeId,
    item_type: itemType,
    graph_version_id: graphVersionId,
    enrichment_id: enrichmentId,
    config_hash: configHash,
    superseded_at: null
  };
}
