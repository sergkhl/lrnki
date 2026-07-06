import { randomUUID } from "node:crypto";
import type { ForcedToolFailureAttempt, LearnerExpeditionStorePort, StageErrorDetail } from "@lrnki/ports";
import { generateStudyItemBank } from "./generateStudyItemBank";
import { runSyntheticGeneration } from "./runSyntheticGeneration";

export type GenerateTopicExpeditionDeps = {
  runSynthetic?: typeof runSyntheticGeneration;
  generateStudyItems?: typeof generateStudyItemBank;
};

// Thrown when a fenced write affects 0 rows: another worker re-claimed the row, so
// this run no longer owns it and must stop spending. The row is left untouched — the
// new owner's writes are authoritative.
export class GenerationClaimLostError extends Error {
  constructor(learnerExpeditionId: string) {
    super(`Generation claim lost for expedition ${learnerExpeditionId}.`);
    this.name = "GenerationClaimLostError";
  }
}

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
  // Fencing token (lease pattern): the claim cleared current_operation_id, so the
  // first write expects null and installs this run's enrichment id; every later
  // write expects that id. A 0-row fenced write means a competing claim took the
  // row — abort instead of double-running.
  let fenceToken: string | null = null;
  const fencedUpdate = async (update: Omit<Parameters<LearnerExpeditionStorePort["updateProgress"]>[0], "learnerExpeditionId" | "expectedOperationId">): Promise<void> => {
    const affected = await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      expectedOperationId: fenceToken,
      ...update
    });
    if (affected === 0) throw new GenerationClaimLostError(input.learnerExpeditionId);
  };
  try {
    await fencedUpdate({
      status: "generating",
      currentOperationId: enrichmentId,
      currentOperationType: "enrichment"
    });
    fenceToken = enrichmentId;
    let resolvedDeclaredDomain = input.declaredDomain?.trim() ?? "";
    const layer = await runSynthetic({
      ...input,
      enrichmentId,
      topic: input.topic,
      onDeclaredDomain: async (declaredDomain) => {
        resolvedDeclaredDomain = declaredDomain;
        await fencedUpdate({ declaredDomain });
      }
    });
    // Readiness is trail-wide now: an expedition is ready when its layer carries at least one
    // concept and a study bank. The summit is DERIVED at read time (ADR-0032), so there is no
    // target to persist — generation only fails loudly when the layer produced no concepts.
    if (layer.derivedNodes.length === 0) {
      throw new Error("Scouting produced no concepts.");
    }

    await fencedUpdate({
      currentOperationId: enrichmentId,
      currentOperationType: "study_items"
    });
    await generateStudyItems({ ...input, enrichmentId });
    await fencedUpdate({
      status: "ready",
      enrichmentId,
      declaredDomain: resolvedDeclaredDomain || input.declaredDomain,
      currentOperationId: null,
      currentOperationType: null,
      failureMessage: null
    });
    return { enrichmentId };
  } catch (error) {
    // Lost claim: another worker owns the row now — write nothing.
    if (error instanceof GenerationClaimLostError) throw error;
    if (isTransientGenerationError(error)) {
      // Transient (network / 5xx / 429 / timeout) exhaustion: release the claim so the
      // supervisor's attempt budget governs re-runs — status stays `generating`, the
      // operation id is cleared, claimed_at is kept as natural backoff. A best-effort
      // write: losing the fence here just means someone else already took over.
      await input.expeditionStore.updateProgress({
        learnerExpeditionId: input.learnerExpeditionId,
        expectedOperationId: fenceToken,
        currentOperationId: null,
        currentOperationType: null
      });
      throw error;
    }
    await input.expeditionStore.updateProgress({
      learnerExpeditionId: input.learnerExpeditionId,
      expectedOperationId: fenceToken,
      status: "failed",
      failureMessage: generationFailureMessage(error)
    });
    throw error;
  }
}

// Transient vs. deterministic exhaustion, decided over the transport's classified
// attempt trail (duck-typed via StageErrorDetail — no infrastructure import). Only a
// trail made ENTIRELY of infrastructure failures (network, timeout, HTTP 5xx/429) is
// transient; any model deviation (schema-invalid, no tool call, …) means retrying the
// same prompt is the budget the transport already spent, so fail immediately.
export function isTransientGenerationError(error: unknown): boolean {
  const attempts = stageErrorAttempts(error);
  if (!attempts || attempts.length === 0) return false;
  return attempts.every((attempt) =>
    attempt.kind === "network"
    || attempt.kind === "timeout"
    || (attempt.kind === "http" && (attempt.status === 429 || (attempt.status !== undefined && attempt.status >= 500)))
  );
}

function stageErrorAttempts(error: unknown): ForcedToolFailureAttempt[] | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const detail = (error as { stageErrorDetail?: StageErrorDetail }).stageErrorDetail;
  return detail?.attempts;
}

function generationFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "Scouting failed. Try again later.";
}
