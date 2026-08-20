import { deepStripNullBytes } from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ForcedToolFailureAttempt, StageErrorDetail, StageErrorReporting } from "@lrnki/ports";
import { ZodError, type ZodType } from "zod";
import { createLiteLlmDispatcher, liteLlmFetch, withLiteLlmDispatcher } from "./liteLlmFetch";
import { classifyTransportFailure, LiteLlmHttpError, runWithTransportRetries } from "./liteLlmRetry";

export { LiteLlmHttpError } from "./liteLlmRetry";

installNodeOperationTagContext();

export type JsonSchema = Record<string, unknown>;
export type ToolMessage = { role: "system" | "user" | "assistant"; content: string };

type LiteLlmResponse = {
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
};

export class LiteLlmForcedToolClient {
  private readonly dispatcher;
  // `temperature`/`seed` are the determinism lever (TODO 1). When set, every
  // forced-tool call samples greedily with a fixed seed so the neural stages
  // (discovery/admission/claims) stop drifting across re-runs. Left unset, the
  // client stays a neutral transport at the model's default sampling — the
  // composition root chooses the policy, not this transport.
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number; temperature?: number; seed?: number }) {
    this.dispatcher = createLiteLlmDispatcher(options.timeoutMs);
  }

  async call<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T>; tags?: string[]; maxRetries?: number }): Promise<T> {
    // Retry budget for transient model deviations (zero/multiple tool calls,
    // malformed arguments, network blips) — a Zod validation failure inside
    // `callOnce` throws into this loop and re-prompts. A per-call `maxRetries`
    // lets one stage tighten the budget (e.g. ordering: first call + one corrective
    // re-prompt); otherwise fall back to the constructor value. Fail closed once exhausted.
    const maxRetries = input.maxRetries ?? this.options.maxRetries ?? 2;
    // The shared transport loop owns backoff (429 cooldown vs ordinary blips), the
    // per-attempt redacted failure trail (ADR-0006 fail-closed, made inspectable),
    // and terminal timeout classification (a timed-out call may have completed
    // server-side — never blind-retried here; the supervisor's attempt budget owns
    // re-runs). The trail rides out on the thrown error so the operator timeline
    // can show WHY a stage failed.
    let attemptMessages = input.messages;
    return runWithTransportRetries({
      maxRetries,
      attemptOnce: (_attempt, previousAttempt) => {
        if (previousAttempt && isCorrectableModelDeviation(previousAttempt.kind)) {
          attemptMessages = buildRetryMessages(input.messages, previousAttempt, input.toolName);
        }
        return this.callOnce({
          ...input,
          messages: attemptMessages
        });
      },
      classify: classifyForcedToolFailure,
      onExhausted: (attempts, lastError) => {
        throw new ForcedToolExhaustionError(input.toolName, input.model, attempts, lastError);
      }
    });
  }

  private async callOnce<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T>; tags?: string[] }): Promise<T> {
    const operationTag = currentOperationTag();
    const tags = [...(input.tags ?? []), ...(operationTag ? [operationTag] : [])];
    const response = await liteLlmFetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, withLiteLlmDispatcher({
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
    }, this.dispatcher));
    if (!response.ok) throw new LiteLlmHttpError(response.status);
    const payload = await response.json() as LiteLlmResponse;
    const toolCalls = payload.choices?.[0]?.message?.tool_calls ?? [];
    const calls = toolCalls.filter((call) => call?.function?.name === input.toolName);
    // Forced tool_choice should yield exactly one matching call; tolerate the model
    // emitting the same tool more than once by taking the first valid arguments.
    if (calls.length === 0) {
      throw new ForcedToolNoCallError(input.toolName, boundedObservedToolNames(toolCalls));
    }
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
  constructor(readonly toolName: string, readonly observedToolNames: string[]) {
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

// Cap for a redacted arguments snippet — bounded so an operator sees the shape of the
// malformed output without persisting an unbounded blob.
const SNIPPET_CAP = 500;

// Redact model arguments for safe inspection: strip control characters (incl. NUL),
// collapse whitespace, and truncate to a bounded length. The "safe" in "safely redacted".
function redactArgumentSnippet(argumentsText: string): string {
  const cleaned = argumentsText.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > SNIPPET_CAP ? `${cleaned.slice(0, SNIPPET_CAP)}…[truncated]` : cleaned;
}

function buildRetryMessages(
  messages: ToolMessage[],
  previousAttempt: ForcedToolFailureAttempt | undefined,
  requiredToolName: string
): ToolMessage[] {
  if (!previousAttempt || !isCorrectableModelDeviation(previousAttempt.kind)) return messages;
  if (previousAttempt.kind === "no_tool_call") {
    const observed = previousAttempt.observedToolNames?.length
      ? ` It called unknown tool name(s): ${previousAttempt.observedToolNames.join(", ")}.`
      : " It emitted no tool call.";
    return [
      ...messages,
      {
        role: "assistant",
        content: `The previous response did not call the required tool.${observed}`
      },
      {
        role: "user",
        content: `Call exactly ${requiredToolName}. Do not emit prose or call another tool. Return arguments that satisfy the provided schema.`
      }
    ];
  }
  if (previousAttempt.kind === "no_arguments") {
    return [
      ...messages,
      {
        role: "assistant",
        content: `The previous ${requiredToolName} call omitted its arguments.`
      },
      {
        role: "user",
        content: `Call exactly ${requiredToolName} with arguments that satisfy the provided schema.`
      }
    ];
  }
  const issueLine = previousAttempt.kind === "schema_invalid" && previousAttempt.schemaIssuePaths?.length
    ? `Violated schema paths: ${previousAttempt.schemaIssuePaths.join(", ")}.`
    : "The previous tool arguments were not valid JSON.";
  return [
    ...messages,
    {
      role: "assistant",
      content: `Previous tool arguments, redacted and truncated for correction: ${previousAttempt.redactedSnippet ?? "[unavailable]"}`
    },
    {
      role: "user",
      content: `${issueLine} Return exactly one valid ${requiredToolName} call that satisfies the provided schema.`
    }
  ];
}

function isCorrectableModelDeviation(kind: ForcedToolFailureAttempt["kind"]): boolean {
  return kind === "no_tool_call"
    || kind === "no_arguments"
    || kind === "invalid_json"
    || kind === "schema_invalid";
}

// Model output is untrusted even when it sits in a function-name slot. Keep only a
// tiny inspectable/corrective surface so a malformed response cannot inflate the
// persisted failure detail or the retry prompt.
function boundedObservedToolNames(
  calls: Array<{ function?: { name?: string } }>
): string[] {
  const names = calls
    .map((call) => call.function?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .map((name) => name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 100))
    .filter((name) => name.length > 0);
  return [...new Set(names)].slice(0, 5);
}

// Classify one caught forced-tool failure into a redacted, serializable attempt record.
// Schema-invalid attempts carry the violated PATHS (never the offending values) plus a
// bounded redacted snippet of the arguments; invalid JSON carries the snippet only.
function classifyForcedToolFailure(attempt: number, error: unknown): ForcedToolFailureAttempt {
  const transport = classifyTransportFailure(attempt, error);
  if (transport) return transport;
  if (error instanceof ForcedToolNoCallError) {
    return {
      attempt,
      kind: "no_tool_call",
      ...(error.observedToolNames.length ? { observedToolNames: error.observedToolNames } : {})
    };
  }
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
