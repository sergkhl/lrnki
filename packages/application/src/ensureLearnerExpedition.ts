import { randomUUID } from "node:crypto";
import type { EnrichmentInspectionReadPort, LearnerExpedition, LearnerExpeditionStorePort } from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";

export type EnsureLearnerExpeditionResult =
  | { status: "existing"; expedition: LearnerExpedition }
  | { status: "ready"; learnerExpeditionId: string; enrichmentId: string }
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
  // The admin-door expedition titles with the DERIVED summit (ADR-0032) — the last section's
  // milestone over the floored layer — not a chosen target. An empty floored layer has no summit.
  const { summit } = deriveFlooredExpedition(detail);
  if (!summit) return { status: "no_target" };
  const declaredDomain = detail.nodes.find((node) => node.derivedNodeId === summit.derivedNodeId)?.declaredDomain ?? detail.nodes[0]?.declaredDomain ?? "";

  const learnerExpeditionId = input.newLearnerExpeditionId?.() ?? randomUUID();
  await input.expeditionStore.upsert({
    learnerExpeditionId,
    learnerStateRef: input.learnerStateRef,
    kind: "topic",
    title: summit.label,
    declaredDomain,
    status: "ready",
    enrichmentId: input.enrichmentId,
    active: true
  });
  return {
    status: "ready",
    learnerExpeditionId,
    enrichmentId: input.enrichmentId
  };
}
