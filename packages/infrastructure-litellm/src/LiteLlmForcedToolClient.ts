import { deepStripNullBytes } from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ForcedToolFailureAttempt, StageErrorDetail, StageErrorReporting } from "@lrnki/ports";
import { ZodError, type ZodType } from "zod";

installNodeOperationTagContext();

export type JsonSchema = Record<string, unknown>;
export type ToolMessage = { role: "system" | "user" | "assistant"; content: string };

type LiteLlmResponse = {
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
};

export class LiteLlmForcedToolClient {
  // `temperature`/`seed` are the determinism lever (TODO 1). When set, every
  // forced-tool call samples greedily with a fixed seed so the neural stages
  // (discovery/admission/claims) stop drifting across re-runs. Left unset, the
  // client stays a neutral transport at the model's default sampling — the
  // composition root chooses the policy, not this transport.
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number; temperature?: number; seed?: number }) {}

  async call<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T>; tags?: string[]; maxRetries?: number }): Promise<T> {
    // Retry budget for transient model deviations (zero/multiple tool calls,
    // malformed arguments, network blips) — a Zod validation failure inside
    // `callOnce` throws into this loop and re-prompts. A per-call `maxRetries`
    // lets one stage tighten the budget (e.g. ordering: first call + one corrective
    // re-prompt); otherwise fall back to the constructor value. Fail closed once exhausted.
    const maxRetries = input.maxRetries ?? this.options.maxRetries ?? 2;
    let lastError: unknown;
    // Per-attempt redacted failure trail (ADR-0006 fail-closed, made inspectable). On
    // exhaustion this rides out on the thrown error so the operator timeline can show WHY
    // a stage failed. Captured here at the model-output boundary — the same rule-6 seam
    // that strips NUL bytes — so no schema value or unbounded blob escapes.
    const attempts: ForcedToolFailureAttempt[] = [];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callOnce(input);
      } catch (error) {
        lastError = error;
        attempts.push(classifyForcedToolFailure(attempt, error));
        if (attempt < maxRetries) {
          // Rate limits (429) need a real cooldown window, not a 500ms blip —
          // back off exponentially and longer than for ordinary deviations.
          const status = error instanceof LiteLlmHttpError ? error.status : undefined;
          const base = status === 429 ? 2000 : 500;
          await delay(base * 2 ** attempt);
        }
      }
    }
    throw new ForcedToolExhaustionError(input.toolName, input.model, attempts, lastError);
  }

  private async callOnce<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T>; tags?: string[] }): Promise<T> {
    const operationTag = currentOperationTag();
    const tags = [...(input.tags ?? []), ...(operationTag ? [operationTag] : [])];
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: [{ type: "function", function: { name: input.toolName, description: input.toolDescription, parameters: input.parameters, strict: true } }],
        tool_choice: { type: "function", function: { name: input.toolName } },
        ...(this.options.temperature !== undefined ? { temperature: this.options.temperature } : {}),
        ...(this.options.seed !== undefined ? { seed: this.options.seed } : {}),
        // LiteLLM persists the per-call stage tag plus the ambient operation tag in
        // `LiteLLM_SpendLogs`. The transport only labels requests; it never owns usage.
        ...(tags.length ? { metadata: { tags } } : {})
      })
    });
    if (!response.ok) throw new LiteLlmHttpError(response.status);
    const payload = await response.json() as LiteLlmResponse;
    const calls = (payload.choices?.[0]?.message?.tool_calls ?? []).filter((call) => call?.function?.name === input.toolName);
    // Forced tool_choice should yield exactly one matching call; tolerate the model
    // emitting the same tool more than once by taking the first valid arguments.
    if (calls.length === 0) throw new ForcedToolNoCallError(input.toolName);
    const argumentsText = calls[0]?.function?.arguments;
    if (!argumentsText) throw new ForcedToolNoArgumentsError();
    // The model can emit an escaped ` ` in its JSON arguments, which JSON.parse
    // turns into a real NUL byte that PostgreSQL `text` columns reject downstream
    // (e.g. an evidence quote). Strip it from every string at this single rule-6
    // model-output boundary so no neural stage's arguments carry one. A raw
    // (unescaped) NUL would make JSON.parse throw first and fail closed via retry.
    let parsed: unknown;
    try {
      parsed = deepStripNullBytes(JSON.parse(argumentsText));
    } catch {
      throw new ForcedToolInvalidJsonError(argumentsText);
    }
    try {
      return input.validator.parse(parsed);
    } catch (error) {
      // Carry the offending arguments so `call` can attach a redacted snippet + the
      // violated schema PATHS (never the values) to the inspectable failure detail.
      if (error instanceof ZodError) throw new ForcedToolSchemaInvalidError(argumentsText, error);
      throw error;
    }
  }
}

// Typed forced-tool deviations thrown inside `callOnce`. They carry the raw arguments
// text where one exists so `call` can redact it once at exhaustion; they are internal
// to the retry loop and never escape the client (the loop wraps the last one in a
// `ForcedToolExhaustionError`).
class ForcedToolNoCallError extends Error {
  constructor(readonly toolName: string) {
    super(`Expected a forced tool call: ${toolName}.`);
    this.name = "ForcedToolNoCallError";
  }
}

class ForcedToolNoArgumentsError extends Error {
  constructor() {
    super("Forced tool call did not include arguments.");
    this.name = "ForcedToolNoArgumentsError";
  }
}

class ForcedToolInvalidJsonError extends Error {
  constructor(readonly argumentsText: string) {
    super("Forced tool call arguments were not valid JSON.");
    this.name = "ForcedToolInvalidJsonError";
  }
}

class ForcedToolSchemaInvalidError extends Error {
  constructor(readonly argumentsText: string, readonly zodError: ZodError) {
    super("Forced tool call arguments failed schema validation.");
    this.name = "ForcedToolSchemaInvalidError";
  }
}

// The terminal error thrown once the retry budget is exhausted (ADR-0006 fail closed).
// It is an ordinary `Error` for every existing caller (message + cause), and ALSO carries
// the ports-defined `stageErrorDetail` so the application can persist a redacted, structured
// reason WITHOUT importing this class — `bracketStage` duck-types `StageErrorReporting`.
export class ForcedToolExhaustionError extends Error implements StageErrorReporting {
  readonly stageErrorDetail: StageErrorDetail;

  constructor(
    readonly toolName: string,
    readonly model: string,
    readonly attempts: ForcedToolFailureAttempt[],
    cause: unknown
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Forced tool call "${toolName}" failed after ${attempts.length} attempt(s): ${reason}`);
    this.name = "ForcedToolExhaustionError";
    this.cause = cause;
    this.stageErrorDetail = {
      kind: "forced_tool_exhaustion",
      message: this.message,
      toolName,
      model,
      attempts
    };
  }
}

export class LiteLlmHttpError extends Error {
  constructor(readonly status: number) {
    super(`LiteLLM request failed with ${status}.`);
    this.name = "LiteLlmHttpError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cap for a redacted arguments snippet — bounded so an operator sees the shape of the
// malformed output without persisting an unbounded blob.
const SNIPPET_CAP = 500;

// Redact model arguments for safe inspection: strip control characters (incl. NUL),
// collapse whitespace, and truncate to a bounded length. The "safe" in "safely redacted".
function redactArgumentSnippet(argumentsText: string): string {
  const cleaned = argumentsText.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > SNIPPET_CAP ? `${cleaned.slice(0, SNIPPET_CAP)}…[truncated]` : cleaned;
}

// Classify one caught forced-tool failure into a redacted, serializable attempt record.
// Schema-invalid attempts carry the violated PATHS (never the offending values) plus a
// bounded redacted snippet of the arguments; invalid JSON carries the snippet only.
function classifyForcedToolFailure(attempt: number, error: unknown): ForcedToolFailureAttempt {
  if (error instanceof LiteLlmHttpError) return { attempt, kind: "http", status: error.status };
  if (error instanceof ForcedToolNoCallError) return { attempt, kind: "no_tool_call" };
  if (error instanceof ForcedToolNoArgumentsError) return { attempt, kind: "no_arguments" };
  if (error instanceof ForcedToolInvalidJsonError) {
    return { attempt, kind: "invalid_json", redactedSnippet: redactArgumentSnippet(error.argumentsText) };
  }
  if (error instanceof ForcedToolSchemaInvalidError) {
    const schemaIssuePaths = error.zodError.issues.map((issue) => issue.path.join("."));
    return {
      attempt,
      kind: "schema_invalid",
      schemaIssuePaths,
      redactedSnippet: redactArgumentSnippet(error.argumentsText)
    };
  }
  return { attempt, kind: "other" };
}
