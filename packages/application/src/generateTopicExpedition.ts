import { randomUUID } from "node:crypto";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { generateStudyItemBank } from "./generateStudyItemBank";
import { runSyntheticGeneration } from "./runSyntheticGeneration";

export type GenerateTopicExpeditionDeps = {
  runSynthetic?: typeof runSyntheticGeneration;
  generateStudyItems?: typeof generateStudyItemBank;
};

export async function generateTopicExpedition(input: Omit<Parameters<typeof runSyntheticGeneration>[0], "enrichmentId" | "topic" | "onDeclaredDomain"> & Omit<Parameters<typeof generateStudyItemBank>[0], "enrichmentId"> & {
  learnerExpeditionId: string;
  topic: string;
  expeditionStore: LearnerExpeditionStorePort;
  deps?: GenerateTopicExpeditionDeps;
  newEnrichmentId?: () => string;
}): Promise<{ enrichmentId: string }> {
  const enrichmentId = (input.newEnrichmentId ?? randomUUID)();
  const runSynthetic = input.deps?.runSynthetic ?? runSyntheticGeneration;
  const generateStudyItems = input.deps?.generateStudyItems ?? generateStudyItemBank;
  try {
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "generating",
      currentOperationId: enrichmentId,
      currentOperationType: "enrichment"
    });
    let resolvedDeclaredDomain = input.declaredDomain?.trim() ?? "";
    const layer = await runSynthetic({
      ...input,
      enrichmentId,
      topic: input.topic,
      onDeclaredDomain: async (declaredDomain) => {
        resolvedDeclaredDomain = declaredDomain;
        await input.expeditionStore.updateProgress({
          learnerExpeditionId: input.learnerExpeditionId,
          declaredDomain
        });
      }
    });
    // Readiness is trail-wide now: an expedition is ready when its layer carries at least one
    // concept and a study bank. The summit is DERIVED at read time (ADR-0032), so there is no
    // target to persist — generation only fails loudly when the layer produced no concepts.
    if (layer.derivedNodes.length === 0) {
      throw new Error("Scouting produced no concepts.");
    }

    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      currentOperationId: enrichmentId,
      currentOperationType: "study_items"
    });
    await generateStudyItems({ ...input, enrichmentId });
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "ready",
      enrichmentId,
      declaredDomain: resolvedDeclaredDomain || input.declaredDomain,
      currentOperationId: null,
      currentOperationType: null,
      failureMessage: null
    });
    return { enrichmentId };
  } catch (error) {
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      status: "failed",
      failureMessage: generationFailureMessage(error)
    });
    throw error;
  }
}

function generationFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "Scouting failed. Try again later.";
}
