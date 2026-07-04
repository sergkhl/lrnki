import { randomUUID } from "node:crypto";
import type { EnrichmentInspectionReadPort, LearnerExpedition, LearnerExpeditionStorePort } from "@lrnki/ports";
import { buildTargetCandidates, recommendedTargets } from "./targetCandidates";

export type EnsureLearnerExpeditionResult =
  | { status: "existing"; expedition: LearnerExpedition }
  | { status: "ready"; learnerExpeditionId: string; enrichmentId: string; targetDerivedNodeId: string }
  | { status: "no_target" };

export async function ensureLearnerExpedition(input: {
  learnerStateRef: string;
  enrichmentId: string;
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
  newLearnerExpeditionId?: () => string;
}): Promise<EnsureLearnerExpeditionResult> {
  const existing = await input.expeditionStore.getByEnrichment({
    learnerStateRef: input.learnerStateRef,
    enrichmentId: input.enrichmentId
  });
  if (existing) return { status: "existing", expedition: existing };

  const detail = await input.enrichmentRead.getDerivedGraphDetail(input.enrichmentId);
  if (!detail) return { status: "no_target" };
  const target = recommendedTargets(buildTargetCandidates(detail), detail, 1)
    .find((candidate) => candidate.readyNodeCount > 0);
  if (!target) return { status: "no_target" };

  const learnerExpeditionId = input.newLearnerExpeditionId?.() ?? randomUUID();
  await input.expeditionStore.upsert({
    learnerExpeditionId,
    learnerStateRef: input.learnerStateRef,
    kind: "topic",
    title: target.label,
    declaredDomain: target.declaredDomain,
    status: "ready",
    enrichmentId: input.enrichmentId,
    targetDerivedNodeId: target.derivedNodeId,
    active: true
  });
  return {
    status: "ready",
    learnerExpeditionId,
    enrichmentId: input.enrichmentId,
    targetDerivedNodeId: target.derivedNodeId
  };
}
