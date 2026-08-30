import { createHash } from "node:crypto";

export const SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY =
  "source-expedition-prerequisite-closed-ready-sublayer-v1";

export type SourceExpeditionAssetIdentityInput = {
  qualifiedAssetConfigHash: string;
  enrichmentId: string;
  graphVersionId: string | null;
  enrichmentConfigHash: string;
  trailNodeIds: readonly string[];
  routePlan: unknown;
  lessons: readonly {
    conceptLessonId: string;
    derivedNodeId: string;
    configHash: string;
  }[];
  studyItems: readonly {
    studyItemId: string;
    derivedNodeId: string;
    itemType: string;
    configHash: string;
  }[];
};

// One codec owns the content-addressed learner asset identity used by live qualification and the
// offline accepted-package validator. Route and selected-item changes must fail before a reset,
// while unordered relational reads cannot perturb the digest.
export function sourceExpeditionAssetSetIdentity(
  input: SourceExpeditionAssetIdentityInput
): string {
  const identityPayload = {
    contract: input.qualifiedAssetConfigHash,
    trailScopePolicy: SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY,
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: input.enrichmentConfigHash,
    trailNodeIds: [...input.trailNodeIds].sort(compareText),
    routePlan: input.routePlan,
    lessons: [...input.lessons]
      .sort((left, right) => left.conceptLessonId.localeCompare(right.conceptLessonId))
      .map((lesson) => [lesson.conceptLessonId, lesson.derivedNodeId, lesson.configHash]),
    studyItems: [...input.studyItems]
      .sort((left, right) => left.studyItemId.localeCompare(right.studyItemId))
      .map((item) => [item.studyItemId, item.derivedNodeId, item.itemType, item.configHash])
  };
  return `source-expedition-assets-${createHash("sha256")
    .update(JSON.stringify(identityPayload))
    .digest("hex")}`;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
