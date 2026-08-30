import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_PATH_PACKAGE_FORMAT,
  type AcceptedPathPackage,
  type AcceptedPathPackageStorePort,
  type ExpeditionRoutePlan,
  type SourceExpeditionCatalogEntry
} from "@lrnki/ports";
import { createAcceptedPathPackageModule } from "./acceptedPathPackage";
import type { SourceExpeditionQualification } from "./sourceExpedition";

const routePlan: ExpeditionRoutePlan = {
  policyIdentity: "source-expedition-route-v1:min3-max5-target4:mixed",
  orderedDerivedNodeIds: ["node-1", "node-2", "node-3"],
  legs: [{
    legIndex: 0,
    anchorDerivedNodeId: "node-3",
    derivedNodeIds: ["node-1", "node-2", "node-3"],
    selectedBonusStudyItemIds: ["matching-1", "impostor-1"]
  }],
  summitDerivedNodeId: "node-3"
};
const expectedAssets = {
  assetSetIdentity: "source-expedition-assets-test",
  currentConceptLessonIds: ["lesson-1", "lesson-2", "lesson-3"],
  currentStudyItemIds: ["option-1", "option-2", "option-3", "matching-1", "impostor-1"]
};
const sourceProvenance = {
  authorship: "project_fixture",
  knowledgeBasis: "fixture_text",
  externalClaimVerificationRequired: false,
  acceptanceScope: "automated_contract_test"
};
const catalogEntry: SourceExpeditionCatalogEntry = {
  catalogKey: "test-route",
  enrichmentId: "enrichment-1",
  title: "Test Route",
  teaser: "A mixed route",
  catalogRole: "contract_test",
  audience: "test_reader",
  sortOrder: 1,
  sourceProvenance,
  acceptedAssetSetIdentity: expectedAssets.assetSetIdentity,
  acceptedAssetConfigHash: "source-expedition-learner-assets-v3:test",
  sourceCredits: [{
    sourceResourceId: "source-1",
    title: "Test Source",
    sourceUri: null,
    license: null
  }],
  createdAt: "2026-08-30T00:00:00.000Z"
};

test("accepted package export seals the exact route and honest Concept count", async () => {
  let exportedInput: Parameters<AcceptedPathPackageStorePort["exportAccepted"]>[0] | undefined;
  const packageModule = createAcceptedPathPackageModule({
    sourceExpeditions: sourceExpeditions(),
    catalog: { async getAcceptedByCatalogKey() { return catalogEntry; } },
    packageStore: {
      async exportAccepted(input) {
        exportedInput = input;
        return acceptedPackage();
      },
      async installGlobalProjections() {},
      async publishCatalogProjections() {}
    },
    qualifiedAssetConfigHash: catalogEntry.acceptedAssetConfigHash
  });

  await packageModule.exportAccepted({ catalogKey: catalogEntry.catalogKey, source: acceptedPackage().source });
  assert.equal(exportedInput?.qualification.totalConceptCount, 3);
  assert.deepEqual(exportedInput?.qualification.routePlan, routePlan);
  assert.deepEqual(exportedInput?.qualification.expectedAssets, expectedAssets);
});

test("accepted package install qualifies before catalog publication and exposes no learner write port", async () => {
  const calls: string[] = [];
  const packageModule = createAcceptedPathPackageModule({
    sourceExpeditions: sourceExpeditions(calls),
    catalog: { async getAcceptedByCatalogKey() { return catalogEntry; } },
    packageStore: {
      async exportAccepted() { return acceptedPackage(); },
      async installGlobalProjections() { calls.push("install-global"); },
      async publishCatalogProjections() { calls.push("publish-catalog"); }
    },
    qualifiedAssetConfigHash: catalogEntry.acceptedAssetConfigHash
  });

  const result = await packageModule.install([acceptedPackage()]);
  assert.deepEqual(calls, ["install-global", "qualify", "publish-catalog", "list-catalog"]);
  assert.deepEqual(result, { catalogKeys: ["test-route"], sourceCount: 1 });
});

test("install rejects route or selected-item drift before catalog publication", async () => {
  for (const mutate of [
    (entry: AcceptedPathPackage) => {
      entry.qualification.routePlan.orderedDerivedNodeIds = ["node-2", "node-1", "node-3"];
      entry.qualification.routePlan.legs[0]!.derivedNodeIds = ["node-2", "node-1", "node-3"];
    },
    (entry: AcceptedPathPackage) => {
      entry.qualification.expectedAssets.currentStudyItemIds[0] = "option-changed";
    }
  ]) {
    const entry = acceptedPackage();
    mutate(entry);
    const calls: string[] = [];
    const packageModule = createAcceptedPathPackageModule({
      sourceExpeditions: sourceExpeditions(calls),
      catalog: { async getAcceptedByCatalogKey() { return catalogEntry; } },
      packageStore: {
        async exportAccepted() { return acceptedPackage(); },
        async installGlobalProjections() { calls.push("install-global"); },
        async publishCatalogProjections() { calls.push("publish-catalog"); }
      },
      qualifiedAssetConfigHash: catalogEntry.acceptedAssetConfigHash
    });

    await assert.rejects(packageModule.install([entry]), /differs from its sealed qualification/i);
    assert.deepEqual(calls, ["install-global", "qualify"]);
  }
});

function sourceExpeditions(calls: string[] = []) {
  return {
    async qualify(): Promise<SourceExpeditionQualification> {
      calls.push("qualify");
      return {
        status: "available",
        candidate: {
          enrichmentId: catalogEntry.enrichmentId,
          title: catalogEntry.title,
          declaredDomain: "test domain",
          totalConceptCount: 3,
          searchTerms: [catalogEntry.title]
        },
        assets: {
          detail: {} as never,
          lessons: [],
          lessonAbsent: [],
          studyItems: [],
          trailNodeIds: new Set(routePlan.orderedDerivedNodeIds),
          routePlan: structuredClone(routePlan),
          expectedAssets: structuredClone(expectedAssets)
        }
      };
    },
    async listCatalog() {
      calls.push("list-catalog");
      return {
        candidates: [{
          catalogKey: catalogEntry.catalogKey,
          enrichmentId: catalogEntry.enrichmentId,
          title: catalogEntry.title,
          teaser: catalogEntry.teaser,
          sortOrder: catalogEntry.sortOrder,
          declaredDomain: "test domain",
          totalConceptCount: 3,
          searchTerms: [catalogEntry.title]
        }],
        sources: [{
          catalogKey: catalogEntry.catalogKey,
          title: catalogEntry.title,
          sourceProvenance,
          sourceCredits: catalogEntry.sourceCredits
        }]
      };
    }
  };
}

function acceptedPackage(): AcceptedPathPackage {
  return {
    format: ACCEPTED_PATH_PACKAGE_FORMAT,
    catalog: {
      catalogKey: catalogEntry.catalogKey,
      enrichmentId: catalogEntry.enrichmentId,
      title: catalogEntry.title,
      teaser: catalogEntry.teaser,
      catalogRole: catalogEntry.catalogRole,
      audience: catalogEntry.audience,
      sortOrder: catalogEntry.sortOrder,
      sourceProvenance,
      acceptedAssetSetIdentity: catalogEntry.acceptedAssetSetIdentity,
      acceptedAssetConfigHash: catalogEntry.acceptedAssetConfigHash
    },
    source: {
      fixtureId: "accepted-path-test-route",
      path: "fixtures/accepted-paths/sources/test-route.md",
      contentHash: "a".repeat(64),
      contentType: "text/markdown",
      declaredDomain: "test domain",
      title: "Test Route",
      sourceUri: "lrnki test fixture",
      license: "project test fixture"
    },
    qualification: {
      declaredDomain: "test domain",
      totalConceptCount: 3,
      routePlan: structuredClone(routePlan),
      expectedAssets: structuredClone(expectedAssets)
    },
    projection: {}
  };
}
