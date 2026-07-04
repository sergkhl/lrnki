import { randomUUID } from "node:crypto";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { generateStudyItemBank } from "./generateStudyItemBank";
import { runSyntheticGeneration } from "./runSyntheticGeneration";

export type ChartTopicExpeditionDeps = {
  runSynthetic?: typeof runSyntheticGeneration;
  generateStudyItems?: typeof generateStudyItemBank;
};

export async function chartTopicExpedition(input: Omit<Parameters<typeof runSyntheticGeneration>[0], "enrichmentId" | "topic" | "declaredDomain"> & Omit<Parameters<typeof generateStudyItemBank>[0], "enrichmentId"> & {
  learnerExpeditionId: string;
  topic: string;
  declaredDomain: string;
  expeditionStore: LearnerExpeditionStorePort;
  deps?: ChartTopicExpeditionDeps;
  newEnrichmentId?: () => string;
}): Promise<{ enrichmentId: string; targetDerivedNodeId: string }> {
  const enrichmentId = (input.newEnrichmentId ?? randomUUID)();
  const runSynthetic = input.deps?.runSynthetic ?? runSyntheticGeneration;
  const generateStudyItems = input.deps?.generateStudyItems ?? generateStudyItemBank;
  try {
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "charting",
      currentOperationId: enrichmentId,
      currentOperationType: "enrichment"
    });
    const layer = await runSynthetic({ ...input, enrichmentId, topic: input.topic, declaredDomain: input.declaredDomain });

    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      currentOperationId: enrichmentId,
      currentOperationType: "study_items"
    });
    const bank = await generateStudyItems({ ...input, enrichmentId });
    const targetDerivedNodeId = bank.studyItems[0]?.derivedNodeId ?? layer.derivedNodes[0]?.derivedNodeId ?? null;
    if (!targetDerivedNodeId) {
      throw new Error("Charting produced no target stop.");
    }
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "ready",
      enrichmentId,
      targetDerivedNodeId,
      currentOperationId: null,
      currentOperationType: null,
      failureMessage: null
    });
    return { enrichmentId, targetDerivedNodeId };
  } catch (error) {
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "failed",
      failureMessage: chartingFailureMessage(error)
    });
    throw error;
  }
}

function chartingFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "Charting failed. Try again later.";
}
