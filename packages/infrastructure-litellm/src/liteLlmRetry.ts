import type { ForcedToolFailureAttempt } from "@lrnki/ports";

export class LiteLlmHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs?: number) {
    super(`LiteLLM request failed with ${status}.`);
    this.name = "LiteLlmHttpError";
  }
}

const RATE_LIMIT_BACKOFF_BASE_MS = 15_000;
const RATE_LIMIT_BACKOFF_CAP_MS = 120_000;
const TRANSIENT_BACKOFF_BASE_MS = 500;

export function liteLlmHttpErrorFor(response: Response): LiteLlmHttpError {
  return new LiteLlmHttpError(
    response.status,
    parseRetryAfterMs(response.headers.get("retry-after"))
  );
}

// RFC 9110 permits either delay-seconds or an HTTP-date. Keep this parser pure enough for
// deterministic tests; malformed/past values simply fall back to the bounded local policy.
export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) {
    const milliseconds = Number(normalized) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  const dateMs = Date.parse(normalized);
  if (!Number.isFinite(dateMs) || dateMs <= nowMs) return undefined;
  return dateMs - nowMs;
}

// The one transport retry/backoff/classification loop shared by the forced-tool and
// embedding clients (rule 18: their previous inline copies are deleted). Two policies
// live here:
// - Backoff: 429 gets a jittered cooldown window (up to a 15s base) vs. 500ms for ordinary
//   blips, exponential per attempt.
// - TERMINAL timeouts: a header/body timeout means the server may have completed the
//   call — blind-retrying at the transport pays for the same expensive LLM call twice
//   (the fda1509c incident shape). Timeout-class failures make exactly ONE HTTP call
//   and surface immediately to the layer that owns the attempt budget (the generation
//   supervisor). Connection-refused/reset/DNS failures stay retryable: no request
//   reached the server, so a retry cannot duplicate spend.
export type TransportAttemptClassifier = (attempt: number, error: unknown) => ForcedToolFailureAttempt;

const TIMEOUT_NETWORK_CODES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

// Classify one transport-level failure; returns undefined for anything that is not a
// transport concern (the caller adds its own client-specific kinds on top).
export function classifyTransportFailure(attempt: number, error: unknown): ForcedToolFailureAttempt | undefined {
  if (error instanceof LiteLlmHttpError) {
    return {
      attempt,
      kind: "http",
      status: error.status,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {})
    };
  }
  const timeout = timeoutFailureCode(error);
  if (timeout) return { attempt, kind: "timeout", code: timeout };
  const networkCode = fetchFailureCode(error);
  if (networkCode) return { attempt, kind: "network", code: networkCode };
  return undefined;
}

export async function runWithTransportRetries<T>(input: {
  maxRetries: number;
  maxRateLimitRetries?: number;
  attemptOnce: (attempt: number, previousAttempt: ForcedToolFailureAttempt | undefined) => Promise<T>;
  classify: TransportAttemptClassifier;
  onExhausted: (attempts: ForcedToolFailureAttempt[], lastError: unknown) => never;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}): Promise<T> {
  const attempts: ForcedToolFailureAttempt[] = [];
  let ordinaryRetries = 0;
  let rateLimitRetries = 0;
  let lastError: unknown;
  for (;;) {
    const attempt = attempts.length;
    try {
      return await input.attemptOnce(attempt, attempts.at(-1));
    } catch (error) {
      lastError = error;
      const classified = input.classify(attempt, error);
      attempts.push(classified);
      // Terminal at the transport: the call may have completed server-side.
      if (classified.kind === "timeout") break;
      const rateLimited = classified.kind === "http" && classified.status === 429;
      const retriesUsed = rateLimited ? rateLimitRetries : ordinaryRetries;
      const retryLimit = rateLimited
        ? input.maxRateLimitRetries ?? input.maxRetries
        : input.maxRetries;
      if (retriesUsed >= retryLimit) break;
      if (rateLimited) rateLimitRetries += 1;
      else ordinaryRetries += 1;
      // Attempt numbers in the evidence trail remain global and chronological. Backoff is based on
      // the retry ordinal for this failure class so an intervening schema correction cannot inflate
      // a later provider cooldown.
      await (input.sleep ?? delay)(transportRetryDelayMs(
        { ...classified, attempt: retriesUsed },
        input.random
      ));
    }
  }
  return input.onExhausted(attempts, lastError);
}

export function transportRetryDelayMs(
  attempt: ForcedToolFailureAttempt,
  random: () => number = Math.random
): number {
  if (attempt.kind === "http" && attempt.status === 429) {
    const exponentialCeiling = Math.min(
      RATE_LIMIT_BACKOFF_CAP_MS,
      RATE_LIMIT_BACKOFF_BASE_MS * 2 ** attempt.attempt
    );
    // Equal jitter preserves a meaningful cooldown while spreading a concurrent bracket across
    // the upper half of its exponential window. A server Retry-After remains the minimum request;
    // the local cap keeps the whole operation bounded when a proxy sends an extreme value.
    const unit = Math.min(1, Math.max(0, random()));
    const jitteredDelay = Math.round(exponentialCeiling / 2 + unit * exponentialCeiling / 2);
    return Math.min(
      RATE_LIMIT_BACKOFF_CAP_MS,
      Math.max(jitteredDelay, attempt.retryAfterMs ?? 0)
    );
  }
  return TRANSIENT_BACKOFF_BASE_MS * 2 ** attempt.attempt;
}

// AbortSignal.timeout rejects with a `TimeoutError`-named error; undici's dispatcher
// header/body deadlines surface as a TypeError whose cause carries an UND_ERR_*_TIMEOUT
// code. Both mean "the request was in flight long enough that it may have completed".
function timeoutFailureCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "TimeoutError") {
    return "ABORT_TIMEOUT";
  }
  const code = fetchFailureCode(error);
  return code && TIMEOUT_NETWORK_CODES.has(code) ? code : undefined;
}

function fetchFailureCode(error: unknown): string | undefined {
  if (!(error instanceof TypeError)) return undefined;
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return undefined;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
