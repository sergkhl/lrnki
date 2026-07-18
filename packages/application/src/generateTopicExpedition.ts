import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { GenerationClaimLostError } from "./generationClaimLost";
import { isTransientGenerationError } from "./generationFailureClassification";

// Topic Expedition generation — the deep post-claim lifecycle module (plan 2026-07-13-001,
// Candidate 3 of the 2026-07-11 architecture review). Constructed ONCE per process with
// narrow lifecycle-shaped adapters and invoked with only one expedition's lifecycle facts.
// Full DerivedGraphLayer / StudyItemBankGenerationResult artifacts stay behind their owning
// sub-operations: this module sees a concept count and a completion signal, and owns the
// claim-fencing protocol, phase order, Declared Domain persistence, readiness rule, and
// failure classification. Scheduling, staleness, attempt budgets, and row claiming stay in
// the shared generation supervisor (ADR-0029).

export type TopicExpeditionRequest = {
  learnerExpeditionId: string;
  enrichmentId: string;
  topic: string;
  declaredDomain: string | null;
};

export type TopicExpeditionGeneration = (request: TopicExpeditionRequest) => Promise<void>;

export function createTopicExpeditionGeneration(construction: {
  // The one store capability the lifecycle needs — the fenced progress write. Store
  // narrowing follows the completeDerivedGraphLayer precedent.
  expeditionProgress: Pick<LearnerExpeditionStorePort, "updateProgress">;
  // Synthetic Topic Generation, lifecycle-shaped: reports its concept count and delivers
  // the resolved Declared Domain through the fenced callback before completing.
  syntheticGeneration: (activity: {
    enrichmentId: string;
    topic: string;
    declaredDomain: string | null;
    onDeclaredDomain: (declaredDomain: string) => Promise<void>;
  }) => Promise<{ conceptCount: number }>;
  // Study Item Bank generation, completion-only. Readiness needs no item threshold:
  // a sparse valid bank is still ready (ADR-0026).
  studyItemBankGeneration: (activity: { enrichmentId: string }) => Promise<void>;
}): TopicExpeditionGeneration {
  return async (request) => {
    // Per-call lifecycle state: nothing below outlives this invocation, so the
    // supervisor's concurrent calls through one constructed generator cannot share
    // enrichment identity, fence, or domain state.
    const enrichmentId = request.enrichmentId;
    // The store atomically installed this enrichment id while claiming the row. Every
    // write verifies that same token; 0 rows means a competing claim took ownership.
    const fenceToken = enrichmentId;
    const fencedUpdate = async (update: Omit<Parameters<LearnerExpeditionStorePort["updateProgress"]>[0], "learnerExpeditionId" | "expectedOperationId">): Promise<void> => {
      const affected = await construction.expeditionProgress.updateProgress({
        learnerExpeditionId: request.learnerExpeditionId,
        expectedOperationId: fenceToken,
        ...update
      });
      if (affected === 0) {
        throw new GenerationClaimLostError(`Generation claim lost for expedition ${request.learnerExpeditionId}.`);
      }
    };
    // A best-effort terminal write: losing the fence (0 rows) or a store rejection here
    // just means someone else owns the row — the caught generation error stays the
    // meaningful rejection.
    const bestEffortUpdate = async (update: Omit<Parameters<LearnerExpeditionStorePort["updateProgress"]>[0], "learnerExpeditionId" | "expectedOperationId">): Promise<void> => {
      try {
        await construction.expeditionProgress.updateProgress({
          learnerExpeditionId: request.learnerExpeditionId,
          expectedOperationId: fenceToken,
          ...update
        });
      } catch {
        // Swallowed: the original generation error is rethrown by the caller.
      }
    };
    try {
      await fencedUpdate({
        status: "generating"
      });
      let resolvedDeclaredDomain = request.declaredDomain?.trim() ?? "";
      const { conceptCount } = await construction.syntheticGeneration({
        enrichmentId,
        topic: request.topic,
        declaredDomain: request.declaredDomain,
        onDeclaredDomain: async (declaredDomain) => {
          resolvedDeclaredDomain = declaredDomain;
          await fencedUpdate({ declaredDomain });
        }
      });
      // Readiness is trail-wide: an expedition is ready when its layer carries at least one
      // concept and a study bank. The summit is DERIVED at read time (ADR-0032), so there is
      // no target to persist — generation only fails loudly when no concepts were produced.
      if (conceptCount === 0) {
        throw new Error("Scouting produced no concepts.");
      }

      await fencedUpdate({
        currentOperationId: enrichmentId,
        currentOperationType: "study_items"
      });
      await construction.studyItemBankGeneration({ enrichmentId });
      await fencedUpdate({
        status: "ready",
        enrichmentId,
        declaredDomain: resolvedDeclaredDomain || request.declaredDomain,
        currentOperationId: null,
        currentOperationType: null,
        failureMessage: null
      });
    } catch (error) {
      // Lost claim: another worker owns the row now — write nothing.
      if (error instanceof GenerationClaimLostError) throw error;
      if (isTransientGenerationError(error)) {
        // Transient (network / 5xx / 429 / timeout) exhaustion: release the claim so the
        // supervisor's attempt budget governs re-runs — status stays `generating`, the
        // operation id is cleared, claimed_at is kept as natural backoff.
        await bestEffortUpdate({
          currentOperationId: null,
          currentOperationType: null
        });
        throw error;
      }
      await bestEffortUpdate({
        status: "failed",
        failureMessage: generationFailureMessage(error)
      });
      throw error;
    }
  };
}

function generationFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "Scouting failed. Try again later.";
}
