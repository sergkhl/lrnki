import type {
  AcceptedPathPackage,
  AcceptedPathPackageSource,
  AcceptedPathPackageStorePort,
  SourceExpeditionCatalogPort
} from "@lrnki/ports";
import type { SourceExpeditionModule } from "./sourceExpedition";

export type AcceptedPathPackageModuleDeps = {
  sourceExpeditions: Pick<SourceExpeditionModule, "qualify" | "listCatalog">;
  catalog: Pick<SourceExpeditionCatalogPort, "getAcceptedByCatalogKey">;
  packageStore: AcceptedPathPackageStorePort;
  qualifiedAssetConfigHash: string;
};

export function createAcceptedPathPackageModule(deps: AcceptedPathPackageModuleDeps) {
  return {
    async exportAccepted(input: {
      catalogKey: string;
      source: AcceptedPathPackageSource;
    }): Promise<AcceptedPathPackage> {
      const catalogEntry = await deps.catalog.getAcceptedByCatalogKey(input.catalogKey);
      if (!catalogEntry) {
        throw new Error(`Accepted path ${JSON.stringify(input.catalogKey)} is not published.`);
      }
      if (catalogEntry.acceptedAssetConfigHash !== deps.qualifiedAssetConfigHash) {
        throw new Error(
          `Accepted path ${JSON.stringify(input.catalogKey)} uses a stale asset config hash.`
        );
      }
      const qualification = await deps.sourceExpeditions.qualify(catalogEntry.enrichmentId);
      if (qualification.status !== "available") {
        throw new Error(
          `Accepted path ${JSON.stringify(input.catalogKey)} is not exportable: ${qualification.reason}.`
        );
      }
      if (
        qualification.assets.expectedAssets.assetSetIdentity !==
        catalogEntry.acceptedAssetSetIdentity
      ) {
        throw new Error(
          `Accepted path ${JSON.stringify(input.catalogKey)} changed since publication.`
        );
      }
      return deps.packageStore.exportAccepted({
        catalogEntry,
        source: input.source,
        qualification: {
          declaredDomain: qualification.candidate.declaredDomain,
          totalStopCount: qualification.candidate.totalStopCount,
          trailNodeIds: [...qualification.assets.trailNodeIds].sort(compareText),
          expectedAssets: qualification.assets.expectedAssets
        }
      });
    },

    async install(packages: readonly AcceptedPathPackage[]): Promise<{
      catalogKeys: string[];
      sourceCount: number;
    }> {
      if (packages.length === 0) throw new Error("At least one accepted path package is required.");
      const duplicate = firstDuplicate(packages.map((entry) => entry.catalog.catalogKey));
      if (duplicate) throw new Error(`Duplicate accepted package catalog key ${JSON.stringify(duplicate)}.`);
      for (const entry of packages) {
        if (entry.catalog.acceptedAssetConfigHash !== deps.qualifiedAssetConfigHash) {
          throw new Error(
            `Accepted path ${JSON.stringify(entry.catalog.catalogKey)} uses a stale asset config hash.`
          );
        }
      }

      // Global rows may remain unpublished for diagnosis if deterministic qualification fails.
      // Catalog publication is a separate final transaction, so no failed import becomes visible.
      await deps.packageStore.installGlobalProjections(packages);
      for (const entry of packages) {
        const qualification = await deps.sourceExpeditions.qualify(entry.catalog.enrichmentId);
        if (qualification.status !== "available") {
          throw new Error(
            `Installed path ${JSON.stringify(entry.catalog.catalogKey)} is not qualified: ${qualification.reason}.`
          );
        }
        assertInstalledQualification(entry, qualification);
      }
      await deps.packageStore.publishCatalogProjections(packages);

      const catalog = await deps.sourceExpeditions.listCatalog({
        learnerStateRef: "accepted-path-package-positive-control"
      });
      const installedKeys = new Set(packages.map((entry) => entry.catalog.catalogKey));
      const candidates = catalog.candidates.filter((entry) => installedKeys.has(entry.catalogKey));
      if (candidates.length !== packages.length) {
        throw new Error("Installed accepted paths did not all reach the learner catalog route.");
      }
      for (const entry of packages) {
        const candidate = candidates.find((value) => value.catalogKey === entry.catalog.catalogKey);
        if (
          !candidate ||
          candidate.title !== entry.catalog.title ||
          candidate.teaser !== entry.catalog.teaser ||
          candidate.sortOrder !== entry.catalog.sortOrder ||
          candidate.totalStopCount !== entry.qualification.totalStopCount
        ) {
          throw new Error(
            `Installed path ${JSON.stringify(entry.catalog.catalogKey)} changed in learner projection.`
          );
        }
      }
      return {
        catalogKeys: candidates
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((entry) => entry.catalogKey),
        sourceCount: catalog.sources
          .filter((entry) => installedKeys.has(entry.catalogKey))
          .reduce((count, entry) => count + entry.sourceCredits.length, 0)
      };
    }
  };
}

function assertInstalledQualification(
  entry: AcceptedPathPackage,
  qualification: Extract<Awaited<ReturnType<SourceExpeditionModule["qualify"]>>, { status: "available" }>
): void {
  const expected = entry.qualification;
  const actualAssets = qualification.assets.expectedAssets;
  if (
    qualification.candidate.declaredDomain !== expected.declaredDomain ||
    qualification.candidate.totalStopCount !== expected.totalStopCount ||
    actualAssets.assetSetIdentity !== entry.catalog.acceptedAssetSetIdentity ||
    !sameTextSet(qualification.assets.trailNodeIds, expected.trailNodeIds) ||
    !sameTextSet(actualAssets.currentConceptLessonIds, expected.expectedAssets.currentConceptLessonIds) ||
    !sameTextSet(actualAssets.currentStudyItemIds, expected.expectedAssets.currentStudyItemIds)
  ) {
    throw new Error(
      `Installed path ${JSON.stringify(entry.catalog.catalogKey)} differs from its sealed qualification.`
    );
  }
}

function sameTextSet(actual: Iterable<string>, expected: Iterable<string>): boolean {
  const left = [...actual].sort(compareText);
  const right = [...expected].sort(compareText);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
