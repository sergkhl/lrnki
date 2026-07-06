import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ForcedToolFailureAttempt, StageErrorDetail, StageErrorReporting } from "@lrnki/ports";
import { createLiteLlmDispatcher, liteLlmFetch, withLiteLlmDispatcher } from "./liteLlmFetch";
import { classifyTransportFailure, LiteLlmHttpError, runWithTransportRetries } from "./liteLlmRetry";

// Embedding transport (plan U1, ADR-0012). The first embedding client since the CEP
// reset removed the old clustering tier. A SIBLING of LiteLlmForcedToolClient, not an
// extension of it: `/v1/embeddings` has a different request/response shape than
// `/v1/chat/completions` and no forced-tool envelope. It mirrors the forced-tool
// client's constructor options, retry/back-off, and `metadata.tags` forwarding so the
// transport contract stays uniform. The client stays a neutral forwarder — it never
// reads, sums, or persists spend; the application only LABELS requests with a stage tag.
//
// Fail-closed by construction (R13): a response whose vector count, dimensionality, or
// numeric content does not match the request throws, so the calling propose stage can
// treat the embedding signal as UNAVAILABLE and skip dedup rather than proposing pairs
// from a malformed signal. Embeddings only PROPOSE candidate pairs; a separate
// adjudicator decides each merge (AGENTS rule 20).
installNodeOperationTagContext();

type EmbeddingResponse = {
  data?: Array<{ embedding?: unknown; index?: unknown }>;
};

export class LiteLlmEmbeddingClient {
  private readonly dispatcher;

  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number }) {
    this.dispatcher = createLiteLlmDispatcher(options.timeoutMs);
  }

  async embed(input: { model: string; texts: string[]; tags?: string[] }): Promise<number[][]> {
    // No texts → no HTTP call; an empty embedding set is a valid (degenerate) result,
    // never an error.
    if (input.texts.length === 0) return [];
    // Shared transport retry loop (same posture as the forced-tool client): terminal
    // timeouts, classified per-attempt trail, 429-aware backoff.
    return runWithTransportRetries({
      maxRetries: this.options.maxRetries ?? 2,
      attemptOnce: () => this.embedOnce(input),
      classify: (attempt, error) => classifyTransportFailure(attempt, error) ?? { attempt, kind: "other" },
      onExhausted: (attempts, lastError) => {
        throw new EmbeddingExhaustionError(input.model, attempts, lastError);
      }
    });
  }

  private async embedOnce(input: { model: string; texts: string[]; tags?: string[] }): Promise<number[][]> {
    const operationTag = currentOperationTag();
    const tags = [...(input.tags ?? []), ...(operationTag ? [operationTag] : [])];
    const response = await liteLlmFetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/embeddings`, withLiteLlmDispatcher({
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: input.model,
        input: input.texts,
        // Same stage + ambient-operation spend labels as the forced-tool client.
        ...(tags.length ? { metadata: { tags } } : {})
      })
    }, this.dispatcher));
    if (!response.ok) throw new LiteLlmHttpError(response.status);
    const payload = await response.json() as EmbeddingResponse;
    const rows = payload.data;
    // One vector per input, fail closed otherwise (a partial response would silently
    // mis-align nodes to vectors).
    if (!Array.isArray(rows) || rows.length !== input.texts.length) {
      throw new Error(`Embedding response shape mismatch: expected ${input.texts.length} vectors, got ${Array.isArray(rows) ? rows.length : "none"}.`);
    }
    // Preserve input order: OpenAI-style responses may arrive out of order but carry an
    // `index`; restore the request order when present so vectors[i] is texts[i].
    const ordered = rows.every((row) => typeof row.index === "number")
      ? [...rows].sort((a, b) => (a.index as number) - (b.index as number))
      : rows;
    const vectors = ordered.map((row, i) => {
      const vector = row.embedding;
      if (!Array.isArray(vector) || vector.length === 0 || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
        throw new Error(`Embedding row ${i} is not a non-empty finite-number vector.`);
      }
      return vector as number[];
    });
    // Cosine similarity needs uniform dimensionality; a ragged response is malformed.
    const dimension = vectors[0]?.length ?? 0;
    if (vectors.some((vector) => vector.length !== dimension)) {
      throw new Error("Embedding response has inconsistent vector dimensions.");
    }
    return vectors;
  }
}

// Exhaustion carrier mirroring ForcedToolExhaustionError: the classified attempt
// trail rides out on the thrown error (and its duck-typed stageErrorDetail) so a
// failing embed stage is inspectable and transient-classifiable by the application.
export class EmbeddingExhaustionError extends Error implements StageErrorReporting {
  readonly stageErrorDetail: StageErrorDetail;

  constructor(
    readonly model: string,
    readonly attempts: ForcedToolFailureAttempt[],
    cause: unknown
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Embedding call to "${model}" failed after ${attempts.length} attempt(s): ${reason}`);
    this.name = "EmbeddingExhaustionError";
    this.cause = cause;
    this.stageErrorDetail = { kind: "other", message: this.message, model, attempts };
  }
}
